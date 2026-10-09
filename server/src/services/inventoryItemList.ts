/**
 * Stock item list, filtered and sorted in memory: with `warehouseId` stock is the per-warehouse
 * balance, which Prisma cannot sort on. Callers sending none of sort/stockStatus/category (pickers,
 * AIRA) get the plain behaviour (see `usesListMode`).
 */
import { firstString, type SortSpec } from '../utils/listQuery';

export const ITEM_SORT_FIELDS = ['code', 'name', 'category', 'currentStock', 'minimumStock', 'stockValue'] as const;
export type ItemSortField = (typeof ITEM_SORT_FIELDS)[number];
export const DEFAULT_ITEM_SORT: SortSpec<ItemSortField> = { field: 'currentStock', dir: 'desc' };

/** Stock state of an item: out (≤ 0), low (below a set minimum) or ok. */
export const ITEM_STOCK_STATUSES = ['out', 'low', 'ok'] as const;
export type ItemStockStatus = (typeof ITEM_STOCK_STATUSES)[number];

type Num = number | string | { toString(): string } | null | undefined;
const n = (v: Num): number => {
  const x = Number(v ?? 0);
  return Number.isFinite(x) ? x : 0;
};

export function itemStockStatus(currentStock: Num, minimumStock: Num): ItemStockStatus {
  const cur = n(currentStock);
  const min = n(minimumStock);
  if (cur <= 0) return 'out';
  if (min > 0 && cur < min) return 'low';
  return 'ok';
}

export interface ItemListFilters {
  search?: string;
  isActive?: boolean;
  warehouseId?: string;
  category?: string;
  stockStatus?: ItemStockStatus;
}

export type ItemFilterResult = { ok: true; filters: ItemListFilters } | { ok: false; error: string };

export function parseItemListFilters(query: Record<string, unknown>): ItemFilterResult {
  const filters: ItemListFilters = {};

  const isActive = firstString(query.isActive);
  if (isActive !== undefined) {
    if (isActive !== 'true' && isActive !== 'false') {
      return { ok: false, error: 'Filter isActive harus true atau false.' };
    }
    filters.isActive = isActive === 'true';
  }

  const stockStatus = firstString(query.stockStatus);
  if (stockStatus !== undefined) {
    if (!(ITEM_STOCK_STATUSES as readonly string[]).includes(stockStatus)) {
      return { ok: false, error: 'Status stok tidak dikenal.' };
    }
    filters.stockStatus = stockStatus as ItemStockStatus;
  }

  const search = firstString(query.search);
  if (search) filters.search = search;
  const warehouseId = firstString(query.warehouseId);
  if (warehouseId) filters.warehouseId = warehouseId;
  const category = firstString(query.category);
  if (category) filters.category = category;

  return { ok: true, filters };
}

/** True when the caller uses the list-page params (new sort/filter mode). */
export function usesListMode(query: Record<string, unknown>): boolean {
  return ['sort', 'stockStatus', 'category'].some((k) => firstString(query[k]) !== undefined);
}

/** Prisma `where` for the DB part of the filter (search, active flag, category). */
export function itemDbWhere(filters: ItemListFilters): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (filters.isActive !== undefined) where.isActive = filters.isActive;
  if (filters.category) where.category = filters.category;
  if (filters.search) {
    where.OR = [
      { name: { contains: filters.search, mode: 'insensitive' } },
      { code: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  return where;
}

export interface ItemLike {
  code: string;
  name: string;
  category?: string | null;
  isActive?: boolean;
  currentStock: Num;
  minimumStock: Num;
  averageCost?: Num;
}

export const itemStockValue = (item: ItemLike): number => n(item.currentStock) * n(item.averageCost);

function sortKey(item: ItemLike, field: ItemSortField): number | string {
  switch (field) {
    case 'currentStock':
      return n(item.currentStock);
    case 'minimumStock':
      return n(item.minimumStock);
    case 'stockValue':
      return itemStockValue(item);
    case 'category':
      return (item.category ?? '').toLocaleLowerCase('id-ID');
    case 'name':
      return item.name.toLocaleLowerCase('id-ID');
    default:
      return item.code;
  }
}

/** Sorts a copy; ties broken by item code ascending so pages never shuffle. */
export function sortItems<T extends ItemLike>(items: readonly T[], sort: SortSpec<ItemSortField>): T[] {
  const sign = sort.dir === 'desc' ? -1 : 1;
  return [...items].sort((a, b) => {
    const ka = sortKey(a, sort.field);
    const kb = sortKey(b, sort.field);
    const primary =
      typeof ka === 'number' && typeof kb === 'number' ? ka - kb : String(ka).localeCompare(String(kb), 'id-ID');
    if (primary !== 0) return primary * sign;
    return a.code.localeCompare(b.code);
  });
}

export function filterByStockStatus<T extends ItemLike>(items: readonly T[], status?: ItemStockStatus): T[] {
  if (!status) return [...items];
  return items.filter((i) => itemStockStatus(i.currentStock, i.minimumStock) === status);
}

export interface ItemListSummary {
  count: number;
  activeCount: number;
  lowCount: number;
  outCount: number;
  /** Σ stock × average cost (WAC) of the matching items. */
  stockValue: number;
  /** Distinct categories across all items (for the category filter). */
  categories: string[];
}

export function summarizeItems(items: readonly ItemLike[], allCategories: readonly (string | null)[]): ItemListSummary {
  let activeCount = 0;
  let lowCount = 0;
  let outCount = 0;
  let stockValue = 0;
  for (const item of items) {
    if (item.isActive !== false) activeCount += 1;
    const status = itemStockStatus(item.currentStock, item.minimumStock);
    if (status === 'low') lowCount += 1;
    if (status === 'out') outCount += 1;
    stockValue += itemStockValue(item);
  }
  const categories = [...new Set(allCategories.filter((c): c is string => !!c && c.trim().length > 0))].sort((a, b) =>
    a.localeCompare(b, 'id-ID'),
  );
  return {
    count: items.length,
    activeCount,
    lowCount,
    outCount,
    stockValue: Math.round(stockValue * 100) / 100,
    categories,
  };
}
