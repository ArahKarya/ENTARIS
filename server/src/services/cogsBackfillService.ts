import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { generateDocumentNumber } from '../utils/documentNumber';
import { updateAccountBalance } from '../utils/accountBalance';
import { systemAccounts } from './systemAccounts';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

interface SettleSource {
  type: 'PurchaseInvoice' | 'ProductionRun' | 'StockMovement';
  refId: string;
  refNo?: string;
}

interface SettleResult {
  settledCount: number;
  totalQty: number;
  totalDifferential: number;
  journalEntryId?: string;
}

const NEAR_ZERO_QTY = 0.0005;
const NEAR_ZERO_AMT = 0.005;

/**
 * After a stock-in event, settle pending COGS backfill entries for the item (FIFO).
 * Posts a single differential JV (DR HPP / CR Persediaan, or reverse) for the batch.
 * Safe to call when no pending entries exist — returns null without DB writes.
 */
export async function settleCogsBackfillForItem(
  tx: Tx,
  params: {
    itemId: string;
    qtyAvailable: number;       // qty of the stock-in available to settle deficit
    unitCostNow: number;        // cost basis per unit for this stock-in
    fiscalYearId: string;
    userId: string;
    settleDate: Date;
    source: SettleSource;
  },
): Promise<SettleResult | null> {
  const { itemId, qtyAvailable, unitCostNow, fiscalYearId, userId, settleDate, source } = params;
  if (qtyAvailable <= NEAR_ZERO_QTY) return null;

  const pendings = await tx.cogsBackfillQueue.findMany({
    where: {
      inventoryItemId: itemId,
      status: { in: ['Pending', 'PartiallySettled'] },
    },
    orderBy: { createdAt: 'asc' },
  });
  if (pendings.length === 0) return null;

  let remaining = new Decimal(qtyAvailable);
  let totalDifferential = new Decimal(0);
  let totalQtySettled = new Decimal(0);
  const settlements: Array<{ pendingId: string; qtyToSettle: Decimal; differential: Decimal }> = [];

  for (const p of pendings) {
    if (remaining.lte(NEAR_ZERO_QTY)) break;
    const qtyPending = new Decimal(p.qtyPending.toString());
    const qtyToSettle = Decimal.min(qtyPending, remaining);
    const costAtSale = new Decimal(p.costAtSale.toString());
    const diff = qtyToSettle.mul(new Decimal(unitCostNow).minus(costAtSale)).toDecimalPlaces(2);
    settlements.push({ pendingId: p.id, qtyToSettle, differential: diff });
    totalDifferential = totalDifferential.plus(diff);
    totalQtySettled = totalQtySettled.plus(qtyToSettle);
    remaining = remaining.minus(qtyToSettle);
  }

  if (settlements.length === 0) return null;

  let journalEntryId: string | undefined;
  const diffNum = totalDifferential.toNumber();

  // Post differential JV only when material
  if (Math.abs(diffNum) >= NEAR_ZERO_AMT) {
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId } });
    if (!item) throw new Error(`Inventory item ${itemId} not found during COGS backfill settle.`);

    let invAccountId = item.accountId;
    if (!invAccountId) {
      const def = await systemAccounts.getAccount('INVENTORY');
      invAccountId = def.id;
    }

    // COGS account: prefer 5.1, else parent 5
    const cogsAccount =
      (await tx.account.findFirst({ where: { accountNumber: '5.1' } })) ||
      (await tx.account.findFirst({ where: { accountNumber: '5' } }));
    if (!cogsAccount) throw new Error('Akun HPP (5 atau 5.1) tidak ditemukan untuk auto-settle COGS backfill.');

    const isPositive = diffNum > 0;
    const debitAccountId = isPositive ? cogsAccount.id : invAccountId;
    const creditAccountId = isPositive ? invAccountId : cogsAccount.id;
    const amt = Math.abs(diffNum);

    const entryNumber = await generateDocumentNumber(tx, 'JV', settleDate, fiscalYearId);
    const narration = `Auto-settle COGS ${item.name}: ${settlements.length} entry, trigger ${source.type}${source.refNo ? ' ' + source.refNo : ''}`;

    const je = await tx.journalEntry.create({
      data: {
        entryNumber,
        date: settleDate,
        status: 'Submitted',
        submittedAt: settleDate,
        narration,
        fiscalYearId,
        createdBy: userId,
        items: {
          create: [
            { accountId: debitAccountId, debit: amt, credit: 0, description: `${isPositive ? 'DR HPP' : 'DR Persediaan'} ${item.name}` },
            { accountId: creditAccountId, debit: 0, credit: amt, description: `${isPositive ? 'CR Persediaan' : 'CR HPP'} ${item.name}` },
          ],
        },
      },
    });
    journalEntryId = je.id;

    await tx.accountingLedgerEntry.createMany({
      data: [
        { date: settleDate, accountId: debitAccountId, debit: amt, credit: 0, description: narration, referenceType: 'JournalEntry', referenceId: je.id, fiscalYearId },
        { date: settleDate, accountId: creditAccountId, debit: 0, credit: amt, description: narration, referenceType: 'JournalEntry', referenceId: je.id, fiscalYearId },
      ],
    });

    await updateAccountBalance(tx, debitAccountId, amt, 0);
    await updateAccountBalance(tx, creditAccountId, 0, amt);

    // Realign averageCost: after settling deficit at the new unit_cost, the
    // average should reflect the inflow's cost (the deficit batch is now
    // accounted for at unit_cost). Skip if currentStock is zero to avoid /0.
    const fresh = await tx.inventoryItem.findUnique({ where: { id: itemId }, select: { currentStock: true, averageCost: true } });
    if (fresh && Math.abs(Number(fresh.currentStock)) > NEAR_ZERO_QTY) {
      const stockDec = new Decimal(fresh.currentStock.toString());
      const oldAvg = new Decimal(fresh.averageCost.toString());
      const oldGlValue = stockDec.mul(oldAvg);
      const newGlValue = oldGlValue.minus(totalDifferential);
      const newAvg = newGlValue.div(stockDec).toDecimalPlaces(2);
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { averageCost: newAvg.toNumber() < 0 ? 0 : newAvg.toNumber() },
      });
    }
  }

  // Persist queue updates + settlement records
  for (const s of settlements) {
    const pending = pendings.find((p) => p.id === s.pendingId)!;
    const newQtyPending = new Decimal(pending.qtyPending.toString()).minus(s.qtyToSettle);
    const isFull = newQtyPending.lte(NEAR_ZERO_QTY);

    await tx.cogsBackfillQueue.update({
      where: { id: s.pendingId },
      data: {
        qtyPending: isFull ? 0 : newQtyPending.toDecimalPlaces(3).toNumber(),
        status: isFull ? 'Settled' : 'PartiallySettled',
        settledAt: isFull ? settleDate : null,
      },
    });

    await tx.cogsBackfillSettlement.create({
      data: {
        queueId: s.pendingId,
        qtySettled: s.qtyToSettle.toNumber(),
        costAtSettle: unitCostNow,
        differential: s.differential.toNumber(),
        journalEntryId: journalEntryId ?? null,
        triggerSource: source.type,
        triggerRefId: source.refId,
        triggerRefNo: source.refNo ?? null,
      },
    });
  }

  logger.info(
    {
      itemId,
      settledCount: settlements.length,
      totalQty: totalQtySettled.toNumber(),
      totalDifferential: diffNum,
      journalEntryId,
      source,
    },
    'COGS backfill settled',
  );

  return {
    settledCount: settlements.length,
    totalQty: totalQtySettled.toNumber(),
    totalDifferential: diffNum,
    journalEntryId,
  };
}
