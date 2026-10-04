/**
 * Aggregates for the Stok & Produksi dashboard (GET /api/inventory/dashboard/*).
 *
 * Stock value follows the inventory module's operational valuation (physical
 * qty × weighted average cost), the same figure as /dashboard/metrics and
 * /items/summary — not the GL balance.
 */

export const STOCK_VALUE_GROUPS = ['category', 'warehouse'] as const;
export type StockValueGroupBy = (typeof STOCK_VALUE_GROUPS)[number];

/** Maximum bars returned; the tail is folded into one "Lainnya" group. */
export const STOCK_VALUE_GROUP_LIMIT = 8;
export const OTHER_GROUP_KEY = '__other__';
export const NONE_GROUP_KEY = '__none__';

const NONE_LABEL: Record<StockValueGroupBy, string> = {
  category: 'Tanpa kategori',
  warehouse: 'Tanpa gudang',
};

/** `undefined`/empty → category (default); unknown value → null (400). */
export function parseStockValueGroupBy(value: unknown): StockValueGroupBy | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (raw === undefined || raw === null || raw === '') return 'category';
  return (STOCK_VALUE_GROUPS as readonly string[]).includes(String(raw)) ? (raw as StockValueGroupBy) : null;
}

type Num = number | string | { toString(): string } | null | undefined;
const num = (v: Num): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};
const round2 = (n: number): number => Math.round(n * 100) / 100;

/** One stock position: an item (category view) or an item in a warehouse. */
export interface StockValueRow {
  /** Group key (category name or warehouse id); null/blank = ungrouped. */
  key: string | null | undefined;
  /** Display label; defaults to the key. */
  label?: string | null;
  quantity: Num;
  unitCost: Num;
}

export interface StockValueGroup {
  key: string;
  label: string;
  /** Positions in the group holding stock (quantity > 0). */
  itemCount: number;
  value: number;
  /** value ÷ total (0..1); 0 when the total is not positive. */
  share: number;
}

export interface StockValueBreakdown {
  groupBy: StockValueGroupBy;
  total: number;
  groups: StockValueGroup[];
}

/**
 * Groups stock positions by key, sorted by value descending. With more than
 * `limit` groups the smallest ones are folded into a single "Lainnya" group so
 * the chart stays readable; totals are unaffected.
 */
export function summarizeStockValue(
  rows: readonly StockValueRow[],
  groupBy: StockValueGroupBy,
  limit: number = STOCK_VALUE_GROUP_LIMIT,
): StockValueBreakdown {
  const map = new Map<string, { label: string; itemCount: number; value: number }>();
  let total = 0;
  for (const row of rows) {
    const rawKey = typeof row.key === 'string' ? row.key.trim() : '';
    const key = rawKey || NONE_GROUP_KEY;
    const label = key === NONE_GROUP_KEY ? NONE_LABEL[groupBy] : (row.label?.trim() || rawKey);
    const qty = num(row.quantity);
    const value = qty * num(row.unitCost);
    total += value;
    const entry = map.get(key) ?? { label, itemCount: 0, value: 0 };
    entry.value += value;
    if (qty > 0) entry.itemCount += 1;
    map.set(key, entry);
  }

  const sorted = [...map.entries()]
    .map(([key, g]) => ({ key, label: g.label, itemCount: g.itemCount, value: g.value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'id-ID'));

  const max = Math.max(1, Math.floor(limit));
  const kept = sorted.length > max ? sorted.slice(0, max - 1) : sorted;
  const tail = sorted.length > max ? sorted.slice(max - 1) : [];
  const groups = tail.length
    ? [
        ...kept,
        {
          key: OTHER_GROUP_KEY,
          label: `Lainnya (${tail.length})`,
          itemCount: tail.reduce((s, g) => s + g.itemCount, 0),
          value: tail.reduce((s, g) => s + g.value, 0),
        },
      ]
    : kept;

  return {
    groupBy,
    total: round2(total),
    groups: groups.map((g) => ({
      ...g,
      value: round2(g.value),
      share: total > 0 ? Math.round((g.value / total) * 10000) / 10000 : 0,
    })),
  };
}
