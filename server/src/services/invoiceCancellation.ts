import { reverseCogsSettlementsByTrigger, closeCogsBackfillForSalesInvoice } from './cogsBackfillReverse';
import type { Prisma } from '@prisma/client';
import { BusinessError } from '../utils/errors';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { systemAccounts } from './systemAccounts';

type Tx = Prisma.TransactionClient;

/**
 * Cancel a sales invoice: cancel its JE and COGS JE (balances reversed per JE item account, so
 * per-item COGS sub-accounts are restored), reverse its own stock movements, recompute party
 * outstanding. Caller owns the transaction.
 */
export async function cancelSalesInvoiceInTx(
  tx: Tx,
  invoiceId: string,
): Promise<{ id: string; status: 'Cancelled' }> {
  const invoice = await tx.salesInvoice.findUnique({
    where: { id: invoiceId },
    include: { customer: true },
  });
  if (!invoice) throw new BusinessError('Invoice tidak ditemukan.');
  if (invoice.status === 'Cancelled') throw new BusinessError('Invoice sudah dibatalkan.');
  // Invoice Rp 0 (sumbangan) otomatis Paid tanpa pembayaran → tetap boleh dibatalkan.
  if (invoice.status === 'Paid' && Number(invoice.grandTotal) !== 0) throw new BusinessError('Invoice sudah lunas, tidak bisa dibatalkan.');

  const allocations = await tx.paymentAllocation.findMany({
    where: { invoiceType: 'SalesInvoice', invoiceId: invoice.id },
  });
  if (allocations.length > 0) {
    throw new BusinessError('Invoice memiliki pembayaran teralokasi. Batalkan pembayaran terlebih dahulu.');
  }

  const activeDepositApps = await tx.customerDepositApplication.count({
    where: { salesInvoiceId: invoice.id, isCancelled: false },
  });
  if (activeDepositApps > 0) {
    throw new BusinessError('Invoice memiliki alokasi uang muka customer aktif. Batalkan alokasi terlebih dahulu.');
  }

  await tx.salesInvoice.update({
    where: { id: invoice.id },
    data: { status: 'Cancelled', outstanding: 0, cancelledAt: new Date() },
  });

  // Main revenue/AR journal
  const jvNumber = `JV-${invoice.invoiceNumber}`;
  const journal = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
  if (journal) {
    await tx.journalEntry.update({
      where: { id: journal.id },
      data: { status: 'Cancelled', cancelledAt: new Date() },
    });
    await tx.accountingLedgerEntry.updateMany({
      where: { referenceId: journal.id },
      data: { isCancelled: true },
    });
    const journalItems = await tx.journalItem.findMany({ where: { journalEntryId: journal.id } });
    for (const ji of journalItems) {
      await updateAccountBalance(tx, ji.accountId, ji.credit, ji.debit);
    }
  }

  // COGS journal (separate JV-COGS-... entry)
  const cogsJvNumber = `JV-COGS-${invoice.invoiceNumber}`;
  const cogsJournal = await tx.journalEntry.findUnique({ where: { entryNumber: cogsJvNumber } });
  if (cogsJournal) {
    await tx.journalEntry.update({
      where: { id: cogsJournal.id },
      data: { status: 'Cancelled', cancelledAt: new Date() },
    });
    await tx.accountingLedgerEntry.updateMany({
      where: { referenceId: cogsJournal.id },
      data: { isCancelled: true },
    });
    const cogsItems = await tx.journalItem.findMany({ where: { journalEntryId: cogsJournal.id } });
    for (const ji of cogsItems) {
      await updateAccountBalance(tx, ji.accountId, ji.credit, ji.debit);
    }
  }

  // Deferred COGS of this invoice is void with it: close its backfill queue and reverse its
  // auto-settle JVs, otherwise later stock-ins keep moving inventory value into HPP.
  await closeCogsBackfillForSalesInvoice(tx, invoice.id);

  // Only direct-sale movements are reversed; from-DO movements belong to the DO and stay valid.
  const stockMovements = await tx.stockMovement.findMany({
    where: { referenceType: 'SalesInvoice', referenceId: invoice.id, isCancelled: false },
  });
  for (const sm of stockMovements) {
    await tx.inventoryItem.update({
      where: { id: sm.itemId },
      data: { currentStock: { increment: Number(sm.quantity) } },
    });
    if (sm.warehouseId) {
      await tx.inventoryStock.update({
        where: { itemId_warehouseId: { itemId: sm.itemId, warehouseId: sm.warehouseId } },
        data: { currentStock: { increment: Number(sm.quantity) } },
      });
    }
    await tx.stockMovement.update({
      where: { id: sm.id },
      data: { isCancelled: true },
    });
  }

  // Release linked Delivery Orders back to Submitted state so they can be
  // billed by another invoice. Their stock movements remain valid.
  await tx.deliveryOrder.updateMany({
    where: { invoiceId: invoice.id },
    data: { invoiceId: null, invoicedAt: null },
  });

  // delivery_order_item_id is @unique: null it so a new invoice can bind the same DO.
  // Lines are kept for the audit trail.
  await tx.salesInvoiceItem.updateMany({
    where: { salesInvoiceId: invoice.id, deliveryOrderItemId: { not: null } },
    data: { deliveryOrderItemId: null },
  });

  await recalcPartyOutstanding(tx, invoice.partyId);

  return { id: invoice.id, status: 'Cancelled' };
}

