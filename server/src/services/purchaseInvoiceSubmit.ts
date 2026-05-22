import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { calcWeightedAverage } from '../utils/weightedAverage';
import { systemAccounts } from './systemAccounts';
import { settleCogsBackfillForItem } from './cogsBackfillService';
import { computePurchaseItem, sumPotonganItem } from './purchaseInvoiceCalc';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

export interface SubmitPurchaseInvoiceInput {
  date: string;
  partyId: string;
  items: Array<{
    itemName: string;
    inventoryItemId?: string | null;
    warehouseId?: string | null;
    quantity: number;
    unit?: string | null;
    rate: number;
    discount?: number;
    taxPct?: number;
    pphPct?: number;
    potonganItem?: number;
    kualitas?: string | null;
    refaksi?: number | null;
    timbanganTruk?: number | null;
    timbanganDiterima?: number | null;
    nomorMobil?: string | null;
    description?: string | null;
    itemType?: string;
    /** Optional: link to STT/BPB line. When set, PI does NOT create a stock
     * movement for this line (STT already did). PI posts variance against
     * STT's provisional cost instead. */
    goodsReceiptItemId?: string | null;
  }>;
  dueDate?: string | null;
  notes?: string | null;
  biayaLain?: number;
  taxPct?: number;
  potongan?: number;
}

/**
 * Submit a purchase invoice + post downstream side-effects:
 *   - validate supplier, parse fiscal year
 *   - compute per-item hargaAkhir (PPN/PPh/potonganItem folded in)
 *   - allocate landed cost (biayaLain + non-linked items) across linked items
 *   - create purchaseInvoice + line items
 *   - build multi-account DR JE (per item-specific inventory account) + CR AP
 *   - post ALE rows + update balances
 *   - recalc party outstanding
 *   - for inventory-linked lines: increment stock (item-total + per-warehouse),
 *     recompute averageCost (WAC), create stockMovement
 *   - auto-settle pending COGS backfill (negative-stock sales that came before
 *     this purchase)
 */
