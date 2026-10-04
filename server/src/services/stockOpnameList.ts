/**
 * Query building + row enrichment for the stock opname list
 * (GET /api/stock-opname).
 *
 * The opname header does not store its warehouse: the warehouse picked in the
 * form lives on the adjustment stock movements (referenceType 'StockOpname')
 * and, for older data, possibly on the lines. The warehouse filter therefore
 * resolves matching opname ids from movements first (see the route) and an
 * opname without any difference (no movement) cannot be attributed to a
 * warehouse.
 */
import { Prisma, StockOpnameStatus } from '@prisma/client';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

export const STOCK_OPNAME_SORT_FIELDS = ['date', 'opnameNumber'] as const;
export type StockOpnameSortField = (typeof STOCK_OPNAME_SORT_FIELDS)[number];
export const DEFAULT_STOCK_OPNAME_SORT: SortSpec<StockOpnameSortField> = { field: 'date', dir: 'desc' };

/** Movement referenceType written by POST /stock-opname. */
export const OPNAME_REFERENCE_TYPE = 'StockOpname';

const STATUSES = new Set<string>(Object.values(StockOpnameStatus));

export type StockOpnameWhereResult =
  | { ok: true; where: Prisma.StockOpnameWhereInput }
  | { ok: false; error: string };

export interface StockOpnameWhereOptions {
  /**
   * Opname ids whose adjustment movements hit `query.warehouseId`; required
   * when that filter is set (resolved by the caller with one query).
   */
  warehouseOpnameIds?: readonly string[];
}

export function buildStockOpnameWhere(
  query: Record<string, unknown>,
  options: StockOpnameWhereOptions = {},
): StockOpnameWhereResult {
  const where: Prisma.StockOpnameWhereInput = {};
  const and: Prisma.StockOpnameWhereInput[] = [];

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status stok opname tidak dikenal.' };
    where.status = status as StockOpnameStatus;
  }

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) {
    return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  }
  if (startDate || endDate) {
    where.date = { ...localDayRange(startDate, endDate) };
  }

  const warehouseId = firstString(query.warehouseId);
  if (warehouseId) {
    and.push({
      OR: [
        { id: { in: [...(options.warehouseOpnameIds ?? [])] } },
        { items: { some: { warehouseId } } },
      ],
    });
  }

  const search = firstString(query.search);
  if (search) {
    and.push({
      OR: [
        { opnameNumber: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
        { createdBy: { fullName: { contains: search, mode: 'insensitive' } } },
      ],
    });
  }

  if (and.length === 1) Object.assign(where, and[0]);
  else if (and.length > 1) where.AND = and;

  return { ok: true, where };
}

export function stockOpnameOrderBy(
  sort: SortSpec<StockOpnameSortField>,
): Prisma.StockOpnameOrderByWithRelationInput[] {
  const { field, dir } = sort;
  const primary: Prisma.StockOpnameOrderByWithRelationInput = { [field]: dir };
  // Stable tie-breaker so rows never jump between pages.
  return field === 'opnameNumber' ? [primary] : [primary, { opnameNumber: dir }];
}

type DecimalLike = Prisma.Decimal | number | string;

export interface OpnameLineValue {
  stockOpnameId: string;
  difference: DecimalLike;
  totalValue: DecimalLike;
}

export interface OpnameVariance {
  /** Σ |totalValue| over all lines (same arithmetic as the legacy list). */
  totalVariance: number;
  /** Lines whose difference is not zero. */
  itemsWithDiff: number;
}

/** Per-opname variance from the lines of a whole page (one query instead of N). */
export function summarizeOpnameLines(lines: readonly OpnameLineValue[]): Map<string, OpnameVariance> {
  const out = new Map<string, OpnameVariance>();
  for (const line of lines) {
    const acc = out.get(line.stockOpnameId) ?? { totalVariance: 0, itemsWithDiff: 0 };
    acc.totalVariance += Math.abs(Number(line.totalValue));
    if (Number(line.difference) !== 0) acc.itemsWithDiff += 1;
    out.set(line.stockOpnameId, acc);
  }
  return out;
}

export interface WarehouseRef {
  id: string;
  code: string;
  name: string;
}

export interface OpnameMovementWarehouse {
  referenceId: string | null;
  warehouse: WarehouseRef | null;
}

/** Opname id → distinct warehouses its adjustment movements touched. */
export function opnameWarehouses(rows: readonly OpnameMovementWarehouse[]): Map<string, WarehouseRef[]> {
  const out = new Map<string, WarehouseRef[]>();
  for (const row of rows) {
    if (!row.referenceId || !row.warehouse) continue;
    const list = out.get(row.referenceId) ?? [];
    if (!list.some((w) => w.id === row.warehouse!.id)) list.push(row.warehouse);
    out.set(row.referenceId, list);
  }
  return out;
}
