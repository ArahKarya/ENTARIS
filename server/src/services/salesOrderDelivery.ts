import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';

type Tx = Prisma.TransactionClient;

/**
 * Re-link any DO lines of a delivery order back to their SO item.
 *
 * When a DO is linked to a Sales Order at the header level, every line that
 * shares the SO item's inventory item must also carry `salesOrderItemId` —
 * otherwise the line is invisible to delivered-qty accounting and the SO
 * under-counts what was actually shipped. Editing a DO drops & recreates its
 * lines (losing the link), so this restores it. Lines already linked, or
 * without an inventory item, are left untouched.
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
 * Recompute `deliveredQty` for every item of a Sales Order from the single
 * source of truth: the sum of quantities across all non-cancelled delivery
 * order lines linked to that SO item. Then re-derive the SO status.
 *
 * This replaces the fragile increment/decrement model. Increments leak
 * whenever a DO line is linked outside `generate-do`, and decrements leak
 * when a linked DO is edited (lines are deleted & recreated). Deriving from
 * the actual DO lines makes the SO always mirror real surat-jalan numbers —
 * including legitimate over-delivery (deliveredQty > quantity).
 *
 * Cancelled / Draft SOs keep their status; only deliveredQty is refreshed.
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
