// Price revision of a Submitted/Paid purchase invoice whose goods may already be consumed
// (cancel + recreate could drive stock negative). Delta = (new rate - old rate) x qty, split by
// qty: still in stock -> Persediaan + WAC correction; already out -> 5.11 variance (old COGS
// untouched). Counter entry is always Hutang Usaha 2.1.1: delta > 0 CRs it, delta < 0 DRs it.

import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { systemAccounts } from '../services/systemAccounts';
import { generateDocumentNumber } from '../utils/documentNumber';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

export interface ReviseLineInput {
  /** PurchaseInvoiceItem.id */
  itemId: string;
  /** Harga baru per unit (rate). */
  newRate: number;
}

export interface RevisePurchaseInvoiceInput {
  invoiceId: string;
  lines: ReviseLineInput[];
  reason: string;
}

const VARIANCE_ACCOUNT_NUMBER = '5.11';

/**
 * Hitung berapa qty dari sebuah inbound batch (stockMovement STT) yang SUDAH
 * dikonsumsi (keluar) — via outbound movements yang merujuk sourceMovementId.
 * Sisanya dianggap masih di stok.
 */
async function consumedQtyOfBatch(tx: Tx, inboundMovementId: string): Promise<Decimal> {
  const agg = await tx.stockMovement.aggregate({
    where: { sourceMovementId: inboundMovementId, isCancelled: false },
    _sum: { quantity: true },
  });
  return new Decimal((agg._sum?.quantity ?? 0).toString());
}

