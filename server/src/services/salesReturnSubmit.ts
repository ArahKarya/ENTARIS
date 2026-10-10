import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { systemAccounts } from './systemAccounts';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

// Mirrors CreateSalesReturnSchema (already Zod-validated at the route).
export interface SubmitSalesReturnInput {
  salesInvoiceId: string;
  date: string;
  items: Array<{
    salesInvoiceItemId: string;
    quantity: number;
    restock?: boolean;
    warehouseId?: string | null;
  }>;
  reason?: string | null;
  notes?: string | null;
}

/**
 * Submit a sales return (credit note) against one sales invoice.
 *
 * Posts, inside the caller's $transaction:
 *   - main JE (JV-RN-...): DR 4.3 Retur Penjualan (subtotal) + DR PPN Keluaran
 *     (tax) / CR Piutang (porsi yang mengurangi outstanding) + CR Uang Muka
 *     Pelanggan (sisa → kredit pelanggan)
 *   - for restock lines: StockMovement In (referenceType 'SalesReturn'),
 *     increment stock, and a COGS-reversal JE (JV-COGS-RN-...): DR Persediaan /
 *     CR HPP at the original loaded cost
 *   - a CustomerDeposit Payment row for the credit portion (no own JE — the
 *     liability is already CR'd by the main JE)
 *
 * Cost source priority per line: DO stockMovement.unitCost → invoice line
 * unitCostLoaded → item.averageCost.
 */
