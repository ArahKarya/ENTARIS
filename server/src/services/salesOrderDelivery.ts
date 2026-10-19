import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

type Tx = Prisma.TransactionClient;

/**
 * Re-link DO lines to their SO item. Lines of an SO-linked DO need `salesOrderItemId` or the SO
 * under-counts delivered qty; editing a DO recreates its lines and loses the link.
 * Lines already linked or without an inventory item are left untouched.
 */
export async function relinkDoItemsToSOInTx(tx: Tx, doId: string): Promise<void> {
  const doRec = await tx.deliveryOrder.findUnique({
    where: { id: doId },
    include: { items: true },
  });
  if (!doRec || !doRec.salesOrderId) return;

  const soItems = await tx.salesOrderItem.findMany({
    where: { salesOrderId: doRec.salesOrderId },
    select: { id: true, inventoryItemId: true },
  });

  for (const line of doRec.items) {
    if (line.salesOrderItemId || !line.inventoryItemId) continue;
    const match = soItems.find((s) => s.inventoryItemId === line.inventoryItemId);
    if (match) {
      await tx.deliveryOrderItem.update({
        where: { id: line.id },
        data: { salesOrderItemId: match.id },
      });
    }
  }
}

/**
 * Recompute each SO item's `deliveredQty` as the sum of its non-cancelled DO lines (over-delivery
 * allowed), then re-derive the SO status. Increment/decrement bookkeeping leaks when DO lines are
 * linked outside generate-do or recreated on edit. Cancelled/Draft SOs only get deliveredQty refreshed.
 */
export async function recomputeDeliveredQtyInTx(tx: Tx, soId: string): Promise<void> {
  const so = await tx.salesOrder.findUnique({
    where: { id: soId },
    include: { items: true },
  });
  if (!so) return;

  for (const item of so.items) {
    const agg = await tx.deliveryOrderItem.aggregate({
      _sum: { quantity: true },
      where: {
        salesOrderItemId: item.id,
        deliveryOrder: { status: { not: 'Cancelled' } },
      },
    });
    const delivered = agg._sum.quantity ?? new Decimal(0);
    if (!new Decimal(delivered.toString()).equals(new Decimal(item.deliveredQty.toString()))) {
      await tx.salesOrderItem.update({
        where: { id: item.id },
        data: { deliveredQty: delivered },
      });
    }
  }

  if (so.status === 'Cancelled' || so.status === 'Draft') return;

  const items = await tx.salesOrderItem.findMany({ where: { salesOrderId: soId } });
  const allFully = items.every((it) =>
    new Decimal(it.deliveredQty.toString()).gte(new Decimal(it.quantity.toString())),
  );
  const anyDelivered = items.some((it) =>
    new Decimal(it.deliveredQty.toString()).gt(0),
  );
  const newStatus = allFully ? 'FullyDelivered' : anyDelivered ? 'PartiallyDelivered' : 'Submitted';
  if (newStatus !== so.status) {
    await tx.salesOrder.update({ where: { id: soId }, data: { status: newStatus } });
  }
}