export async function revisePurchaseInvoiceInTx(
  tx: Tx,
  input: RevisePurchaseInvoiceInput,
  userId: string,
) {
  if (!input.reason || input.reason.trim().length < 10) {
    throw new BusinessError('Alasan revisi harga wajib diisi (minimal 10 karakter).');
  }

  const invoice = await tx.purchaseInvoice.findUnique({
    where: { id: input.invoiceId },
    include: {
      supplier: { select: { name: true } },
      items: {
        include: {
          goodsReceiptItem: { select: { stockMovementId: true } },
          inventoryItem: { select: { id: true, name: true, currentStock: true, averageCost: true } },
        },
      },
    },
  });
  if (!invoice) throw new BusinessError('Invoice pembelian tidak ditemukan.');
  if (invoice.status === 'Cancelled') throw new BusinessError('Invoice sudah dibatalkan, tidak bisa direvisi.');
  if (invoice.status === 'Draft') throw new BusinessError('Invoice masih Draft. Edit langsung, bukan revisi harga.');

  const lineMap = new Map(invoice.items.map((it) => [it.id, it]));

  // Resolve accounts once.
  const varianceAccount = await tx.account.findFirst({ where: { accountNumber: VARIANCE_ACCOUNT_NUMBER } });
  if (!varianceAccount) throw new BusinessError(`Akun ${VARIANCE_ACCOUNT_NUMBER} (Selisih Harga Pembelian) tidak ditemukan.`);
  const apAccount = await systemAccounts.getAccount('AP'); // 2.1.1 Hutang Usaha
  const defaultInv = await systemAccounts.getAccount('INVENTORY');

  // Journal lines accumulator (net per account → satu baris per akun).
  const drByAccount = new Map<string, Decimal>();
  const crByAccount = new Map<string, Decimal>();
  const addDR = (acc: string, v: Decimal) => drByAccount.set(acc, (drByAccount.get(acc) ?? new Decimal(0)).plus(v));
  const addCR = (acc: string, v: Decimal) => crByAccount.set(acc, (crByAccount.get(acc) ?? new Decimal(0)).plus(v));

  let totalDelta = new Decimal(0);
  const perLineLog: Array<Record<string, unknown>> = [];

  for (const ln of input.lines) {
    const item = lineMap.get(ln.itemId);
    if (!item) throw new BusinessError(`Baris invoice ${ln.itemId} tidak ditemukan di PI ini.`);

    const qty = new Decimal(item.quantity.toString());
    const oldRate = new Decimal(item.rate.toString());
    const newRate = new Decimal(ln.newRate);
    if (newRate.lt(0)) throw new BusinessError('Harga baru tidak boleh negatif.');
    const lineDelta = newRate.minus(oldRate).mul(qty).toDecimalPlaces(2);
    if (lineDelta.isZero()) continue; // tidak ada perubahan untuk baris ini

    totalDelta = totalDelta.plus(lineDelta);

    // Split qty: berapa masih di stok vs sudah keluar.
    // Pakai batch tracking jika STT-linked; kalau tidak, fallback ke
    // currentStock item (kapasitas serap WAC).
    let qtyInStock = qty; // default: anggap semua masih di stok
    const invItemId = item.inventoryItemId;
    const inboundMovId = item.goodsReceiptItem?.stockMovementId ?? null;

    if (inboundMovId) {
      const consumed = await consumedQtyOfBatch(tx, inboundMovId);
      qtyInStock = Decimal.max(qty.minus(consumed), new Decimal(0));
    } else if (invItemId && item.inventoryItem) {
      // Non-batch: pakai stok terkini sebagai pembatas porsi yg bisa diserap WAC.
      qtyInStock = Decimal.min(qty, Decimal.max(new Decimal(item.inventoryItem.currentStock.toString()), new Decimal(0)));
    }
    const qtyConsumed = qty.minus(qtyInStock);

    // Bagi delta proporsional ke porsi stok vs konsumsi (berdasarkan qty).
    const deltaPerUnit = newRate.minus(oldRate);
    const deltaInStock = deltaPerUnit.mul(qtyInStock).toDecimalPlaces(2);
    const deltaConsumed = lineDelta.minus(deltaInStock); // sisa → variance (hindari rounding leak)

    const invAccId = item.inventoryItem ? (await resolveItemInvAccount(tx, invItemId, defaultInv.id)) : defaultInv.id;

    // Porsi masih-di-stok → Persediaan + koreksi WAC.
    if (!deltaInStock.isZero() && invItemId && item.inventoryItem) {
      if (lineDelta.gt(0)) addDR(invAccId, deltaInStock);
      else addCR(invAccId, deltaInStock.abs());

      // Koreksi WAC: tambahkan deltaInStock ke total nilai stok terkini.
      const stock = new Decimal(item.inventoryItem.currentStock.toString());
      if (stock.gt(0)) {
        const oldAvg = new Decimal(item.inventoryItem.averageCost.toString());
        const newAvg = stock.mul(oldAvg).plus(deltaInStock).div(stock).toDecimalPlaces(2);
        await tx.inventoryItem.update({
          where: { id: invItemId },
          data: { averageCost: Decimal.max(newAvg, new Decimal(0)).toNumber() },
        });
      }
    } else if (!deltaInStock.isZero()) {
      // Tidak ada item inventori (jasa/biaya) → masuk variance juga.
      if (lineDelta.gt(0)) addDR(varianceAccount.id, deltaInStock);
      else addCR(varianceAccount.id, deltaInStock.abs());
    }

    // Porsi sudah-keluar → 5.11 Selisih Harga Pembelian (variance).
    if (!deltaConsumed.isZero()) {
      if (lineDelta.gt(0)) addDR(varianceAccount.id, deltaConsumed);
      else addCR(varianceAccount.id, deltaConsumed.abs());
    }

    // Update baris PI: rate + amount. amount baru = amount lama + lineDelta
    // (delta murni dari perubahan rate × qty; komponen pajak/potongan lain
    // tidak ikut berubah di revisi harga sederhana ini).
    const newAmount = new Decimal(item.amount.toString()).plus(lineDelta).toDecimalPlaces(2);
    await tx.purchaseInvoiceItem.update({
      where: { id: item.id },
      data: { rate: newRate.toNumber(), amount: newAmount.toNumber() },
    });

    // Update juga stockMovement.unitCost/totalValue untuk porsi (jejak cost
    // batch). unitCost baru = newRate (mencerminkan harga revisi).
    if (inboundMovId) {
      await tx.stockMovement.update({
        where: { id: inboundMovId },
        data: {
          unitCost: newRate.toNumber(),
          totalValue: newRate.mul(qty).toDecimalPlaces(2).toNumber(),
        },
      });
    }

    perLineLog.push({
      itemName: item.itemName,
      oldRate: oldRate.toString(),
      newRate: newRate.toString(),
      qty: qty.toString(),
      qtyInStock: qtyInStock.toString(),
      qtyConsumed: qtyConsumed.toString(),
      deltaInStock: deltaInStock.toString(),
      deltaConsumed: deltaConsumed.toString(),
    });
  }

  if (totalDelta.isZero()) {
    throw new BusinessError('Tidak ada perubahan harga (semua baris sama dengan harga lama).');
  }

  // Lawan delta → Hutang Usaha (2.1.1).
  if (totalDelta.gt(0)) addCR(apAccount.id, totalDelta);
  else addDR(apAccount.id, totalDelta.abs());

  // Build JE lines dari akumulator.
  const jeItems: { accountId: string; debit: number; credit: number; partyId?: string | null; description: string }[] = [];
  for (const [accId, v] of drByAccount) {
    if (v.isZero()) continue;
    jeItems.push({ accountId: accId, debit: v.toDecimalPlaces(2).toNumber(), credit: 0, partyId: accId === apAccount.id ? invoice.partyId : null, description: `Revisi harga ${invoice.invoiceNumber}` });
  }
  for (const [accId, v] of crByAccount) {
    if (v.isZero()) continue;
    jeItems.push({ accountId: accId, debit: 0, credit: v.toDecimalPlaces(2).toNumber(), partyId: accId === apAccount.id ? invoice.partyId : null, description: `Revisi harga ${invoice.invoiceNumber}` });
  }

  // Sanity: JE balance.
  const sumDr = jeItems.reduce((s, i) => s.plus(i.debit), new Decimal(0));
  const sumCr = jeItems.reduce((s, i) => s.plus(i.credit), new Decimal(0));
  if (sumDr.minus(sumCr).abs().gt(0.01)) {
    throw new BusinessError(`Jurnal revisi tidak balance (DR ${sumDr} vs CR ${sumCr}). Revisi dibatalkan.`);
  }

  const now = new Date();
  const entryNumber = await generateDocumentNumber(tx, 'JV', now, invoice.fiscalYearId);
  const je = await tx.journalEntry.create({
    data: {
      entryNumber,
      date: now,
      narration: `Revisi harga ${invoice.invoiceNumber} (${invoice.supplier.name}): ${input.reason.trim()}`,
      status: 'Submitted',
      submittedAt: now,
      fiscalYearId: invoice.fiscalYearId,
      createdBy: userId,
      items: { create: jeItems.map((i) => ({ accountId: i.accountId, debit: i.debit, credit: i.credit, partyId: i.partyId ?? null, description: i.description })) },
    },
  });

  await tx.accountingLedgerEntry.createMany({
    data: jeItems.map((i) => ({
      date: now,
      accountId: i.accountId,
      partyId: i.partyId ?? null,
      debit: i.debit,
      credit: i.credit,
      referenceType: 'JournalEntry',
      referenceId: je.id,
      description: i.description,
      fiscalYearId: invoice.fiscalYearId,
    })),
  });
  for (const i of jeItems) {
    await updateAccountBalance(tx, i.accountId, i.debit, i.credit);
  }

  // Update header grandTotal + outstanding.
  const newGrandTotal = new Decimal(invoice.grandTotal.toString()).plus(totalDelta).toDecimalPlaces(2);
  const newOutstanding = Decimal.max(
    new Decimal(invoice.outstanding.toString()).plus(totalDelta),
    new Decimal(0),
  ).toDecimalPlaces(2);
  // Status: kalau outstanding > 0 dan sebelumnya Paid → jadi PartiallyPaid.
  let newStatus = invoice.status;
  if (newOutstanding.gt(0) && (invoice.status === 'Paid')) newStatus = 'PartiallyPaid';
  else if (newOutstanding.isZero() && invoice.status === 'PartiallyPaid') newStatus = 'Paid';

  await tx.purchaseInvoice.update({
    where: { id: invoice.id },
    data: {
      grandTotal: newGrandTotal.toNumber(),
      outstanding: newOutstanding.toNumber(),
      status: newStatus,
      notes: (invoice.notes ? invoice.notes + ' | ' : '') + `[Revisi harga ${now.toISOString().slice(0, 10)}] ${input.reason.trim()}`,
    },
  });

  await recalcPartyOutstanding(tx, invoice.partyId);

  logger.info(
    { invoiceNumber: invoice.invoiceNumber, totalDelta: totalDelta.toString(), jvNumber: entryNumber, lines: perLineLog, reason: input.reason.trim(), userId },
    'Purchase invoice price revised',
  );

  return tx.purchaseInvoice.findUnique({
    where: { id: invoice.id },
    include: { items: true, supplier: { select: { name: true } } },
  });
}

async function resolveItemInvAccount(tx: Tx, invItemId: string | null, fallback: string): Promise<string> {
  if (!invItemId) return fallback;
  const it = await tx.inventoryItem.findUnique({ where: { id: invItemId }, select: { accountId: true } });
  return it?.accountId ?? fallback;
}
