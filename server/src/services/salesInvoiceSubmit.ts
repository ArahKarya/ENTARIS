import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { systemAccounts } from './systemAccounts';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

// Mirrors the Zod-parsed body from CreateSalesInvoiceSchema. Kept inline to
// avoid pulling Zod's inferred type into the service signature (the route
// already validated by the time we get here).
export interface SubmitSalesInvoiceInput {
  date: string;
  partyId: string;
  items: Array<{
    itemName: string;
    itemType?: 'product' | 'service';
    inventoryItemId?: string | null;
    warehouseId?: string | null;
    serviceItemId?: string | null;
    accountId?: string | null;
    quantity: number;
    unit?: string | null;
    rate: number;
    discount?: number;
    taxPct?: number;
    pphPct?: number;
    description?: string | null;
    // When set, this line was billed from an existing DO. Skip new stock-out
    // (DO already did it); COGS uses the unitCost locked on the DO's
    // stockMovement (not the current averageCost).
    deliveryOrderItemId?: string | null;
    // Phase 5: batch picker. When set, stock-out + sales line + COGS calc
    // all lock to the unitCost of the linked inbound batch (vs WAC fallback).
    sourceMovementId?: string | null;
  }>;
  dueDate?: string | null;
  notes?: string | null;
  customerRefNo?: string | null;
  taxPct?: number;
  potongan?: number;
  biayaLain?: number;
  labelPotongan?: string | null;
  labelBiaya?: string | null;
  terms?: string | null;
  allowNegativeStock?: boolean;
}

/**
 * Submit a sales invoice + post every downstream side-effect:
 *   - validate party, stock availability (per-item, aggregated)
 *   - compute line amounts, PPN, PPh, grandTotal in Decimal
 *   - create salesInvoice + line items
 *   - build multi-account revenue JE (one CR per revenue account, plus
 *     optional TAX_OUTPUT and PPh DR), 1 AR DR
 *   - post ALE rows + update account balances
 *   - recalc party outstanding
 *   - for inventory-linked lines: deduct stock (item-total + per-warehouse),
 *     create stockMovement, queue COGS backfill on negative stock
 *   - post separate COGS JE
 *
 * Caller wraps in $transaction. Throws BusinessError on validation failures
 * (caller maps to 4xx). Returns the created invoice with customer + items.
 */
