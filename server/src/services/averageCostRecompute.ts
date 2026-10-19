import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { logger } from '../lib/logger';
import { replayWeightedAverage, type ReplayMovement } from '../utils/weightedAverageReplay';

type Tx = Prisma.TransactionClient;

const STOCK_TOLERANCE = new Decimal('0.001');

/**
 * Re-derive averageCost by replaying the item's active movements; historical COGS/journals stay.
 * Skipped (warning logged) when movements don't explain the stock. Call after the movements were
 * cancelled/edited in the same transaction.
 */
export async function recomputeAverageCostFromReplay(tx: Tx, itemId: string): Promise<number> {
  const item = await tx.inventoryItem.findUnique({
    where: { id: itemId },
    select: { averageCost: true, currentStock: true },
  });
  if (!item) return 0;

  const rows = await tx.stockMovement.findMany({
    where: { itemId, isCancelled: false },
    select: { id: true, movementType: true, quantity: true, unitCost: true, createdAt: true, referenceType: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const movements: ReplayMovement[] = rows.map((r) => ({
    id: r.id,
    movementType: r.movementType,
    quantity: r.quantity.toString(),
    unitCost: r.unitCost.toString(),
    createdAt: r.createdAt,
    referenceType: r.referenceType,
  }));

  const { averageCost, stock } = replayWeightedAverage(movements, {
    fallbackAverageCost: new Decimal(item.averageCost.toString()),
  });

  // Replay is only trustworthy when the movements explain the item's stock.
  // A residual means stock that entered without a movement (legacy/direct
  // opening balance, unknown cost): replaying from zero would mis-weight it,
  // so keep the stored average and flag it for review.
  const residual = new Decimal(item.currentStock.toString()).minus(stock);
  if (residual.abs().gt(STOCK_TOLERANCE)) {
    logger.warn(
      { itemId, currentStock: item.currentStock.toString(), replayedStock: stock, residual: residual.toString() },
      'Average cost recompute skipped: item stock not explained by movements (opening balance without movement)',
    );
    return Number(item.averageCost);
  }
  await tx.inventoryItem.update({ where: { id: itemId }, data: { averageCost } });
  return averageCost;
}
