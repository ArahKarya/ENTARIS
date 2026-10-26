import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { recalculateAccountBalances } from '../utils/accountBalance';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

const NEAR_ZERO_QTY = 0.0005;

/**
 * Close the COGS backfill queue of a sales invoice being cancelled: the invoice's own COGS JV is
 * voided, so every auto-settle differential booked against its queue is void too. Cancels those
 * auto-settle JVs + ALE, deletes the settlement rows and marks the queue entries 'Cancelled' so
 * later stock-ins no longer settle them. No-op when the invoice has no queue entries.
 */
export async function closeCogsBackfillForSalesInvoice(
  tx: Tx,
  salesInvoiceId: string,
): Promise<{ queuesClosed: number; journalsCancelled: number }> {
  const queues = await tx.cogsBackfillQueue.findMany({
    where: { salesInvoiceId, status: { not: 'Cancelled' } },
    include: { settlements: true },
  });
  if (queues.length === 0) return { queuesClosed: 0, journalsCancelled: 0 };

  const settlements = queues.flatMap((q) => q.settlements);
  const jeIds = [...new Set(settlements.map((s) => s.journalEntryId).filter((x): x is string => !!x))];
  const affectedAccountIds = new Set<string>();
  let journalsCancelled = 0;
  for (const jeId of jeIds) {
    // A batch JV may also cover settlements of other (still valid) invoices: cancelling it whole would
    // drop their differential too, so only reverse JVs whose settlements all belong to this invoice.
    const foreign = await tx.cogsBackfillSettlement.count({
      where: { journalEntryId: jeId, queue: { salesInvoiceId: { not: salesInvoiceId } } },
    });
    if (foreign > 0) {
      logger.warn({ salesInvoiceId, jeId }, 'COGS backfill JV shared with another invoice; left active');
      continue;
    }
    const je = await tx.journalEntry.findUnique({ where: { id: jeId }, include: { items: true } });
    if (!je || je.status === 'Cancelled') continue;
    await tx.journalEntry.update({ where: { id: jeId }, data: { status: 'Cancelled', cancelledAt: new Date() } });
    await tx.accountingLedgerEntry.updateMany({ where: { referenceId: jeId }, data: { isCancelled: true } });
    for (const ji of je.items) affectedAccountIds.add(ji.accountId);
    journalsCancelled++;
  }

  if (settlements.length > 0) {
    await tx.cogsBackfillSettlement.deleteMany({ where: { id: { in: settlements.map((s) => s.id) } } });
  }
  await tx.cogsBackfillQueue.updateMany({
    where: { id: { in: queues.map((q) => q.id) } },
    data: { status: 'Cancelled', settledAt: null },
  });

  if (affectedAccountIds.size > 0) await recalculateAccountBalances(tx, [...affectedAccountIds]);

  logger.info(
    { salesInvoiceId, queuesClosed: queues.length, settlements: settlements.length, journalsCancelled },
    'COGS backfill queue closed for cancelled sales invoice',
  );
  return { queuesClosed: queues.length, journalsCancelled };
}

/**
 * Reverse every COGS backfill auto-settle triggered by one stock-in document (on cancel or before
 * re-create on edit): cancels the auto-settle JVs + ALE, restores queue qtyPending/status, deletes
 * the settlement rows. No-op without settlements.
 */
export async function reverseCogsSettlementsByTrigger(
  tx: Tx,
  triggerSource: 'ProductionRun' | 'PurchaseInvoice' | 'StockMovement',
  triggerRefId: string,
): Promise<{ reversed: number; journalsCancelled: number }> {
  const settlements = await tx.cogsBackfillSettlement.findMany({
    where: { triggerSource, triggerRefId },
    include: { queue: true },
    orderBy: { createdAt: 'desc' },
  });
  if (settlements.length === 0) return { reversed: 0, journalsCancelled: 0 };

  // One auto-settle JV can cover many settlements in a batch.
  const jeIds = [...new Set(settlements.map((s) => s.journalEntryId).filter((x): x is string => !!x))];
  const affectedAccountIds = new Set<string>();
  let journalsCancelled = 0;
  for (const jeId of jeIds) {
    const je = await tx.journalEntry.findUnique({ where: { id: jeId }, include: { items: true } });
    if (!je || je.status === 'Cancelled') continue;
    await tx.journalEntry.update({ where: { id: jeId }, data: { status: 'Cancelled', cancelledAt: new Date() } });
    await tx.accountingLedgerEntry.updateMany({ where: { referenceId: jeId }, data: { isCancelled: true } });
    for (const ji of je.items) affectedAccountIds.add(ji.accountId);
    journalsCancelled++;
  }

  for (const s of settlements) {
    const q = s.queue;
    // A queue closed because its sales invoice was cancelled must stay closed (never re-open it).
    if (q.status === 'Cancelled') continue;
    const restoredPending = new Decimal(q.qtyPending.toString()).plus(s.qtySettled.toString());
    const original = new Decimal(q.qtyOriginal.toString());
    const capped = Decimal.min(restoredPending, original);
    const isUntouched = capped.minus(original).abs().lte(NEAR_ZERO_QTY);
    await tx.cogsBackfillQueue.update({
      where: { id: q.id },
      data: {
        qtyPending: capped.toDecimalPlaces(3).toNumber(),
        status: isUntouched ? 'Pending' : 'PartiallySettled',
        settledAt: null,
      },
    });
  }

  // Delete settlements only after the queue is restored.
  await tx.cogsBackfillSettlement.deleteMany({ where: { id: { in: settlements.map((s) => s.id) } } });

  // averageCost is not reversed arithmetically (inventory value moved since settle and could clip to 0);
  // callers that change stock recompute it from active inbound movements.

  if (affectedAccountIds.size > 0) await recalculateAccountBalances(tx, [...affectedAccountIds]);

  logger.info(
    { triggerSource, triggerRefId, reversed: settlements.length, journalsCancelled },
    'COGS backfill settlements reversed',
  );
  return { reversed: settlements.length, journalsCancelled };
}
