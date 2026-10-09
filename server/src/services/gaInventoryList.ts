/**
 * GA office inventory and movement lists. Item stock is the sum of per-location rows, so stock-state
 * filtering, sorting and paging happen in memory; list and KPI cards share `buildGaItemFilter`.
 */
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

// Stock state

/** out: nothing left (≤ 0) · low: below the minimum · ok: otherwise. */
export const GA_STOCK_STATES = ['out', 'low', 'ok'] as const;
export type GaStockState = (typeof GA_STOCK_STATES)[number];

/** Same thresholds as the dashboard: out = total ≤ 0, low = total < minStock. */
export function gaStockState(total: Decimal, min: Decimal): GaStockState {
  if (total.lessThanOrEqualTo(0)) return 'out';
  if (total.lessThan(min)) return 'low';
  return 'ok';
}

// Item filters

export const GA_ITEM_SORT_FIELDS = ['sku', 'name', 'category', 'totalStock', 'minStock'] as const;
export type GaItemSortField = (typeof GA_ITEM_SORT_FIELDS)[number];
/** Legacy order of the item list. */
export const DEFAULT_GA_ITEM_SORT: SortSpec<GaItemSortField> = { field: 'sku', dir: 'asc' };

const STOCK_STATES = new Set<string>(GA_STOCK_STATES);

export interface GaItemFilter {
  where: Prisma.GaInventoryItemWhereInput;
  stockStatus?: GaStockState;
  /** Location whose quantity is reported as `locationStock`. */
  locationId?: string;
}

export type GaItemFilterResult = ({ ok: true } & GaItemFilter) | { ok: false; error: string };

/**
 * Filters for the paged item list and its summary:
 *   search | q     SKU or name (q kept for legacy callers)
 *   categoryId     GA inventory category
 *   locationId     items stocked at that location (has a stock row there)
 *   isActive       true | false
 *   stockStatus    out | low | ok (total stock across locations)
 */
