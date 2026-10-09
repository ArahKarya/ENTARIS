import type { Prisma } from '@prisma/client';
import { BusinessError } from '../utils/errors';
import { recalculateAccountBalances } from '../utils/accountBalance';
import { cancelJournalsByPrefix } from '../utils/journalCancel';
import { adjustWarehouseStock } from '../utils/warehouseStock';
import { logger } from '../lib/logger';
import { reverseCogsSettlementsByTrigger } from './cogsBackfillReverse';
import { recomputeAverageCostFromReplay } from './averageCostRecompute';

type Tx = Prisma.TransactionClient;

interface CancelOptions {
  /** When true, skip the "stock cukup untuk dibalikin" guard. Used by Admin
   *  override route — logs a warning instead of throwing. */
  allowNegativeStock?: boolean;
  negativeStockReason?: string | null;
}

/**
 * Cancel a production run and reverse every downstream effect:
 *   - reverse stock movements (item-total + per-warehouse), mark them cancelled
 *   - recompute averageCost for each output item from remaining active In movements
 *   - cancel all related journal entries (including any revisions sharing the
 *     same JV- prefix) + ALE rows
 *   - recalculate affected account balances from JE sums (prevents drift)
 *   - mark the run as cancelled
 */
export async function cancelProductionRunInTx(
  tx: Tx,
  runId: string,
  opts: CancelOptions = {},
): Promise<void> {
  const run = await tx.productionRun.findUnique({
    where: { id: runId },
    include: { items: { include: { item: true } } },
  });
  if (!run) throw new BusinessError('Data proses produksi tidak ditemukan.');
  if (run.isCancelled) throw new BusinessError('Proses produksi sudah dibatalkan.');

  const movements = await tx.stockMovement.findMany({
    where: { referenceType: 'ProductionRun', referenceId: runId, isCancelled: false },
    include: { item: true },
  });

  const affectedItemIds = new Set<string>();

  for (const mov of movements) {
    const isIn = mov.movementType === 'In' || mov.movementType === 'AdjustmentIn';
    const isOut = mov.movementType === 'Out' || mov.movementType === 'AdjustmentOut';
    const qty = Number(mov.quantity);

    // Reversing an `In` movement subtracts from stock — guard against negative.
    if (isIn && Number(mov.item.currentStock) < qty) {
      if (!opts.allowNegativeStock) {
        throw new BusinessError(
          `Tidak dapat membatalkan: stok '${mov.item.name}' tidak mencukupi untuk pembalikan output (tersedia ${Number(mov.item.currentStock)}, perlu ${qty}). Output sudah dipakai produksi/penjualan berikutnya. Batalkan transaksi tersebut dulu.`,
        );
      }
      logger.warn(
        {
          itemId: mov.itemId,
          itemName: mov.item.name,
          currentStock: Number(mov.item.currentStock),
          reverseQty: qty,
          reason: opts.negativeStockReason,
        },
        'Production cancel reverse with negative stock bypass',
      );
    }

    affectedItemIds.add(mov.itemId);

    const reverseDelta = isOut ? qty : -qty;
    await tx.inventoryItem.update({
      where: { id: mov.itemId },
      data: { currentStock: { increment: reverseDelta } },
    });
    await adjustWarehouseStock(tx, mov.itemId, mov.warehouseId, reverseDelta);
    await tx.stockMovement.update({
      where: { id: mov.id },
      data: { isCancelled: true },
    });
  }

  // Recompute averageCost by REPLAYING the remaining active movements of every
  // affected item (outputs and inputs), not by averaging all inbound.
  for (const itemId of affectedItemIds) {
    await recomputeAverageCostFromReplay(tx, itemId);
  }

  // Balik auto-settle COGS backfill yang dipicu PR ini (JV-YYYYMM-nnnn + antrean + averageCost)
  // — kalau tidak, JV auto-settle tertinggal & persediaan/HPP salah.
  await reverseCogsSettlementsByTrigger(tx, 'ProductionRun', runId);

  // Cancel every related journal entry (including revisions sharing the prefix)
  // and recompute account balances from authoritative JE sums.
  const jvNumber = `JV-${run.runNumber}`;
  const relatedJEItems = await tx.journalItem.findMany({
    where: {
      journalEntry: { entryNumber: { startsWith: jvNumber }, status: { not: 'Cancelled' } },
    },
    select: { accountId: true },
  });
  const cancelAffectedAccountIds = [...new Set(relatedJEItems.map((ji) => ji.accountId))];

  await cancelJournalsByPrefix(tx, jvNumber);

  if (cancelAffectedAccountIds.length > 0) {
    await recalculateAccountBalances(tx, cancelAffectedAccountIds);
  }

  await tx.productionRun.update({
    where: { id: runId },
    data: { isCancelled: true },
  });
}
