import { unlinkTemporaryNotesFromDoInTx } from './temporaryDeliveryNote';
import type { Prisma } from '@prisma/client';
import { BusinessError } from '../utils/errors';
import { adjustWarehouseStock } from '../utils/warehouseStock';
import { recomputeDeliveredQtyInTx } from './salesOrderDelivery';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

/**
 * Cancel a submitted delivery order: rejected if already invoiced (cancel the invoice first);
 * restores item and per-warehouse stock. No GL impact. Caller owns the transaction.
 */
export async function cancelDeliveryOrderInTx(
  tx: Tx,
  doId: string,
): Promise<{ id: string; status: 'Cancelled' }> {
  const deliveryOrder = await tx.deliveryOrder.findUnique({
    where: { id: doId },
    include: {
      items: {
        include: { stockMovement: true },
      },
    },
  });
  if (!deliveryOrder) throw new BusinessError('Surat jalan tidak ditemukan.');
  if (deliveryOrder.status === 'Cancelled') {
    throw new BusinessError('Surat jalan sudah dibatalkan.');
  }
  if (deliveryOrder.invoiceId) {
    throw new BusinessError('Batalkan invoice terkait dulu sebelum batalkan surat jalan.');
  }

  for (const line of deliveryOrder.items) {
    if (!line.stockMovementId) continue;

    const sm = line.stockMovement;
    if (!sm || sm.isCancelled) {
      logger.warn(
        { doId, doNumber: deliveryOrder.doNumber, lineId: line.id, stockMovementId: line.stockMovementId },
        'DO cancel: linked stockMovement missing or already cancelled, skipping reversal',
      );
      continue;
    }

    const qty = Number(line.quantity);

    if (line.inventoryItemId) {
      await tx.inventoryItem.update({
        where: { id: line.inventoryItemId },
        data: { currentStock: { increment: qty } },
      });
      await adjustWarehouseStock(tx, line.inventoryItemId, line.warehouseId, qty);
    }

    await tx.stockMovement.update({
      where: { id: sm.id },
      data: { isCancelled: true },
    });
  }

  // Flip status FIRST so the cancelled DO's lines drop out of the recompute.
  await tx.deliveryOrder.update({
    where: { id: doId },
    data: { status: 'Cancelled', cancelledAt: new Date() },
  });

  // Surat Jalan Sementara yang tertaut ke DO ini kembali Terbuka
  await unlinkTemporaryNotesFromDoInTx(tx, doId);

  // Re-derive SO delivered_qty + status from the remaining active DO lines
  // (single source of truth — no fragile per-line decrement).
  if (deliveryOrder.salesOrderId) {
    await recomputeDeliveredQtyInTx(tx, deliveryOrder.salesOrderId);
  }

  logger.info({ doId, doNumber: deliveryOrder.doNumber }, 'Delivery order cancelled');

  return { id: deliveryOrder.id, status: 'Cancelled' };
}