export function buildGaItemFilter(query: Record<string, unknown>): GaItemFilterResult {
  const and: Prisma.GaInventoryItemWhereInput[] = [];

  const categoryId = firstString(query.categoryId);
  if (categoryId) and.push({ categoryId });

  const search = firstString(query.search) ?? firstString(query.q);
  if (search) {
    and.push({
      OR: [
        { sku: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  const isActive = firstString(query.isActive);
  if (isActive) {
    if (isActive !== 'true' && isActive !== 'false') return { ok: false, error: 'Filter status item tidak dikenal.' };
    and.push({ isActive: isActive === 'true' });
  }

  const locationId = firstString(query.locationId);
  if (locationId) and.push({ stocks: { some: { locationId } } });

  const stockStatus = firstString(query.stockStatus);
  if (stockStatus && !STOCK_STATES.has(stockStatus)) {
    return { ok: false, error: 'Filter status stok tidak dikenal.' };
  }

  // A single categoryId / q filter keeps the exact legacy `where` shape.
  const where: Prisma.GaInventoryItemWhereInput = and.length === 0 ? {} : and.length === 1 ? and[0] : { AND: and };
  return {
    ok: true,
    where,
    stockStatus: stockStatus as GaStockState | undefined,
    locationId,
  };
}

// Item rows

type DecimalLike = Prisma.Decimal | Decimal | number | string;
const dec = (v: DecimalLike) => new Decimal(v.toString());

export interface GaItemSource {
  id: string;
  sku: string;
  name: string;
  uom: string;
  minStock: DecimalLike;
  imagePath: string | null;
  isActive: boolean;
  category: { code: string; name: string; type: string } | null;
  stocks: { quantity: DecimalLike; locationId: string }[];
}

/** Row shape of the legacy list (same keys, same order) + optional `locationStock`. */
export interface GaItemRow {
  id: string;
  sku: string;
  name: string;
  uom: string;
  minStock: number;
  imagePath: string | null;
  isActive: boolean;
  category: { code: string; name: string; type: string } | null;
  totalStock: number;
  lowStock: boolean;
  locationStock?: number;
}

export interface GaItemComputed {
  row: GaItemRow;
  stockState: GaStockState;
}

export function toGaItemRow(it: GaItemSource, locationId?: string): GaItemComputed {
  const total = it.stocks.reduce((sum, s) => sum.plus(dec(s.quantity)), new Decimal(0));
  const min = dec(it.minStock);
  const row: GaItemRow = {
    id: it.id,
    sku: it.sku,
    name: it.name,
    uom: it.uom,
    minStock: min.toNumber(),
    imagePath: it.imagePath,
    isActive: it.isActive,
    category: it.category,
    totalStock: total.toNumber(),
    lowStock: total.lessThan(min),
  };
  if (locationId) {
    const at = it.stocks.filter((s) => s.locationId === locationId);
    row.locationStock = at.reduce((sum, s) => sum.plus(dec(s.quantity)), new Decimal(0)).toNumber();
  }
  return { row, stockState: gaStockState(total, min) };
}

const collator = new Intl.Collator('id', { sensitivity: 'base', numeric: true });

function itemSortValue(r: GaItemRow, field: GaItemSortField): string | number {
  switch (field) {
    case 'name':
      return r.name;
    case 'category':
      return r.category?.name ?? '';
    case 'totalStock':
      return r.totalStock;
    case 'minStock':
      return r.minStock;
    default:
      return r.sku;
  }
}

/**
 * Sort rows that arrive in database SKU order (the legacy `orderBy: { sku: 'asc' }`).
 * SKU sorting keeps that order (reversed for desc) so the default page is
 * identical to the legacy one; other fields fall back to it on ties.
 */
export function sortGaItems<T extends { row: GaItemRow }>(items: readonly T[], sort: SortSpec<GaItemSortField>): T[] {
  if (sort.field === 'sku') return sort.dir === 'desc' ? [...items].reverse() : [...items];
  const sign = sort.dir === 'desc' ? -1 : 1;
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      const va = itemSortValue(a.item.row, sort.field);
      const vb = itemSortValue(b.item.row, sort.field);
      const cmp = typeof va === 'number' && typeof vb === 'number' ? va - vb : collator.compare(String(va), String(vb));
      return cmp !== 0 ? sign * cmp : a.index - b.index;
    })
    .map(({ item }) => item);
}

/** Rows matching the stock-state filter. */
export function filterGaItems(items: readonly GaItemComputed[], stockStatus?: GaStockState): GaItemComputed[] {
  return stockStatus ? items.filter((i) => i.stockState === stockStatus) : [...items];
}

export interface GaItemSummary {
  count: number;
  activeCount: number;
  okCount: number;
  lowCount: number;
  outCount: number;
}

export function summarizeGaItems(items: readonly GaItemComputed[]): GaItemSummary {
  const summary: GaItemSummary = { count: 0, activeCount: 0, okCount: 0, lowCount: 0, outCount: 0 };
  for (const { row, stockState } of items) {
    summary.count += 1;
    if (row.isActive) summary.activeCount += 1;
    if (stockState === 'ok') summary.okCount += 1;
    else if (stockState === 'low') summary.lowCount += 1;
    else summary.outCount += 1;
  }
  return summary;
}

// Movement filters

export const GA_MOVEMENT_TYPES = ['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT'] as const;
export const GA_MOVEMENT_SORT_FIELDS = ['createdAt', 'quantity'] as const;
export type GaMovementSortField = (typeof GA_MOVEMENT_SORT_FIELDS)[number];
/** Legacy order of the movement list. */
export const DEFAULT_GA_MOVEMENT_SORT: SortSpec<GaMovementSortField> = { field: 'createdAt', dir: 'desc' };

const MOVEMENT_TYPES = new Set<string>(GA_MOVEMENT_TYPES);

export type GaMovementWhereResult =
  | { ok: true; where: Prisma.GaInventoryMovementWhereInput }
  | { ok: false; error: string };

/**
 * Filters for the paged movement list:
 *   type                IN | OUT | TRANSFER | ADJUSTMENT
 *   itemId, locationId  (location matches either side)
 *   startDate/endDate   YYYY-MM-DD, movement date in the business time zone
 *   search              item SKU / name, reference number or notes
 */
export function buildGaMovementWhere(query: Record<string, unknown>): GaMovementWhereResult {
  const and: Prisma.GaInventoryMovementWhereInput[] = [];

  const type = firstString(query.type);
  if (type) {
    if (!MOVEMENT_TYPES.has(type)) return { ok: false, error: 'Tipe pergerakan tidak dikenal.' };
    and.push({ type: type as (typeof GA_MOVEMENT_TYPES)[number] });
  }

  const itemId = firstString(query.itemId);
  if (itemId) and.push({ itemId });

  const locationId = firstString(query.locationId);
  if (locationId) and.push({ OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] });

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  if (startDate || endDate) and.push({ createdAt: { ...localDayRange(startDate, endDate) } });

  const search = firstString(query.search);
  if (search) {
    and.push({
      OR: [
        { item: { sku: { contains: search, mode: 'insensitive' } } },
        { item: { name: { contains: search, mode: 'insensitive' } } },
        { referenceNo: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  return { ok: true, where: and.length ? { AND: and } : {} };
}

export function gaMovementOrderBy(
  sort: SortSpec<GaMovementSortField>,
): Prisma.GaInventoryMovementOrderByWithRelationInput[] {
  return sort.field === 'quantity'
    ? [{ quantity: sort.dir }, { createdAt: 'desc' }, { id: 'asc' }]
    : [{ createdAt: sort.dir }, { id: 'asc' }];
}
