import type { Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Resolve a warehouse id: return `preferred` if provided, otherwise the
 * default active warehouse. Returns null only when the system has no
 * default warehouse configured.
 */
export async function resolveWarehouseId(
  tx: Tx,
  preferred?: string | null,
): Promise<string | null> {
  if (preferred) return preferred;
  const def = await tx.warehouse.findFirst({
    where: { isDefault: true, isActive: true },
    select: { id: true },
  });
  return def?.id ?? null;
}

/**
 * Apply a delta to an item's stock at a specific warehouse. Use positive
 * `delta` for stock-in, negative for stock-out. Upserts the inventory_stocks
 * row when it doesn't yet exist. No-op when warehouseId is null (legacy
 * pre-multi-warehouse data path).
 *
 * Caller is still responsible for updating `inventory_items.currentStock`
 * (the denormalized total).
 */
export async function adjustWarehouseStock(
  tx: Tx,
  itemId: string,
  warehouseId: string | null,
  delta: number,
): Promise<void> {
  if (!warehouseId || delta === 0) return;
  await tx.inventoryStock.upsert({
    where: { itemId_warehouseId: { itemId, warehouseId } },
    create: { itemId, warehouseId, currentStock: delta },
    update: { currentStock: { increment: delta } },
  });
}
