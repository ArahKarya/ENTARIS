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

  // Build DR (inventory) entries grouped by per-item-account.
  const debitByAccount = new Map<string, { amount: number; names: string[] }>();
  for (const invItem of invoice.items) {
    if (canDistribute && !invItem.inventoryItemId) continue;
    let drAccountId = inventoryAccount.id;
    if (invItem.inventoryItemId) {
      const linkedItem = invItemMap.get(invItem.inventoryItemId);
      if (linkedItem?.accountId) drAccountId = linkedItem.accountId;
    }
    const effective = effectiveAmountMap.get(invItem.id);
    const amt = effective ? effective.toNumber() : Number(invItem.amount);
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

  const jvNumber = `JV-${invoice.invoiceNumber}`;
  const debitJournalItems = Array.from(debitByAccount.entries()).map(([accountId, data]) => ({
    accountId,
    debit: data.amount,
    credit: 0,
    description: `Persediaan ${data.names.join(', ')}: ${invoice.invoiceNumber}`,
  }));

  const journalEntry = await tx.journalEntry.create({
    data: {
      entryNumber: jvNumber,
      date: parsedDate,
      narration: `Pembelian: ${invoice.invoiceNumber} - ${invoice.supplier.name}`,
      status: 'Submitted',
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      submittedAt: new Date(),
      items: {
        create: [
          ...debitJournalItems,
          { accountId: apAccount.id, partyId: body.partyId, debit: 0, credit: grandTotalNum, description: `Hutang: ${invoice.invoiceNumber}` },
        ],
      },
    },
  });

  const ledgerData = [
    ...debitJournalItems.map((d) => ({
      date: parsedDate, accountId: d.accountId, debit: d.debit, credit: 0,
      referenceType: 'JournalEntry', referenceId: journalEntry.id,
      description: d.description, fiscalYearId: fiscalYear.id,
    })),
    {
      date: parsedDate, accountId: apAccount.id, partyId: body.partyId,
      debit: 0, credit: grandTotalNum,
      referenceType: 'JournalEntry', referenceId: journalEntry.id,
      description: `Hutang: ${invoice.invoiceNumber}`, fiscalYearId: fiscalYear.id,
    },
  ];
  await tx.accountingLedgerEntry.createMany({ data: ledgerData });

  for (const [accountId, data] of debitByAccount.entries()) {
    await updateAccountBalance(tx, accountId, data.amount, 0);
  }
  await updateAccountBalance(tx, apAccount.id, 0, grandTotalNum);
  await recalcPartyOutstanding(tx, body.partyId);

  // Stock movements + WAC recalc + COGS backfill settlement.
  for (const item of invoice.items) {
    const invItemId = item.inventoryItemId;
    if (!invItemId) continue;

    const inventoryItem = await tx.inventoryItem.findUnique({ where: { id: invItemId } });
    if (!inventoryItem || !inventoryItem.isActive) continue;

    const movementNumber = await generateDocumentNumber(tx, 'SM', parsedDate, fiscalYear.id);
    const effectiveAmount = effectiveAmountMap.get(item.id) ?? new Decimal(item.amount.toString());
    const qty = new Decimal(item.quantity.toString());
    const unitCost = qty.gt(0)
      ? effectiveAmount.div(qty).toDecimalPlaces(2).toNumber()
      : 0;
    const totalValue = effectiveAmount.toNumber();

    const newAvgCost = calcWeightedAverage(
      inventoryItem.currentStock,
      inventoryItem.averageCost,
      Number(item.quantity),
      unitCost,
    );

    let lineWarehouseId: string | null = item.warehouseId ?? null;
    if (!lineWarehouseId) {
      const defaultWh = await tx.warehouse.findFirst({ where: { isDefault: true, isActive: true } });
      lineWarehouseId = defaultWh?.id ?? null;
    }
    if (!lineWarehouseId) {
      throw new BusinessError(
        `Item "${inventoryItem.name}" perlu dipilihkan gudang tujuan. Tidak ada gudang default — pilih manual di baris item.`,
      );
    }

    await tx.inventoryItem.update({
      where: { id: inventoryItem.id },
      data: {
        currentStock: { increment: Number(item.quantity) },
        averageCost: newAvgCost,
      },
    });
    await tx.inventoryStock.upsert({
      where: { itemId_warehouseId: { itemId: inventoryItem.id, warehouseId: lineWarehouseId } },
      create: { itemId: inventoryItem.id, warehouseId: lineWarehouseId, currentStock: Number(item.quantity) },
      update: { currentStock: { increment: Number(item.quantity) } },
    });

    await tx.stockMovement.create({
      data: {
        movementNumber,
        date: parsedDate,
        itemId: inventoryItem.id,
        warehouseId: lineWarehouseId,
        movementType: 'In',
        quantity: Number(item.quantity),
        unitCost,
        totalValue,
        referenceType: 'PurchaseInvoice',
        referenceId: invoice.id,
        notes: `Auto dari ${invoice.invoiceNumber}`,
        createdById: userId,
        fiscalYearId: fiscalYear.id,
      },
    });

    logger.info(
      { invoiceId: invoice.id, itemId: inventoryItem.id, qty: Number(item.quantity) },
      'Auto stock movement from purchase',
    );

    await settleCogsBackfillForItem(tx, {
      itemId: inventoryItem.id,
      qtyAvailable: Number(item.quantity),
      unitCostNow: unitCost,
      fiscalYearId: fiscalYear.id,
      userId,
      settleDate: parsedDate,
      source: { type: 'PurchaseInvoice', refId: invoice.id, refNo: invoice.invoiceNumber },
    });
  }

  return invoice;
}