/**
 * Mirror of cancelSalesInvoiceInTx for purchase invoices. Inventory deltas
 * flip direction (decrement instead of increment).
 */
export async function cancelPurchaseInvoiceInTx(
  tx: Tx,
  invoiceId: string,
): Promise<{ id: string; status: 'Cancelled' }> {
  const invoice = await tx.purchaseInvoice.findUnique({
    where: { id: invoiceId },
    include: { supplier: true },
  });
  if (!invoice) throw new BusinessError('Invoice tidak ditemukan.');
  if (invoice.status === 'Cancelled') throw new BusinessError('Invoice sudah dibatalkan.');
  if (invoice.status === 'Paid') throw new BusinessError('Invoice sudah lunas, tidak bisa dibatalkan.');

  const allocations = await tx.paymentAllocation.findMany({
    where: { invoiceType: 'PurchaseInvoice', invoiceId: invoice.id },
  });
  if (allocations.length > 0) {
    throw new BusinessError('Invoice memiliki pembayaran teralokasi. Batalkan pembayaran terlebih dahulu.');
  }

  const activeDepositApps = await tx.vendorDepositApplication.count({
    where: { purchaseInvoiceId: invoice.id, isCancelled: false },
  });
  if (activeDepositApps > 0) {
    throw new BusinessError('Invoice memiliki alokasi uang muka aktif. Batalkan alokasi terlebih dahulu.');
  }

  await tx.purchaseInvoice.update({
    where: { id: invoice.id },
    data: { status: 'Cancelled', outstanding: 0, cancelledAt: new Date() },
  });

  const jvNumber = `JV-${invoice.invoiceNumber}`;
  const journal = await tx.journalEntry.findUnique({ where: { entryNumber: jvNumber } });
  if (journal) {
    await tx.journalEntry.update({
      where: { id: journal.id },
      data: { status: 'Cancelled', cancelledAt: new Date() },
    });
    await tx.accountingLedgerEntry.updateMany({
      where: { referenceId: journal.id },
      data: { isCancelled: true },
    });
    const jeItems = await tx.journalItem.findMany({ where: { journalEntryId: journal.id } });
    for (const ji of jeItems) {
      await updateAccountBalance(tx, ji.accountId, ji.credit, ji.debit);
    }
  } else {
    // Legacy fallback for invoices created before per-item JE rows existed.
    const apAccount = await systemAccounts.getAccount('AP');
    const inventoryAccount = await systemAccounts.getAccount('INVENTORY');
    await updateAccountBalance(tx, inventoryAccount.id, 0, invoice.grandTotal);
    await updateAccountBalance(tx, apAccount.id, invoice.grandTotal, 0);
  }

  await recalcPartyOutstanding(tx, invoice.partyId);

  // Only PI-owned movements (standalone/legacy lines) are reversed; STT-linked stock belongs to the STT.
  const stockMovements = await tx.stockMovement.findMany({
    where: { referenceType: 'PurchaseInvoice', referenceId: invoice.id, isCancelled: false },
  });
  for (const sm of stockMovements) {
    await tx.inventoryItem.update({
      where: { id: sm.itemId },
      data: { currentStock: { decrement: Number(sm.quantity) } },
    });
    if (sm.warehouseId) {
      await tx.inventoryStock.update({
        where: { itemId_warehouseId: { itemId: sm.itemId, warehouseId: sm.warehouseId } },
        data: { currentStock: { decrement: Number(sm.quantity) } },
      });
    }
    await tx.stockMovement.update({
      where: { id: sm.id },
      data: { isCancelled: true },
    });
  }

  await reverseCogsSettlementsByTrigger(tx, 'PurchaseInvoice', invoice.id);

  // Release linked STTs for invoicing; their items and stock movements stay untouched.
  await tx.goodsReceipt.updateMany({
    where: { invoiceId: invoice.id },
    data: { invoiceId: null, invoicedAt: null },
  });

  // goods_receipt_item_id is @unique: null it so a new invoice can bind the same STT.
  await tx.purchaseInvoiceItem.updateMany({
    where: { purchaseInvoiceId: invoice.id, goodsReceiptItemId: { not: null } },
    data: { goodsReceiptItemId: null },
  });

  return { id: invoice.id, status: 'Cancelled' };
}
