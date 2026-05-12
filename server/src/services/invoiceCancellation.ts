import type { Prisma } from '@prisma/client';
import { BusinessError } from '../utils/errors';
import { updateAccountBalance, recalcPartyOutstanding } from '../utils/accountBalance';
import { systemAccounts } from './systemAccounts';

type Tx = Prisma.TransactionClient;

/**
 * Cancel a sales invoice + reverse every side-effect it created:
 *   - flip JE (and COGS JE) to Cancelled, mark ALE rows cancelled
 *   - reverse balances on every JE item account (preserves per-item COGS
 *     sub-accounts that the original posting touched)
 *   - decrement (cancel) every linked stock movement, restore item.currentStock
 *     and the per-warehouse inventory_stocks row
 *   - recompute party outstanding from invoice sums
 *
 * Caller is responsible for opening the $transaction. Returns the cancelled
 * invoice ID + new status.
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
  if (invoice.status === 'Paid') throw new BusinessError('Invoice sudah lunas, tidak bisa dibatalkan.');

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
    throw new BusinessError('Invoice memiliki alokasi uang muka pelanggan aktif. Batalkan alokasi terlebih dahulu.');
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

  // Reverse stock movements created BY this invoice (direct-sale path).
  // From-DO lines don't create their own stockMovement here — those belong
  // to the DO (referenceType='DeliveryOrder') and stay valid because the
  // goods physically left the warehouse regardless of billing.
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

  return { id: invoice.id, status: 'Cancelled' };
}