export async function submitSalesReturnInTx(
  tx: Tx,
  body: SubmitSalesReturnInput,
  userId: string,
) {
  const parsedDate = new Date(body.date);
  if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');
  const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

  const invoice = await tx.salesInvoice.findUnique({
    where: { id: body.salesInvoiceId },
    include: {
      customer: true,
      items: {
        include: {
          deliveryOrderItem: { include: { stockMovement: true } },
          inventoryItem: { select: { id: true, name: true, accountId: true, averageCost: true, isActive: true } },
        },
      },
    },
  });
  if (!invoice) throw new BusinessError('Invoice penjualan tidak ditemukan.');
  if (invoice.status === 'Cancelled') throw new BusinessError('Invoice sudah dibatalkan, tidak bisa diretur.');
  if (invoice.status === 'Draft') throw new BusinessError('Invoice masih draft, belum bisa diretur.');

  // Already-returned quantity per invoice line (non-cancelled returns) — guard.
  const priorReturns = await tx.salesReturnItem.groupBy({
    by: ['salesInvoiceItemId'],
    where: {
      salesInvoiceItemId: { in: invoice.items.map((i) => i.id) },
      salesReturn: { status: { not: 'Cancelled' } },
    },
    _sum: { quantity: true },
  });
  const returnedMap = new Map<string, number>(
    priorReturns.map((r) => [r.salesInvoiceItemId, Number(r._sum.quantity ?? 0)]),
  );

  // System / contra accounts.
  const arAccount = await systemAccounts.getAccount('AR');
  const customerDepositAccount = await systemAccounts.getAccount('CUSTOMER_DEPOSIT');
  const inventoryAccount = await systemAccounts.getAccount('INVENTORY');
  const hppBerasAccount = await tx.account.findFirst({ where: { accountNumber: '5.1' } });
  const cogsAccount = hppBerasAccount || (await systemAccounts.getAccount('COGS'));
  const returAccount = await tx.account.findFirst({ where: { accountNumber: '4.3' } });
  if (!returAccount) {
    throw new BusinessError('Akun "4.3 Retur Penjualan" tidak ditemukan di bagan akun.');
  }

  // Resolve & validate each return line
  const resolved: Array<{
    salesInvoiceItemId: string;
    inventoryItemId: string | null;
    warehouseId: string | null;
    accountId: string;
    itemName: string;
    quantity: number;
    unit: string;
    rate: number;
    discount: number;
    amount: number;
    taxPct: number;
    restock: boolean;
    unitCostLoaded: number | null;
    invAccountId: string | null;  // inventory account for COGS reversal credit
  }> = [];

  for (const line of body.items) {
    const src = invoice.items.find((i) => i.id === line.salesInvoiceItemId);
    if (!src) {
      throw new BusinessError(`Baris invoice tidak ditemukan (id=${line.salesInvoiceItemId}).`);
    }
    const alreadyReturned = returnedMap.get(src.id) ?? 0;
    const remaining = new Decimal(src.quantity.toString()).minus(alreadyReturned).toNumber();
    if (line.quantity > remaining + 1e-9) {
      throw new BusinessError(
        `Qty retur "${src.itemName}" (${line.quantity}) melebihi sisa yang bisa diretur (${remaining}).`,
      );
    }

    const discount = Number(src.discount);
    const rate = Number(src.rate);
    const amount = new Decimal(line.quantity)
      .mul(new Decimal(rate))
      .mul(new Decimal(1).minus(new Decimal(discount).div(100)))
      .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
      .toNumber();

    const restock = line.restock !== false && !!src.inventoryItemId;

    // Cost source priority for COGS reversal.
    let unitCost: number | null = null;
    if (src.deliveryOrderItem?.stockMovement) {
      unitCost = Number(src.deliveryOrderItem.stockMovement.unitCost);
    } else if (src.unitCostLoaded != null) {
      unitCost = Number(src.unitCostLoaded);
    } else if (src.inventoryItem) {
      unitCost = Math.max(0, Number(src.inventoryItem.averageCost));
    }

    resolved.push({
      salesInvoiceItemId: src.id,
      inventoryItemId: src.inventoryItemId,
      warehouseId: line.warehouseId || src.warehouseId || null,
      accountId: src.accountId,
      itemName: src.itemName,
      quantity: line.quantity,
      unit: src.unit,
      rate,
      discount,
      amount,
      taxPct: Number(src.taxPct),
      restock,
      unitCostLoaded: unitCost,
      invAccountId: src.inventoryItem?.accountId ?? inventoryAccount.id,
    });
  }

  // Totals
  const subtotal = resolved.reduce((s, r) => s.plus(new Decimal(r.amount)), new Decimal(0));
  const taxAmount = resolved
    .reduce((s, r) => s.plus(new Decimal(r.amount).mul(new Decimal(r.taxPct).div(100))), new Decimal(0))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const totalReturn = subtotal.plus(taxAmount).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const totalReturnNum = totalReturn.toNumber();
  // Retur qty-only (rate 0, mis. barang titipan pelanggan) valid selama minimal 1
  // baris punya qty>0 — hanya mengembalikan stok fisik, tanpa nilai piutang/kredit.
  const hasReturnedQty = resolved.some((r) => r.quantity > 0);
  if (totalReturnNum < 0) throw new BusinessError('Nilai retur tidak boleh negatif.');
  if (totalReturnNum === 0 && !hasReturnedQty) throw new BusinessError('Pilih minimal satu baris dengan qty > 0.');

  // AR vs credit split
  const outstanding = new Decimal(invoice.outstanding.toString());
  const arReduce = Decimal.min(totalReturn, outstanding).toDecimalPlaces(2);
  const arReduceNum = arReduce.toNumber();
  const creditPortion = totalReturn.minus(arReduce).toDecimalPlaces(2);
  const creditPortionNum = creditPortion.toNumber();

  const returnNumber = await generateDocumentNumber(tx, 'RN', parsedDate, fiscalYear.id);
  const salesReturn = await tx.salesReturn.create({
    data: {
      returnNumber,
      date: parsedDate,
      partyId: invoice.partyId,
      salesInvoiceId: invoice.id,
      status: 'Submitted',
      subtotal: subtotal.toDecimalPlaces(2).toNumber(),
      taxAmount: taxAmount.toNumber(),
      totalReturn: totalReturnNum,
      arReducedAmount: arReduceNum,
      creditCreatedAmount: creditPortionNum,
      reason: body.reason || null,
      notes: body.notes || null,
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      submittedAt: new Date(),
      items: {
        create: resolved.map((r) => ({
          salesInvoiceItemId: r.salesInvoiceItemId,
          inventoryItemId: r.inventoryItemId,
          warehouseId: r.warehouseId,
          accountId: r.accountId,
          itemName: r.itemName,
          quantity: r.quantity,
          unit: r.unit,
          rate: r.rate,
          discount: r.discount,
          amount: r.amount,
          taxPct: r.taxPct,
          restock: r.restock,
          unitCostLoaded: r.unitCostLoaded,
        })),
      },
    },
    include: { customer: true, items: true },
  });

  // Main reversal JE (JV-RN-...)
  const jeItems: Array<{ accountId: string; debit: number; credit: number; description: string; partyId?: string }> = [
    { accountId: returAccount.id, debit: subtotal.toDecimalPlaces(2).toNumber(), credit: 0, description: `Retur Penjualan: ${returnNumber}` },
  ];
  const taxAmountNum = taxAmount.toNumber();
  if (taxAmountNum > 0) {
    const taxOutputAccount = await systemAccounts.getAccount('TAX_OUTPUT');
    jeItems.push({ accountId: taxOutputAccount.id, debit: taxAmountNum, credit: 0, description: `PPN Keluaran (retur): ${returnNumber}` });
  }
  if (arReduceNum > 0) {
    jeItems.push({ accountId: arAccount.id, partyId: invoice.partyId, debit: 0, credit: arReduceNum, description: `Pengurang Piutang (retur): ${returnNumber}` });
  }
  if (creditPortionNum > 0) {
    jeItems.push({ accountId: customerDepositAccount.id, partyId: invoice.partyId, debit: 0, credit: creditPortionNum, description: `Kredit pelanggan dari retur: ${returnNumber}` });
  }

  const jvNumber = `JV-${returnNumber}`;
  const journalEntry = await tx.journalEntry.create({
    data: {
      entryNumber: jvNumber,
      date: parsedDate,
      narration: `Retur Penjualan: ${returnNumber} - ${invoice.customer.name}`,
      status: 'Submitted',
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      submittedAt: new Date(),
      items: { create: jeItems.map((j) => ({ accountId: j.accountId, partyId: j.partyId, debit: j.debit, credit: j.credit, description: j.description })) },
    },
  });
  await tx.accountingLedgerEntry.createMany({
    data: jeItems.map((j) => ({
      date: parsedDate, accountId: j.accountId, partyId: j.partyId, debit: j.debit, credit: j.credit,
      referenceType: 'JournalEntry', referenceId: journalEntry.id, description: j.description, fiscalYearId: fiscalYear.id,
    })),
  });
  for (const j of jeItems) {
    await updateAccountBalance(tx, j.accountId, j.debit, j.credit);
  }

  // Reduce invoice outstanding by the AR portion.
  if (arReduceNum > 0) {
    await tx.salesInvoice.update({
      where: { id: invoice.id },
      data: { outstanding: outstanding.minus(arReduce).toNumber() },
    });
  }
  await recalcPartyOutstanding(tx, invoice.partyId);

  // Credit portion → CustomerDeposit Payment (no own JE; liability already CR'd)
  let customerDepositId: string | null = null;
  if (creditPortionNum > 0) {
    const paymentNumber = await generateDocumentNumber(tx, 'PAY', parsedDate, fiscalYear.id);
    const deposit = await tx.payment.create({
      data: {
        paymentNumber,
        date: parsedDate,
        paymentType: 'CustomerDeposit',
        partyId: invoice.partyId,
        accountId: customerDepositAccount.id,
        amount: creditPortionNum,
        status: 'Submitted',
        referenceNo: returnNumber,
        notes: `Kredit dari Retur Penjualan ${returnNumber} (invoice ${invoice.invoiceNumber})`,
        fiscalYearId: fiscalYear.id,
        createdBy: userId,
        submittedAt: new Date(),
      },
    });
    customerDepositId = deposit.id;
    await tx.salesReturn.update({ where: { id: salesReturn.id }, data: { customerDepositId } });
    // Keep the cached deposit balance on the party in sync so the invoice UI
    // can offer 'Gunakan Uang Muka' for credit created by this return.
    await tx.party.update({
      where: { id: invoice.partyId },
      data: { customerDepositBalance: { increment: creditPortionNum } },
    });
  }

  // Stock-in + COGS reversal for restock lines
  const createdReturnItems = await tx.salesReturnItem.findMany({ where: { salesReturnId: salesReturn.id } });
  const returnItemByInvLine = new Map(createdReturnItems.map((ri) => [ri.salesInvoiceItemId, ri]));

  let totalCogsReversal = new Decimal(0);
  const cogsCreditByAccount = new Map<string, { amount: number; names: string[] }>();

  for (const r of resolved) {
    if (!r.restock || !r.inventoryItemId) continue;
    const cost = r.unitCostLoaded ?? 0;
    const ri = returnItemByInvLine.get(r.salesInvoiceItemId);

    // StockMovement In
    const smNumber = await generateDocumentNumber(tx, 'SM', parsedDate, fiscalYear.id);
    const smTotalValue = new Decimal(r.quantity).times(new Decimal(cost)).toDecimalPlaces(2).toNumber();
    const sm = await tx.stockMovement.create({
      data: {
        movementNumber: smNumber,
        date: parsedDate,
        itemId: r.inventoryItemId,
        warehouseId: r.warehouseId,
        movementType: 'In',
        quantity: r.quantity,
        unitCost: cost,
        totalValue: smTotalValue,
        referenceType: 'SalesReturn',
        referenceId: salesReturn.id,
        referenceNumber: returnNumber,
        // The COGS reversal journal credits HPP for every valued restock line.
        offsetAccountId: smTotalValue > 0 ? cogsAccount.id : null,
        fiscalYearId: fiscalYear.id,
        createdById: userId,
      },
    });
    if (ri) {
      await tx.salesReturnItem.update({ where: { id: ri.id }, data: { stockMovementId: sm.id } });
    }
    await tx.inventoryItem.update({
      where: { id: r.inventoryItemId },
      data: { currentStock: { increment: r.quantity } },
    });
    if (r.warehouseId) {
      await tx.inventoryStock.upsert({
        where: { itemId_warehouseId: { itemId: r.inventoryItemId, warehouseId: r.warehouseId } },
        update: { currentStock: { increment: r.quantity } },
        create: { itemId: r.inventoryItemId, warehouseId: r.warehouseId, currentStock: r.quantity },
      });
    }

    const cogsAmount = new Decimal(r.quantity).times(new Decimal(cost)).toDecimalPlaces(2).toNumber();
    if (cogsAmount > 0) {
      totalCogsReversal = totalCogsReversal.plus(cogsAmount);
      const acctId = r.invAccountId || inventoryAccount.id;
      const ex = cogsCreditByAccount.get(acctId);
      if (ex) { ex.amount += cogsAmount; ex.names.push(r.itemName); }
      else cogsCreditByAccount.set(acctId, { amount: cogsAmount, names: [r.itemName] });
    }
  }

  // COGS reversal JE: DR Persediaan / CR HPP
  const totalCogsNum = totalCogsReversal.toDecimalPlaces(2).toNumber();
  if (totalCogsNum > 0) {
    const cogsJv = `JV-COGS-${returnNumber}`;
    const cogsItems: Array<{ accountId: string; debit: number; credit: number; description: string }> = [];
    for (const [acctId, data] of cogsCreditByAccount) {
      cogsItems.push({ accountId: acctId, debit: data.amount, credit: 0, description: `Persediaan masuk (retur) ${data.names.join(', ')}: ${returnNumber}` });
    }
    cogsItems.push({ accountId: cogsAccount.id, debit: 0, credit: totalCogsNum, description: `Balik HPP (retur): ${returnNumber}` });

    const cogsJournal = await tx.journalEntry.create({
      data: {
        entryNumber: cogsJv,
        date: parsedDate,
        narration: `Balik HPP Retur Penjualan: ${returnNumber} - ${invoice.customer.name}`,
        status: 'Submitted',
        fiscalYearId: fiscalYear.id,
        createdBy: userId,
        submittedAt: new Date(),
        items: { create: cogsItems },
      },
    });
    await tx.accountingLedgerEntry.createMany({
      data: cogsItems.map((ji) => ({
        date: parsedDate, accountId: ji.accountId, debit: ji.debit, credit: ji.credit,
        referenceType: 'JournalEntry', referenceId: cogsJournal.id, description: ji.description, fiscalYearId: fiscalYear.id,
      })),
    });
    for (const ji of cogsItems) {
      await updateAccountBalance(tx, ji.accountId, ji.debit, ji.credit);
    }
  }

  logger.info(
    { returnId: salesReturn.id, returnNumber, invoice: invoice.invoiceNumber, totalReturn: totalReturnNum, arReduce: arReduceNum, credit: creditPortionNum, cogsReversal: totalCogsNum },
    'Sales return submitted',
  );

  return tx.salesReturn.findUnique({
    where: { id: salesReturn.id },
    include: { customer: true, items: true, salesInvoice: { select: { invoiceNumber: true } } },
  });
}