export async function submitPurchaseInvoiceInTx(
  tx: Tx,
  body: SubmitPurchaseInvoiceInput,
  userId: string,
) {
  const parsedDate = new Date(body.date);
  if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');
  const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

  const party = await tx.party.findUnique({ where: { id: body.partyId } });
  if (!party) throw new BusinessError('Data supplier tidak ditemukan.');
  if (!party.isActive) throw new BusinessError('Supplier sudah tidak aktif.');

  const apAccount = await systemAccounts.getAccount('AP');
  const inventoryAccount = await systemAccounts.getAccount('INVENTORY');
  // Phase 3: lazy-load only when needed (STT-linked path)
  let accruedAccount: { id: string; name: string } | null = null;

  // Pre-validate any STT-linked items. Reject early if STT cancelled,
  // already invoiced, or supplier mismatch.
  const sttItemIds = body.items
    .map((i) => i.goodsReceiptItemId)
    .filter((id): id is string => !!id);
  const sttItemMap = new Map<string, any>();
  if (sttItemIds.length > 0) {
    const sttItems = await tx.goodsReceiptItem.findMany({
      where: { id: { in: sttItemIds } },
      include: { goodsReceipt: true, invoiceItem: { select: { id: true } } },
    });
    for (const grItem of sttItems) {
      if (grItem.goodsReceipt.status === 'Cancelled') {
        throw new BusinessError(`STT ${grItem.goodsReceipt.sttNumber} sudah dibatalkan.`);
      }
      if (grItem.goodsReceipt.partyId !== body.partyId) {
        throw new BusinessError(
          `Supplier baris dari STT ${grItem.goodsReceipt.sttNumber} berbeda dengan supplier invoice.`,
        );
      }
      if (grItem.invoiceItem) {
        throw new BusinessError(
          `Baris STT ${grItem.goodsReceipt.sttNumber} sudah di-invoice sebelumnya.`,
        );
      }
      sttItemMap.set(grItem.id, grItem);
    }
  }

  // ─── Policy (2026-05): barang masuk HANYA via STT/BPB ─────────────────
  // Setiap line dengan inventoryItemId WAJIB link ke goodsReceiptItemId
  // (line dari STT yg sudah submit). Direct-purchase ditutup supaya:
  //   1. Tidak ada dobel-tambah stok antara STT dan invoice.
  //   2. Audit fisik gampang: arus barang murni via STT; invoice = tagihan.
  //   3. Variance harga (STT provisional vs PI aktual) tertangani lewat
  //      jalur STT-linked yg sudah ada (5.11 Selisih Harga Pembelian).
  // Service items / line akun bebas (tanpa inventoryItemId) tetap bisa.
  const orphanInventoryLines = body.items.filter(
    (it) => it.inventoryItemId && !it.goodsReceiptItemId,
  );
  if (orphanInventoryLines.length > 0) {
    const orphanIds = orphanInventoryLines
      .map((l) => l.inventoryItemId)
      .filter((id): id is string => !!id);
    const offenders = await tx.inventoryItem.findMany({
      where: { id: { in: orphanIds } },
      select: { id: true, name: true },
    });
    const names = orphanInventoryLines
      .map((l) => offenders.find((o) => o.id === l.inventoryItemId)?.name ?? l.itemName)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .join(', ');
    throw new BusinessError(
      `Item inventori "${names}" tidak bisa di-invoice langsung. ` +
      `Buat STT / BPB (Bukti Penerimaan Barang) terlebih dahulu — invoice hanya bisa di-generate dari STT yang sudah submit. ` +
      `Stok masuk lewat STT, bukan invoice.`,
    );
  }

  const itemsWithAmount = body.items.map((item) => {
    const calc = computePurchaseItem(item);
    return {
      ...item,
      effectiveQty: calc.effectiveQuantity,
      computedAmount: calc.hargaAkhir,
    };
  });
  const itemsSubtotal = itemsWithAmount.reduce(
    (sum, item) => sum.plus(item.computedAmount),
    new Decimal(0),
  );
  const headerPotongan = sumPotonganItem(body.items);
  const grandTotal = itemsSubtotal
    .plus(new Decimal(body.biayaLain ?? 0))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const grandTotalNum = grandTotal.toNumber();
  const invoiceNumber = await generateDocumentNumber(tx, 'PI', parsedDate, fiscalYear.id);

  // Pre-fetch inventory items to resolve per-item accounts.
  const invItemIds = body.items.map((i) => i.inventoryItemId).filter(Boolean) as string[];
  const inventoryItems = invItemIds.length > 0
    ? await tx.inventoryItem.findMany({ where: { id: { in: invItemIds } } })
    : [];
  const invItemMap = new Map(inventoryItems.map((i) => [i.id, i]));

  const invoice = await tx.purchaseInvoice.create({
    data: {
      invoiceNumber,
      date: parsedDate,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      partyId: body.partyId,
      grandTotal: grandTotalNum,
      outstanding: grandTotalNum,
      taxPct: 0,
      potongan: headerPotongan.toNumber(),
      biayaLain: body.biayaLain ?? 0,
      status: 'Submitted',
      notes: body.notes || null,
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      submittedAt: new Date(),
      items: {
        create: itemsWithAmount.map((item) => {
          const linkedItem = item.inventoryItemId ? invItemMap.get(item.inventoryItemId) : null;
          const itemAccountId = linkedItem?.accountId || inventoryAccount.id;
          return {
            itemName: item.itemName,
            inventoryItemId: item.inventoryItemId || null,
            warehouseId: item.warehouseId || null,
            quantity: item.effectiveQty.toNumber(),
            unit: item.unit || 'pcs',
            rate: item.rate,
            discount: item.discount ?? 0,
            amount: item.computedAmount.toNumber(),
            taxPct: item.taxPct ?? 0,
            pphPct: item.pphPct ?? 0,
            potonganItem: item.potonganItem ?? 0,
            kualitas: item.kualitas ?? null,
            refaksi: item.refaksi ?? null,
            timbanganTruk: item.timbanganTruk ?? null,
            timbanganDiterima: item.timbanganDiterima ?? null,
            nomorMobil: item.nomorMobil ?? null,
            accountId: itemAccountId,
            description: item.description || null,
            goodsReceiptItemId: item.goodsReceiptItemId || null,
          };
        }),
      },
    },
    include: { supplier: true, items: true },
  });

  // Landed cost allocation.
  const linkedInvItems = invoice.items.filter((i) => i.inventoryItemId);
  const nonLinkedInvItems = invoice.items.filter((i) => !i.inventoryItemId);
  const linkedSubtotal = linkedInvItems.reduce(
    (s, i) => s.plus(new Decimal(i.amount.toString())), new Decimal(0));
  const nonLinkedTotal = nonLinkedInvItems.reduce(
    (s, i) => s.plus(new Decimal(i.amount.toString())), new Decimal(0));
  const adjustmentRemainder = new Decimal(body.biayaLain ?? 0);
  const landedCostPool = nonLinkedTotal.plus(adjustmentRemainder);
  const canDistribute = linkedInvItems.length > 0 && linkedSubtotal.gt(0) && !landedCostPool.isZero();

  const effectiveAmountMap = new Map<string, Decimal>();
  if (canDistribute) {
    let allocatedSoFar = new Decimal(0);
    linkedInvItems.forEach((invItem, idx) => {
      const original = new Decimal(invItem.amount.toString());
      let share: Decimal;
      if (idx === linkedInvItems.length - 1) {
        share = landedCostPool.minus(allocatedSoFar);
      } else {
        share = landedCostPool.mul(original).div(linkedSubtotal).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
        allocatedSoFar = allocatedSoFar.plus(share);
      }
      effectiveAmountMap.set(invItem.id, original.plus(share));
    });
  }

  // Build DR (Persediaan) entries grouped by per-item-account — only for
  // lines yang TIDAK linked ke STT. Untuk yang linked, akrual sudah dibooking
  // di STT submit; PI hanya reverse accrual + landed cost adjustment ke
  // Persediaan (bukan 5.11 — sesuai policy 2026-05-20: harga per unit di
  // stockMovement HARUS reflect total biaya PI termasuk "Resiko Macan"
  // dan biaya_lain header. Variance diserap ke inventory, bukan expense).
  const debitByAccount = new Map<string, { amount: number; names: string[] }>();
  let accruedReversal = new Decimal(0); // DR Hutang Belum Tagih (provisional total)

  // Track landed cost adjustment per STT-linked line untuk update
  // stockMovement + averageCost + GL DR Persediaan.
  const landedAdjustments: {
    invItem: typeof invoice.items[number];
    grItem: any;
    qty: Decimal;
    provisionalTotal: Decimal;
    effectiveAmount: Decimal;
    delta: Decimal;  // effective - provisional (positive = landed cost lebih tinggi)
  }[] = [];

  for (const invItem of invoice.items) {
    const effective = effectiveAmountMap.get(invItem.id);
    const amt = effective ? effective.toNumber() : Number(invItem.amount);

    if (invItem.goodsReceiptItemId) {
      // STT-linked line: stock + Persediaan sudah dibooking saat STT submit
      // pakai sttQty (qty fisik diterima sebelum refaksi). Saat refaksi
      // diterapkan di PI, qty efektif yg dibayar (invItem.quantity) bisa
      // lebih kecil dari sttQty — tapi qty di stockMovement TETAP sttQty
      // (stok fisik tidak berubah). Rumus user (2026-05-20):
      //   harga akhir per Kg = total invoice PI / qty STT (qty fisik)
      // Provisional yg sudah ter-DR Persediaan = sttQty × provisionalCost.
      // Landed cost adjustment = effectiveAmount - provisionalTotal.
      const grItem = sttItemMap.get(invItem.goodsReceiptItemId);
      if (!grItem) continue; // shouldn't happen (pre-validated)
      const sttQty = new Decimal(grItem.quantity.toString());
      const provisionalCost = new Decimal(grItem.lockedUnitCost.toString());
      const provisionalTotal = sttQty.times(provisionalCost).toDecimalPlaces(2);
      const effectiveAmount = new Decimal(amt);
      const delta = effectiveAmount.minus(provisionalTotal);
      accruedReversal = accruedReversal.plus(provisionalTotal);
      landedAdjustments.push({ invItem, grItem, qty: sttQty, provisionalTotal, effectiveAmount, delta });

      // DR/CR Persediaan @ delta ke akun item terkait (1.4.x kalau ada,
      // fallback ke INVENTORY default). Diserap ke debitByAccount supaya
      // ter-aggregate per-akun seperti line non-linked.
      if (!delta.isZero()) {
        let drAccountId = inventoryAccount.id;
        if (invItem.inventoryItemId) {
          const linkedItem = invItemMap.get(invItem.inventoryItemId);
          if (linkedItem?.accountId) drAccountId = linkedItem.accountId;
        }
        const deltaNum = delta.toDecimalPlaces(2).toNumber();
        const existing = debitByAccount.get(drAccountId);
        // delta positif = DR (inventory naik). Negatif = CR (inventory turun)
        // dihandle nanti di journal-build by negative debit conversion.
        if (existing) {
          existing.amount += deltaNum;
          existing.names.push(`adj-landed ${invItem.itemName}`);
        } else {
          debitByAccount.set(drAccountId, { amount: deltaNum, names: [`adj-landed ${invItem.itemName}`] });
        }
      }
      continue;
    }

    // Standalone/legacy line: post DR Persediaan as before.
    if (canDistribute && !invItem.inventoryItemId) continue;
    let drAccountId = inventoryAccount.id;
    if (invItem.inventoryItemId) {
      const linkedItem = invItemMap.get(invItem.inventoryItemId);
      if (linkedItem?.accountId) drAccountId = linkedItem.accountId;
    }
    const existing = debitByAccount.get(drAccountId);
    if (existing) {
      existing.amount += amt;
      existing.names.push(invItem.itemName);
    } else {
      debitByAccount.set(drAccountId, { amount: amt, names: [invItem.itemName] });
    }
  }
  // Fallback when no linked items: biayaLain → generic inventory account.
  if (!canDistribute && !adjustmentRemainder.isZero()) {
    const adjNum = adjustmentRemainder.toNumber();
    const existing = debitByAccount.get(inventoryAccount.id);
    if (existing) existing.amount += adjNum;
    else debitByAccount.set(inventoryAccount.id, { amount: adjNum, names: ['Biaya tambahan'] });
  }

  // Lazy-load accrual account kalau ada STT-linked line. Variance account
  // (5.11) tidak lagi diperlukan — landed cost adjustment masuk Persediaan.
  if (!accruedReversal.isZero()) {
    accruedAccount = await systemAccounts.getAccount('ACCRUED_PAYABLE');
  }

  // Per policy 2026-05-20: landed cost diserap ke Persediaan (lihat block
  // STT-linked di atas). Tidak ada lagi posting ke 5.11 Selisih Harga.
  // Normalisasi: kalau ada akun Persediaan dgn delta negatif (landed cost
  // LEBIH RENDAH dari provisional → inventory turun), pindah ke
  // creditJournalItems supaya JE tetap balanced.
  const creditJournalItems: { accountId: string; partyId?: string | null; debit: number; credit: number; description: string }[] = [];
  for (const [accountId, data] of Array.from(debitByAccount.entries())) {
    if (data.amount < 0) {
      creditJournalItems.push({
        accountId,
        debit: 0,
        credit: Math.abs(data.amount),
        description: `Persediaan adj. landed cost ${data.names.join(', ')}: ${invoice.invoiceNumber}`,
      });
      debitByAccount.delete(accountId);
    }
  }

  const jvNumber = `JV-${invoice.invoiceNumber}`;
  const debitJournalItems: { accountId: string; partyId?: string | null; debit: number; credit: number; description: string }[] =
    Array.from(debitByAccount.entries()).map(([accountId, data]) => ({
      accountId,
      debit: data.amount,
      credit: 0,
      description: `Persediaan ${data.names.join(', ')}: ${invoice.invoiceNumber}`,
    }));

  // STT-linked accrual reversal: DR Hutang Belum Tagih @ provisional total.
  if (!accruedReversal.isZero() && accruedAccount) {
    debitJournalItems.push({
      accountId: accruedAccount.id,
      partyId: body.partyId,
      debit: accruedReversal.toNumber(),
      credit: 0,
      description: `Reverse accrual STT: ${invoice.invoiceNumber}`,
    });
  }

  // Always: CR Hutang Usaha @ grand total.
  creditJournalItems.push({
    accountId: apAccount.id,
    partyId: body.partyId,
    debit: 0,
    credit: grandTotalNum,
    description: `Hutang: ${invoice.invoiceNumber}`,
  });

  const allJeItems = [...debitJournalItems, ...creditJournalItems];

  const journalEntry = await tx.journalEntry.create({
    data: {
      entryNumber: jvNumber,
      date: parsedDate,
      narration: `Pembelian: ${invoice.invoiceNumber} - ${invoice.supplier.name}`,
      status: 'Submitted',
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      submittedAt: new Date(),
      items: { create: allJeItems },
    },
  });

  const ledgerData = allJeItems.map((it) => ({
    date: parsedDate,
    accountId: it.accountId,
    partyId: it.partyId ?? null,
    debit: it.debit,
    credit: it.credit,
    referenceType: 'JournalEntry',
    referenceId: journalEntry.id,
    description: it.description,
    fiscalYearId: fiscalYear.id,
  }));
  await tx.accountingLedgerEntry.createMany({ data: ledgerData });

  for (const it of allJeItems) {
    await updateAccountBalance(tx, it.accountId, it.debit, it.credit);
  }
  await recalcPartyOutstanding(tx, body.partyId);

  // Mark linked STTs as Invoiced (header-level shortcut).
  if (sttItemMap.size > 0) {
    const grIds = Array.from(new Set(
      Array.from(sttItemMap.values()).map((gri) => gri.goodsReceiptId),
    ));
    await tx.goodsReceipt.updateMany({
      where: { id: { in: grIds }, invoiceId: null },
      data: { invoiceId: invoice.id, invoicedAt: parsedDate },
    });
  }

  // ─── Landed cost: update stockMovement + averageCost per STT-linked item ─
  // Policy 2026-05-20: setelah PI submit, stockMovement.unit_cost +
  // total_value disetel ke effective amount (provisional + landed cost
  // share). inventoryItem.averageCost ikut di-recalc supaya WAC + COGS
  // future konsisten. Stock fisik (qty) tidak berubah.
  for (const adj of landedAdjustments) {
    if (adj.delta.isZero()) continue;
    if (!adj.grItem?.stockMovementId) continue;

    // Effective unit_cost = effectiveAmount / qty
    const newUnitCost = adj.qty.gt(0)
      ? adj.effectiveAmount.div(adj.qty).toDecimalPlaces(4).toNumber()
      : 0;

    await tx.stockMovement.update({
      where: { id: adj.grItem.stockMovementId },
      data: {
        unitCost: newUnitCost,
        totalValue: adj.effectiveAmount.toDecimalPlaces(2).toNumber(),
      },
    });

    // Adjust averageCost. delta sudah ter-DR ke Persediaan via JE di atas,
    // jadi total inventory value naik delta. WAC = (oldStock * oldAvg + delta)
    // / oldStock. Kalau currentStock = 0 (item baru atau habis), skip
    // recalc — itu skenario aneh tapi defensive.
    if (adj.invItem.inventoryItemId) {
      const fresh = await tx.inventoryItem.findUnique({
        where: { id: adj.invItem.inventoryItemId },
        select: { currentStock: true, averageCost: true },
      });
      if (fresh && Number(fresh.currentStock) !== 0) {
        const stock = new Decimal(fresh.currentStock.toString());
        const oldAvg = new Decimal(fresh.averageCost.toString());
        const newAvg = stock.times(oldAvg).plus(adj.delta).div(stock).toDecimalPlaces(2);
        await tx.inventoryItem.update({
          where: { id: adj.invItem.inventoryItemId },
          data: { averageCost: newAvg.toNumber() },
        });
      }
    }
  }

  // Direct-purchase path (line tanpa goodsReceiptItemId) sudah di-tolak
  // di validation awal (orphanInventoryLines guard). STT-linked lines:
  // stok + averageCost sudah ter-update di STT submit, jadi tidak ada
  // pekerjaan lagi di sini. Variance harga STT vs PI sudah dihandle di
  // accrual reversal block sebelumnya.

  return invoice;
}
