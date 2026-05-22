import type { Prisma } from '@prisma/client';
import { BusinessError } from '../utils/errors';
import { adjustWarehouseStock } from '../utils/warehouseStock';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

/**
 * Cancel a submitted delivery order (Surat Jalan):
 *   - reject if already cancelled or already folded into a sales invoice
 *     (caller must cancel the invoice first)
 *   - for each line linked to a stockMovement: restore item.currentStock,
 *     restore per-warehouse inventory_stocks, mark the movement isCancelled
 *   - flip DO status to Cancelled
 *
 * No GL impact (DO submit never posted any). Caller owns the surrounding
 * $transaction. Returns the cancelled DO ID + new status.
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

  // Revert deliveredQty di SO items + recompute SO status (kalau DO link ke SO).
  if (deliveryOrder.salesOrderId) {
    for (const line of deliveryOrder.items) {
      if (line.salesOrderItemId) {
        await tx.salesOrderItem.update({
          where: { id: line.salesOrderItemId },
          data: { deliveredQty: { decrement: Number(line.quantity) } },
        });
      }
    }
    // Recompute SO status.
    const so = await tx.salesOrder.findUnique({
      where: { id: deliveryOrder.salesOrderId },
      include: { items: true },
    });
    if (so && so.status !== 'Cancelled' && so.status !== 'Draft') {
      const items = so.items;
      const allFully = items.every((it) =>
        Number(it.deliveredQty) >= Number(it.quantity),
      );
      const anyDelivered = items.some((it) => Number(it.deliveredQty) > 0);
      const newStatus = allFully ? 'FullyDelivered' : anyDelivered ? 'PartiallyDelivered' : 'Submitted';
      if (newStatus !== so.status) {
        await tx.salesOrder.update({ where: { id: so.id }, data: { status: newStatus } });
      }
    }
  }

  await tx.deliveryOrder.update({
    where: { id: doId },
    data: { status: 'Cancelled', cancelledAt: new Date() },
  });

  logger.info({ doId, doNumber: deliveryOrder.doNumber }, 'Delivery order cancelled');

  return { id: deliveryOrder.id, status: 'Cancelled' };
}
