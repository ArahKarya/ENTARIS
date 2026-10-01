import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { recalculateAccountBalances } from '../utils/accountBalance';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

const NEAR_ZERO_QTY = 0.0005;

/**
 * Balik semua auto-settle COGS backfill yang dipicu oleh satu dokumen stok-masuk
 * (ProductionRun / PurchaseInvoice / StockMovement). Dipanggil saat dokumen
 * pemicu dibatalkan atau diedit (sebelum dibuat ulang).
 *
 * Yang dikembalikan:
 *   - JV auto-settle (JV-YYYYMM-nnnn, narasi "Auto-settle COGS ...") → Cancelled + ALE
 *   - qtyPending/status antrean (cogs_backfill_queue) → seperti sebelum settle
 *   - averageCost item → dibalik sebesar differential yang pernah disesuaikan
 *   - catatan cogs_backfill_settlements → dihapus
 *
 * Aman dipanggil kalau tidak ada settlement (return 0 tanpa tulis DB).
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

  // 1) Batalkan JV auto-settle (satu JV bisa dipakai banyak settlement per batch)
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

  // 2) Kembalikan antrean + averageCost per item (differential total per item)
  const diffByItem = new Map<string, Decimal>();
  for (const s of settlements) {
    const q = s.queue;
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
    // simpan diff per item (untuk balik averageCost)
    const prev = diffByItem.get(q.inventoryItemId) ?? new Decimal(0);
    // hanya settlement yang punya JV material yang menyesuaikan averageCost
    if (s.journalEntryId) diffByItem.set(q.inventoryItemId, prev.plus(s.differential.toString()));
  }

  // 3) Hapus catatan settlement (setelah antrean dikembalikan)
  await tx.cogsBackfillSettlement.deleteMany({ where: { id: { in: settlements.map((s) => s.id) } } });

  // 4) Balik penyesuaian averageCost: settle menghitung newAvg = (stok*avg - diff)/stok.
  //    Kebalikan: avg' = (stok*avg + diff)/stok. Lewati kalau stok ~0.
  for (const [itemId, diff] of diffByItem) {
    if (diff.abs().lt(0.005)) continue;
    const item = await tx.inventoryItem.findUnique({ where: { id: itemId }, select: { currentStock: true, averageCost: true } });
    if (!item) continue;
    const stock = new Decimal(item.currentStock.toString());
    if (stock.abs().lte(NEAR_ZERO_QTY)) continue;
    const newAvg = stock.mul(item.averageCost.toString()).plus(diff).div(stock).toDecimalPlaces(2);
    await tx.inventoryItem.update({
      where: { id: itemId },
      data: { averageCost: newAvg.lt(0) ? 0 : newAvg.toNumber() },
    });
  }

  // 5) Hitung ulang cache saldo akun terdampak dari ledger
  if (affectedAccountIds.size > 0) await recalculateAccountBalances(tx, [...affectedAccountIds]);

  logger.info(
    { triggerSource, triggerRefId, reversed: settlements.length, journalsCancelled },
    'COGS backfill settlements reversed',
  );
  return { reversed: settlements.length, journalsCancelled };
}
