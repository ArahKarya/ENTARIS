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
    // Batch picker: stock-out, sales line and COGS lock to the linked inbound batch's unitCost
    // instead of WAC.
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
 * Submit a sales invoice: revenue JE (one CR per revenue account, optional TAX_OUTPUT CR and
 * PPh DR, one AR DR) plus a separate COGS JE. Caller wraps in $transaction; BusinessError maps to 4xx.
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
  if (!party) throw new BusinessError('Data customer tidak ditemukan.');
  if (!party.isActive) throw new BusinessError('Customer sudah tidak aktif.');

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
    sourceMovementId: string | null;  // batch picker
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

  // Goods leave only via Surat Jalan: every line with inventoryItemId must link to a submitted
  // deliveryOrderItemId (no double stock-out). Service / free-account lines need no link.
  const orphanInventoryLines = resolvedItems.filter(
    (it) => it.inventoryItemId && !it.deliveryOrderItemId,
  );
  if (orphanInventoryLines.length > 0) {
    // Ambil nama item supaya pesan errornya jelas — staff tahu line mana.
    const offenders = await tx.inventoryItem.findMany({
      where: { id: { in: orphanInventoryLines.map((l) => l.inventoryItemId!) } },
      select: { id: true, name: true },
    });
    const names = orphanInventoryLines
      .map((l) => offenders.find((o) => o.id === l.inventoryItemId)?.name ?? l.itemName)
      .filter((n, i, arr) => arr.indexOf(n) === i)
      .join(', ');
    throw new BusinessError(
      `Item inventori "${names}" tidak bisa di-invoice langsung. ` +
      `Buat Surat Jalan (Delivery Order) terlebih dahulu. Invoice hanya bisa di-generate dari DO yang sudah submit. ` +
      `Stok keluar lewat DO, bukan invoice.`,
    );
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
      // Invoice bernilai Rp 0 (sumbangan/sampel/bonus) tidak punya tagihan →
      // langsung Paid supaya tidak menggantung sebagai invoice terbuka.
      // Efek GL tetap: HPP + pengurangan persediaan lewat jurnal COGS.
      status: grandTotalNum === 0 ? 'Paid' : 'Submitted',
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

  // COGS: stock-out already happened at DO submit, so COGS uses the unitCost locked on the
  // DO's stockMovement (the cost of the goods actually delivered).
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

    // From-DO branch
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
          `Surat Jalan ${doItem.deliveryOrder.doNumber} sudah dibatalkan dan tidak bisa di-invoice.`,
        );
      }
      if (doItem.deliveryOrder.invoiceId && doItem.deliveryOrder.invoiceId !== invoice.id) {
        throw new BusinessError(
          `Surat Jalan ${doItem.deliveryOrder.doNumber} sudah ada di invoice lain.`,
        );
      }
      // averageCost is only a defensive fallback when the DO line has no stock movement.
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

    // Direct sale is closed; orphan inventory lines are rejected earlier, this throw is defensive.
    throw new BusinessError(
      `Item "${inventoryItem.name}" harus di-kirim via Surat Jalan terlebih dahulu. ` +
      `Direct-sale dari invoice sudah ditutup.`,
    );
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
    for (const [acctId, data] of cogsByAccount) {
      await updateAccountBalance(tx, acctId, 0, data.amount);
    }
  }

  return invoice;
}
