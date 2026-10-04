/**
 * Query building for the stock movement history, GET /api/inventory/movements
 * and GET /api/inventory/movements/summary. Both share `buildStockMovementWhere`
 * so the KPI cards describe exactly the rows the list shows.
 *
 * Filters: itemId, warehouseId, movementType (StockMovementType),
 * status (active | cancelled), startDate/endDate (YYYY-MM-DD, business-day
 * range), search (movement no., reference no., notes, item code/name).
 */
import { Prisma, StockMovementType } from '@prisma/client';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

export const STOCK_MOVEMENT_SORT_FIELDS = ['date', 'movementNumber', 'item', 'quantity', 'totalValue'] as const;
export type StockMovementSortField = (typeof STOCK_MOVEMENT_SORT_FIELDS)[number];
/** Historic order of the endpoint (kept when no `sort` is sent). */
export const LEGACY_STOCK_MOVEMENT_ORDER: Prisma.StockMovementOrderByWithRelationInput[] = [{ movementNumber: 'desc' }];
export const DEFAULT_STOCK_MOVEMENT_SORT: SortSpec<StockMovementSortField> = { field: 'date', dir: 'desc' };

const MOVEMENT_TYPES = new Set<string>(Object.values(StockMovementType));
export const STOCK_MOVEMENT_STATUS_FILTERS = ['active', 'cancelled'] as const;

/** Inbound movement types (stock increases). */
export const INBOUND_TYPES: readonly StockMovementType[] = ['In', 'AdjustmentIn', 'TransferIn'];

export type StockMovementWhereResult =
  | { ok: true; where: Prisma.StockMovementWhereInput }
  | { ok: false; error: string };

export function buildStockMovementWhere(query: Record<string, unknown>): StockMovementWhereResult {
  const where: Prisma.StockMovementWhereInput = {};

  const itemId = firstString(query.itemId);
  if (itemId) where.itemId = itemId;
  const warehouseId = firstString(query.warehouseId);
  if (warehouseId) where.warehouseId = warehouseId;

  const movementType = firstString(query.movementType);
  if (movementType) {
    if (!MOVEMENT_TYPES.has(movementType)) return { ok: false, error: 'Tipe gerakan stok tidak dikenal.' };
    where.movementType = movementType as StockMovementType;
  }

  const status = firstString(query.status);
  if (status) {
    if (!(STOCK_MOVEMENT_STATUS_FILTERS as readonly string[]).includes(status)) {
      return { ok: false, error: 'Status gerakan stok tidak dikenal.' };
    }
    where.isCancelled = status === 'cancelled';
  }

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  if (startDate || endDate) where.date = { ...localDayRange(startDate, endDate) };

  const search = firstString(query.search);
  if (search) {
    where.OR = [
      { movementNumber: { contains: search, mode: 'insensitive' } },
      { referenceNumber: { contains: search, mode: 'insensitive' } },
      { notes: { contains: search, mode: 'insensitive' } },
      { item: { name: { contains: search, mode: 'insensitive' } } },
      { item: { code: { contains: search, mode: 'insensitive' } } },
    ];
  }

  return { ok: true, where };
}

export function stockMovementOrderBy(
  sort: SortSpec<StockMovementSortField>,
): Prisma.StockMovementOrderByWithRelationInput[] {
  const { field, dir } = sort;
  const primary: Prisma.StockMovementOrderByWithRelationInput =
    field === 'item' ? { item: { name: dir } } : { [field]: dir };
  // Stable tie-breaker (movement numbers are unique).
  return field === 'movementNumber' ? [primary] : [primary, { movementNumber: dir }];
}

export interface StockMovementTypeGroup {
  movementType: StockMovementType;
  isCancelled: boolean;
  _count: { _all: number };
  _sum: { quantity: Prisma.Decimal | null; totalValue: Prisma.Decimal | null };
}

export interface StockMovementSummary {
  /** Every movement matching the filters, cancelled ones included. */
  count: number;
  cancelledCount: number;
  /** Non-cancelled inbound (In, AdjustmentIn, TransferIn). */
  inCount: number;
  inQty: number;
  inValue: number;
  /** Non-cancelled outbound (Out, AdjustmentOut, TransferOut). */
  outCount: number;
  outQty: number;
  outValue: number;
}

const dec = (v: Prisma.Decimal | null | undefined) => new Prisma.Decimal(v ?? 0);

export function summarizeStockMovements(groups: readonly StockMovementTypeGroup[]): StockMovementSummary {
  let count = 0;
  let cancelledCount = 0;
  let inCount = 0;
  let outCount = 0;
  let inQty = new Prisma.Decimal(0);
  let outQty = new Prisma.Decimal(0);
  let inValue = new Prisma.Decimal(0);
  let outValue = new Prisma.Decimal(0);

  for (const g of groups) {
    const c = g._count._all;
    count += c;
    if (g.isCancelled) {
      cancelledCount += c;
      continue;
    }
    if (INBOUND_TYPES.includes(g.movementType)) {
      inCount += c;
      inQty = inQty.plus(dec(g._sum.quantity));
      inValue = inValue.plus(dec(g._sum.totalValue));
    } else {
      outCount += c;
      outQty = outQty.plus(dec(g._sum.quantity));
      outValue = outValue.plus(dec(g._sum.totalValue));
    }
  }

  return {
    count,
    cancelledCount,
    inCount,
    inQty: inQty.toDecimalPlaces(3).toNumber(),
    inValue: inValue.toDecimalPlaces(2).toNumber(),
    outCount,
    outQty: outQty.toDecimalPlaces(3).toNumber(),
    outValue: outValue.toDecimalPlaces(2).toNumber(),
  };
}