export async function submitSalesInvoiceInTx(
  tx: Tx,
  body: SubmitSalesInvoiceInput,
  userId: string,
) {
  const parsedDate = new Date(body.date);
  if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');
  const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

  const party = await tx.party.findUnique({ where: { id: body.partyId } });
  if (!party) throw new BusinessError('Data pelanggan tidak ditemukan.');
  if (!party.isActive) throw new BusinessError('Pelanggan sudah tidak aktif.');

  const arAccount = await systemAccounts.getAccount('AR');
  const salesAccount = await systemAccounts.getAccount('SALES');
  const serviceRevenueAccount = await systemAccounts.getAccount('SERVICE_REVENUE');
  const inventoryAccount = await systemAccounts.getAccount('INVENTORY');
  // Prefer HPP Beras (5.1) over the generic COGS parent (5).
  const hppBerasAccount = await tx.account.findFirst({ where: { accountNumber: '5.1' } });
  const cogsAccount = hppBerasAccount || await systemAccounts.getAccount('COGS');

  // Pre-fetch all referenced account/serviceItem rows in batch — avoids
  // 2N findUnique calls inside the transaction.
  const customAccountIds = [...new Set(
    body.items.map((i) => i.accountId).filter((id): id is string => !!id),
  )];
  const serviceItemIds = [...new Set(
    body.items.map((i) => i.serviceItemId).filter((id): id is string => !!id),
  )];
  const [customAccounts, serviceItemsBatch] = await Promise.all([
    customAccountIds.length
      ? tx.account.findMany({ where: { id: { in: customAccountIds } }, select: { id: true } })
      : Promise.resolve([]),
    serviceItemIds.length
      ? tx.serviceItem.findMany({
          where: { id: { in: serviceItemIds } },
          select: { id: true, accountId: true },
        })
      : Promise.resolve([]),
  ]);
  const customAccountSet = new Set(customAccounts.map((a) => a.id));
  const serviceItemMap = new Map(serviceItemsBatch.map((s) => [s.id, s]));

  const resolvedItems: Array<{
    itemName: string; itemType: string; inventoryItemId: string | null;
    warehouseId: string | null;
    serviceItemId: string | null; quantity: number; unit: string;
    rate: number; discount: number; amount: number; taxPct: number; pphPct: number;
    accountId: string; description: string | null;
    deliveryOrderItemId: string | null;
    sourceMovementId: string | null;  // Phase 5: batch picker
  }> = [];

  for (const item of body.items) {
    const itemAmount = new Decimal(item.quantity)
      .mul(new Decimal(item.rate))
      .mul(new Decimal(1).minus(new Decimal(item.discount ?? 0).div(100)))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();

    let lineAccountId = salesAccount.id;
    if (item.accountId && customAccountSet.has(item.accountId)) {
      lineAccountId = item.accountId;
    } else if (item.serviceItemId) {
      const svc = serviceItemMap.get(item.serviceItemId);
      if (svc) lineAccountId = svc.accountId;
    } else if (item.itemType === 'service') {
      lineAccountId = serviceRevenueAccount.id;
    }

    resolvedItems.push({
      itemName: item.itemName,
      itemType: item.itemType || 'product',
      inventoryItemId: item.inventoryItemId || null,
      warehouseId: item.warehouseId || null,
      serviceItemId: item.serviceItemId || null,
      quantity: item.quantity,
      unit: item.unit || 'pcs',
      rate: item.rate,
      discount: item.discount ?? 0,
      amount: itemAmount,
      taxPct: item.taxPct ?? 0,
      pphPct: item.pphPct ?? 0,
      accountId: lineAccountId,
      description: item.description || null,
      deliveryOrderItemId: item.deliveryOrderItemId || null,
      sourceMovementId: item.sourceMovementId || null,
    });
  }

  // Stock availability check: aggregate qty per inventoryItemId. Skip
  // from-DO lines (those decrements already happened at DO submit; we'd
  // double-count current stock).
  const qtyByItem = new Map<string, number>();
  for (const it of resolvedItems) {
    if (!it.inventoryItemId) continue;
    if (it.deliveryOrderItemId) continue;
    qtyByItem.set(it.inventoryItemId, (qtyByItem.get(it.inventoryItemId) ?? 0) + it.quantity);
  }
  if (qtyByItem.size > 0) {
    const invItems = await tx.inventoryItem.findMany({
      where: { id: { in: Array.from(qtyByItem.keys()) } },
      select: { id: true, name: true, unit: true, currentStock: true, isActive: true },
    });
    for (const inv of invItems) {
      const needed = qtyByItem.get(inv.id) ?? 0;
      if (!inv.isActive) throw new BusinessError(`Item '${inv.name}' tidak aktif.`);
      if (Number(inv.currentStock) < needed) {
        if (!body.allowNegativeStock) {
          throw new BusinessError(
            `Stok '${inv.name}' tidak cukup. Tersedia: ${Number(inv.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${inv.unit}, dibutuhkan: ${needed.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${inv.unit}.`
          );
        }
        logger.warn(
          { itemId: inv.id, itemName: inv.name, available: Number(inv.currentStock), needed, partyId: body.partyId },
          'Sales invoice posted with insufficient stock (allowNegativeStock=true)',
        );
      }
    }
  }

  const subtotal = resolvedItems.reduce((sum, item) => sum.plus(new Decimal(item.amount)), new Decimal(0));
  const taxAmount = resolvedItems.reduce(
    (sum, item) => sum.plus(new Decimal(item.amount).mul(new Decimal(item.taxPct).div(100))),
    new Decimal(0),
  ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const pphAmount = resolvedItems.reduce(
    (sum, item) => sum.plus(new Decimal(item.amount).mul(new Decimal(item.pphPct).div(100))),
    new Decimal(0),
  ).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const grandTotal = subtotal
    .plus(taxAmount)
    .minus(pphAmount)
    .minus(new Decimal(body.potongan ?? 0))
    .plus(new Decimal(body.biayaLain ?? 0))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const grandTotalNum = grandTotal.toNumber();
  const invoiceNumber = await generateDocumentNumber(tx, 'SI', parsedDate, fiscalYear.id);

  const invoice = await tx.salesInvoice.create({
    data: {
      invoiceNumber,
      date: parsedDate,
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      partyId: body.partyId,
      grandTotal: grandTotalNum,
      outstanding: grandTotalNum,
      taxPct: 0,
      potongan: body.potongan ?? 0,
      biayaLain: body.biayaLain ?? 0,
      labelPotongan: body.labelPotongan || null,
      labelBiaya: body.labelBiaya || null,
      terms: body.terms || null,
      customerRefNo: body.customerRefNo || null,
      status: 'Submitted',
      notes: body.notes || null,
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      submittedAt: new Date(),
      items: { create: resolvedItems },
    },
    include: { customer: true, items: true },
  });

  // Build multi-account revenue JE.
  const revenueByAccount = new Map<string, Decimal>();
  for (const ri of resolvedItems) {
    const prev = revenueByAccount.get(ri.accountId) ?? new Decimal(0);
    revenueByAccount.set(ri.accountId, prev.plus(new Decimal(ri.amount)));
  }
  // potongan/biayaLain → allocate to the largest revenue account so JE balances.
  const adjustmentAmount = new Decimal(body.biayaLain ?? 0).minus(new Decimal(body.potongan ?? 0));
  if (!adjustmentAmount.isZero()) {
    let primaryAccountId = salesAccount.id;
    let maxAmount = new Decimal(0);
    for (const [accId, amt] of revenueByAccount) {
      if (amt.greaterThan(maxAmount)) { maxAmount = amt; primaryAccountId = accId; }
    }
    const prev = revenueByAccount.get(primaryAccountId) ?? new Decimal(0);
    revenueByAccount.set(primaryAccountId, prev.plus(adjustmentAmount));
  }

  const creditJournalItems: Array<{ accountId: string; debit: number; credit: number; description: string }> = [];
  for (const [accId, amt] of revenueByAccount) {
    const creditNum = amt.toDecimalPlaces(2).toNumber();
    if (creditNum === 0) continue;
    const acc = await tx.account.findUnique({ where: { id: accId }, select: { name: true } });
    creditJournalItems.push({
      accountId: accId, debit: 0, credit: creditNum,
      description: `${acc?.name ?? 'Penjualan'}: ${invoice.invoiceNumber}`,
    });
  }
  const taxAmountNum = taxAmount.toNumber();
  if (taxAmountNum > 0) {
    const taxOutputAccount = await systemAccounts.getAccount('TAX_OUTPUT');
    creditJournalItems.push({
      accountId: taxOutputAccount.id, debit: 0, credit: taxAmountNum,
      description: `PPN Keluaran: ${invoice.invoiceNumber}`,
    });
  }

  const debitJournalItems: Array<{ accountId: string; debit: number; credit: number; description: string; partyId?: string }> = [
    { accountId: arAccount.id, partyId: body.partyId, debit: grandTotalNum, credit: 0, description: `Piutang: ${invoice.invoiceNumber}` },
  ];
  const pphAmountNum = pphAmount.toNumber();
  if (pphAmountNum > 0) {
    const pphAccount = await tx.account.findFirst({ where: { accountNumber: '1.5.4' } });
    if (pphAccount) {
      debitJournalItems.push({
        accountId: pphAccount.id, debit: pphAmountNum, credit: 0,
        description: `PPh Penjualan: ${invoice.invoiceNumber}`,
      });
    }
  }

  const jvNumber = `JV-${invoice.invoiceNumber}`;
  const journalEntry = await tx.journalEntry.create({
    data: {
      entryNumber: jvNumber,
      date: parsedDate,
      narration: `Penjualan: ${invoice.invoiceNumber} - ${invoice.customer.name}`,
      status: 'Submitted',
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      submittedAt: new Date(),
      items: { create: [...debitJournalItems, ...creditJournalItems] },
    },
  });

  const ledgerData = [
    ...debitJournalItems.map((di) => ({
      date: parsedDate, accountId: di.accountId, partyId: di.partyId, debit: di.debit, credit: 0,
      referenceType: 'JournalEntry', referenceId: journalEntry.id,
      description: di.description, fiscalYearId: fiscalYear.id,
    })),
    ...creditJournalItems.map((ci) => ({
      date: parsedDate, accountId: ci.accountId, debit: 0, credit: ci.credit,
      referenceType: 'JournalEntry', referenceId: journalEntry.id,
      description: ci.description, fiscalYearId: fiscalYear.id,
    })),
  ];
  await tx.accountingLedgerEntry.createMany({ data: ledgerData });

  for (const di of debitJournalItems) {
    await updateAccountBalance(tx, di.accountId, di.debit, 0);
  }
  for (const ci of creditJournalItems) {
    await updateAccountBalance(tx, ci.accountId, 0, ci.credit);
  }
  await recalcPartyOutstanding(tx, body.partyId);

  // ── Inventory deduction + COGS ──
  // Two paths per inventory-linked line:
  //   (a) Direct sale: decrement stock + create stockMovement Out; COGS uses
  //       current averageCost. (Existing behavior.)
  //   (b) From-DO: stock-out already happened at DO submit. We just need to
  //       compute COGS using the unitCost LOCKED on the DO's stockMovement,
  //       which represents the actual cost of the goods physically delivered.
  let totalCogs = new Decimal(0);
  const cogsByAccount = new Map<string, { amount: number; names: string[] }>();
  // Collect DO ids touched by this invoice so we can mark them as Invoiced
  // after the loop.
  const linkedDOIds = new Set<string>();
  for (const item of invoice.items) {
    const invItemId = item.inventoryItemId;
    if (!invItemId) continue;

    const inventoryItem = await tx.inventoryItem.findUnique({ where: { id: invItemId } });
    if (!inventoryItem || !inventoryItem.isActive) continue;

    const qty = Number(item.quantity);

    // ── From-DO branch ────────────────────────────────────────────
    if (item.deliveryOrderItemId) {
      const doItem = await tx.deliveryOrderItem.findUnique({
        where: { id: item.deliveryOrderItemId },
        include: { stockMovement: true, deliveryOrder: true },
      });
      if (!doItem) {
        throw new BusinessError(`Baris dari Surat Jalan tidak ditemukan (id=${item.deliveryOrderItemId}).`);
      }
      if (doItem.deliveryOrder.status === 'Cancelled') {
        throw new BusinessError(
          `Surat Jalan ${doItem.deliveryOrder.doNumber} sudah dibatalkan — tidak bisa di-invoice.`,
        );
      }
      if (doItem.deliveryOrder.invoiceId && doItem.deliveryOrder.invoiceId !== invoice.id) {
        throw new BusinessError(
          `Surat Jalan ${doItem.deliveryOrder.doNumber} sudah ada di invoice lain.`,
        );
      }
      // Locked unitCost from the DO stockMovement is the truth for COGS here.
      // Fallback to averageCost only if the DO had no inventory link (shouldn't
      // happen for an inventory-linked invoice line, but defensive).
      const cogsUnitCost = doItem.stockMovement
        ? Number(doItem.stockMovement.unitCost)
        : Math.max(0, Number(inventoryItem.averageCost));
      const cogsAmount = new Decimal(qty).times(new Decimal(cogsUnitCost)).toDecimalPlaces(2).toNumber();

      totalCogs = totalCogs.plus(new Decimal(cogsAmount));
      const invAcctId = inventoryItem.accountId || inventoryAccount.id;
      const existing = cogsByAccount.get(invAcctId);
      if (existing) {
        existing.amount += cogsAmount;
        existing.names.push(item.itemName);
      } else {
        cogsByAccount.set(invAcctId, { amount: cogsAmount, names: [item.itemName] });
      }

      linkedDOIds.add(doItem.deliveryOrderId);
      logger.info(
        { invoiceId: invoice.id, doId: doItem.deliveryOrderId, doItemId: doItem.id, qty, lockedUnitCost: cogsUnitCost },
        'Sales invoice line billed from existing delivery order',
      );
      continue; // skip the direct-sale path
    }

    // ── Direct-sale branch (existing behavior) ─────────────────────
    const stockBefore = Number(inventoryItem.currentStock);
    const avgCost = Number(inventoryItem.averageCost);
    // Phase 5: if a specific batch was picked for this line, use the batch's
    // locked unit cost for COGS. Otherwise fall back to WAC.
    let cogsUnitCost = avgCost > 0 ? avgCost : 0;
    let lineUnitCostLoaded: number | null = null;
    if (item.sourceMovementId) {
      const batch = await tx.stockMovement.findUnique({
        where: { id: item.sourceMovementId },
        select: {
          id: true, itemId: true, isCancelled: true, movementType: true,
          unitCost: true, unitCostLoaded: true,
        },
      });
      if (!batch) {
        throw new BusinessError(`Batch sumber tidak ditemukan untuk item "${inventoryItem.name}".`);
      }
      if (batch.itemId !== inventoryItem.id) {
        throw new BusinessError(`Batch sumber tidak cocok dengan item "${inventoryItem.name}".`);
      }
      if (batch.isCancelled) {
        throw new BusinessError(`Batch sumber "${inventoryItem.name}" sudah dibatalkan.`);
      }
      if (batch.movementType !== 'In' && batch.movementType !== 'AdjustmentIn') {
        throw new BusinessError(`Batch sumber untuk "${inventoryItem.name}" bukan stok masuk.`);
      }
      cogsUnitCost = Number(batch.unitCost);
      lineUnitCostLoaded = batch.unitCostLoaded != null ? Number(batch.unitCostLoaded) : null;
    }
    const cogsAmount = new Decimal(qty).times(new Decimal(cogsUnitCost)).toDecimalPlaces(2).toNumber();

    if (body.allowNegativeStock && stockBefore < qty) {
      const deficitQty = qty - Math.max(0, stockBefore);
      await tx.cogsBackfillQueue.create({
        data: {
          salesInvoiceId: invoice.id,
          salesInvoiceItemId: item.id,
          inventoryItemId: inventoryItem.id,
          qtyPending: deficitQty,
          qtyOriginal: deficitQty,
          costAtSale: cogsUnitCost,
          fiscalYearId: fiscalYear.id,
          status: 'Pending',
        },
      });
      logger.info(
        { invoiceId: invoice.id, itemId: inventoryItem.id, deficitQty, costAtSale: cogsUnitCost },
        'COGS backfill queued (negative stock sale)',
      );
    }

    let lineWarehouseId: string | null = item.warehouseId ?? null;
    if (!lineWarehouseId) {
      const defaultWh = await tx.warehouse.findFirst({ where: { isDefault: true, isActive: true } });
      lineWarehouseId = defaultWh?.id ?? null;
    }
    if (!lineWarehouseId) {
      throw new BusinessError(
        `Item "${inventoryItem.name}" perlu dipilihkan gudang sumber. Tidak ada gudang default — pilih manual di baris item.`,
      );
    }

    await tx.inventoryItem.update({
      where: { id: inventoryItem.id },
      data: { currentStock: { decrement: qty } },
    });
    await tx.inventoryStock.upsert({
      where: { itemId_warehouseId: { itemId: inventoryItem.id, warehouseId: lineWarehouseId } },
      create: { itemId: inventoryItem.id, warehouseId: lineWarehouseId, currentStock: -qty },
      update: { currentStock: { decrement: qty } },
    });

    const movementNumber = await generateDocumentNumber(tx, 'SM', parsedDate, fiscalYear.id);
    await tx.stockMovement.create({
      data: {
        movementNumber,
        date: parsedDate,
        itemId: inventoryItem.id,
        warehouseId: lineWarehouseId,
        movementType: 'Out',
        quantity: qty,
        unitCost: cogsUnitCost,
        totalValue: cogsAmount,
        // Phase 5: batch back-link for /items/:id/batches consumption tracking
        sourceMovementId: item.sourceMovementId || null,
        referenceType: 'SalesInvoice',
        referenceId: invoice.id,
        notes: `Auto dari ${invoice.invoiceNumber}`,
        createdById: userId,
        fiscalYearId: fiscalYear.id,
      },
    });

    // Phase 5: persist the loaded HPP snapshot to the sales line for Phase 6
    // "loaded margin" reports. lineUnitCostLoaded is null when no batch picked
    // or when the batch had no loaded HPP (e.g. purchase batch, not from
    // production output).
    if (lineUnitCostLoaded != null) {
      await tx.salesInvoiceItem.update({
        where: { id: item.id },
        data: { unitCostLoaded: lineUnitCostLoaded },
      });
    }

    totalCogs = totalCogs.plus(new Decimal(cogsAmount));

    const invAcctId = inventoryItem.accountId || inventoryAccount.id;
    const existing = cogsByAccount.get(invAcctId);
    if (existing) {
      existing.amount += cogsAmount;
      existing.names.push(item.itemName);
    } else {
      cogsByAccount.set(invAcctId, { amount: cogsAmount, names: [item.itemName] });
    }

    logger.info({ invoiceId: invoice.id, itemId: inventoryItem.id, qty }, 'Auto stock deduction from sales');
  }

  // Mark every touched DO as Invoiced (link back to this invoice).
  if (linkedDOIds.size > 0) {
    await tx.deliveryOrder.updateMany({
      where: { id: { in: Array.from(linkedDOIds) } },
      data: { invoiceId: invoice.id, invoicedAt: new Date() },
    });
  }

  const totalCogsNum = totalCogs.toDecimalPlaces(2).toNumber();
  if (totalCogsNum > 0) {
    const cogsJvNumber = `JV-COGS-${invoice.invoiceNumber}`;
    const cogsJournalItems: { accountId: string; debit: number; credit: number; description: string }[] = [
      { accountId: cogsAccount.id, debit: totalCogsNum, credit: 0, description: `HPP: ${invoice.invoiceNumber}` },
    ];
    for (const [acctId, data] of cogsByAccount) {
      cogsJournalItems.push({
        accountId: acctId,
        debit: 0, credit: data.amount,
        description: `Persediaan keluar ${data.names.join(', ')}: ${invoice.invoiceNumber}`,
      });
    }

    const cogsJournal = await tx.journalEntry.create({
      data: {
        entryNumber: cogsJvNumber,
        date: parsedDate,
        narration: `HPP Penjualan: ${invoice.invoiceNumber} - ${invoice.customer.name}`,
        status: 'Submitted',
        fiscalYearId: fiscalYear.id,
        createdBy: userId,
        submittedAt: new Date(),
        items: { create: cogsJournalItems },
      },
    });

    await tx.accountingLedgerEntry.createMany({
      data: cogsJournalItems.map((ji) => ({
        date: parsedDate,
        accountId: ji.accountId,
        debit: ji.debit,
        credit: ji.credit,
        referenceType: 'JournalEntry',
        referenceId: cogsJournal.id,
        description: ji.description,
        fiscalYearId: fiscalYear.id,
      })),
    });

    await updateAccountBalance(tx, cogsAccount.id, totalCogsNum, 0);
    for (const [, data] of cogsByAccount) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    }
    for (const [acctId, data] of cogsByAccount) {
      await updateAccountBalance(tx, acctId, 0, data.amount);
    }
  }

  return invoice;
}
