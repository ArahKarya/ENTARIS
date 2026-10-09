// Per-warehouse stock as of the end of a date. Forward-summing movements is wrong (opening
// balances and some adjustments have no StockMovement row), so this anchors on live
// inventory_stocks and walks backward: qty_asof(X) = live - sum(signed movements after X).
// Value uses the item's current averageCost (no running cost per movement), so far-past dates
// are approximate; see `valuationNote`.

import Decimal from 'decimal.js';
import { StockMovementType } from '@prisma/client';
import { prisma } from '../lib/prisma';

const IN_TYPES: StockMovementType[] = [
  StockMovementType.In,
  StockMovementType.AdjustmentIn,
  StockMovementType.TransferIn,
];

export interface SnapshotItem {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  category: string | null;  // klasifikasi: Bahan Baku / Produk Jadi / dll
  qty: number;          // stock as-of end-of-date (exact)
  averageCost: number;  // current avg cost (see valuation note)
  value: number;        // qty * averageCost
}

export interface SnapshotWarehouse {
  warehouseId: string;
  code: string;
  name: string;
  location: string | null;
  isDefault: boolean;
  items: SnapshotItem[];   // only non-zero qty, sorted desc by qty
  totalValue: number;
  itemCount: number;
}

export interface StockSnapshot {
  asOfDate: string;        // YYYY-MM-DD
  warehouses: SnapshotWarehouse[];
  grandTotalValue: number;
  valuationNote: string;
}

/**
 * Build a per-warehouse stock snapshot as of the end of `dateStr` (YYYY-MM-DD).
 * @param dateStr - target date (inclusive, end-of-day)
 * @param warehouseIds - optional filter; when omitted, all active warehouses
 */
export async function buildStockSnapshot(
  dateStr: string,
  warehouseIds?: string[],
): Promise<StockSnapshot> {
  const dayEnd = new Date(dateStr);
  dayEnd.setHours(23, 59, 59, 999);

  const warehouses = await prisma.warehouse.findMany({
    where: warehouseIds && warehouseIds.length > 0
      ? { id: { in: warehouseIds } }
      : { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  if (warehouses.length === 0) {
    return { asOfDate: dateStr, warehouses: [], grandTotalValue: 0, valuationNote: NOTE };
  }
  const whIds = warehouses.map((w) => w.id);

  // Anchor: live per-warehouse stock (source of truth).
  const liveStocks = await prisma.inventoryStock.findMany({
    where: { warehouseId: { in: whIds } },
    include: { item: { select: { id: true, code: true, name: true, unit: true, averageCost: true, category: true } } },
  });

  // key = `${warehouseId}|${itemId}` → qty as-of (Decimal). Seed with live.
  const qtyMap = new Map<string, Decimal>();
  const itemMap = new Map<string, { id: string; code: string; name: string; unit: string; category: string | null; averageCost: Decimal }>();
  for (const ls of liveStocks) {
    const k = `${ls.warehouseId}|${ls.itemId}`;
    qtyMap.set(k, new Decimal(ls.currentStock.toString()));
    itemMap.set(ls.itemId, {
      id: ls.item.id, code: ls.item.code, name: ls.item.name, unit: ls.item.unit,
      category: (ls.item as any).category ?? null,
      averageCost: new Decimal((ls.item.averageCost ?? 0).toString()),
    });
  }

  // groupBy cannot sign conditionally, so In and Out are fetched separately (date > dayEnd).
  const afterFilter = { warehouseId: { in: whIds }, isCancelled: false, date: { gt: dayEnd } };
  const [inAfter, outAfter] = await Promise.all([
    prisma.stockMovement.groupBy({
      by: ['warehouseId', 'itemId'],
      where: { ...afterFilter, movementType: { in: IN_TYPES } },
      _sum: { quantity: true },
    }),
    prisma.stockMovement.groupBy({
      by: ['warehouseId', 'itemId'],
      where: { ...afterFilter, movementType: { notIn: IN_TYPES } },
      _sum: { quantity: true },
    }),
  ]);

  const adjust = (whId: string | null, itemId: string, delta: Decimal) => {
    if (!whId) return;
    const k = `${whId}|${itemId}`;
    qtyMap.set(k, (qtyMap.get(k) ?? new Decimal(0)).plus(delta));
  };
  // Reverse a future IN (it added stock after X → subtract it to go back).
  for (const r of inAfter) adjust(r.warehouseId, r.itemId, new Decimal((r._sum?.quantity ?? 0).toString()).negated());
  // Reverse a future OUT (it removed stock after X → add it back).
  for (const r of outAfter) adjust(r.warehouseId, r.itemId, new Decimal((r._sum?.quantity ?? 0).toString()));

  // An item with no live row but movements after X (fully consumed since) —
  // resolve its metadata so it still appears in the historical snapshot.
  const missingItemIds = [...new Set(
    [...inAfter, ...outAfter]
      .map((r) => r.itemId)
      .filter((id) => !itemMap.has(id)),
  )];
  if (missingItemIds.length > 0) {
    const extra = await prisma.inventoryItem.findMany({
      where: { id: { in: missingItemIds } },
      select: { id: true, code: true, name: true, unit: true, averageCost: true, category: true },
    });
    for (const it of extra) {
      itemMap.set(it.id, {
        id: it.id, code: it.code, name: it.name, unit: it.unit,
        category: it.category ?? null,
        averageCost: new Decimal((it.averageCost ?? 0).toString()),
      });
    }
  }

  const result: SnapshotWarehouse[] = warehouses.map((w) => {
    const whItems: SnapshotItem[] = [];
    for (const [k, qtyDec] of qtyMap.entries()) {
      const [whId, itemId] = k.split('|') as [string, string];
      if (whId !== w.id) continue;
      if (qtyDec.isZero()) continue;
      const meta = itemMap.get(itemId);
      if (!meta) continue;
      const avg = meta.averageCost;
      const qty = qtyDec.toDecimalPlaces(3).toNumber();
      whItems.push({
        itemId,
        code: meta.code,
        name: meta.name,
        unit: meta.unit,
        category: meta.category,
        qty,
        averageCost: avg.toDecimalPlaces(2).toNumber(),
        value: qtyDec.mul(avg).toDecimalPlaces(2).toNumber(),
      });
    }
    whItems.sort((a, b) => b.qty - a.qty);
    const totalValue = whItems.reduce((s, it) => s + it.value, 0);
    return {
      warehouseId: w.id,
      code: w.code,
      name: w.name,
      location: w.location,
      isDefault: w.isDefault,
      items: whItems,
      totalValue,
      itemCount: whItems.length,
    };
  });

  return {
    asOfDate: dateStr,
    warehouses: result,
    grandTotalValue: result.reduce((s, w) => s + w.totalValue, 0),
    valuationNote: NOTE,
  };
}

const NOTE =
  'Kuantitas dihitung tepat dari riwayat pergerakan stok per tanggal. ' +
  'Nilai memakai harga rata-rata (avg cost) terkini sebagai estimasi.';
