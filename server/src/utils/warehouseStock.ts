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

/**
 * Read current per-warehouse stock for a set of (itemId, warehouseId) pairs.
 * Returns a Map keyed by `${itemId}::${warehouseId}` -> current stock number.
 * Missing inventory_stocks rows are reported as 0 (no row == never stocked).
 *
 * This is the read-side counterpart of `adjustWarehouseStock` and the ONLY
 * correct basis for "is there enough stock" checks: `inventory_items.
 * currentStock` is a denormalized total across every warehouse and will
 * happily pass a check for a warehouse that is actually empty.
 */
export async function getWarehouseStockMap(
  tx: Tx,
  pairs: Array<{ itemId: string; warehouseId: string }>,
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (pairs.length === 0) return map;
  const rows = await tx.inventoryStock.findMany({
    where: { OR: pairs.map((p) => ({ itemId: p.itemId, warehouseId: p.warehouseId })) },
    select: { itemId: true, warehouseId: true, currentStock: true },
  });
  for (const r of rows) {
    map.set(`${r.itemId}::${r.warehouseId}`, Number(r.currentStock));
  }
  return map;
}
