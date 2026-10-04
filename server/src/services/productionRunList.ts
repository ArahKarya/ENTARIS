/**
 * Query building for the production run list, GET /api/inventory/production-runs
 * and GET /api/inventory/production-runs/summary. Both share
 * `buildProductionRunWhere` so the KPI cards describe the listed rows.
 *
 * Filters: status (active | cancelled), machineId, startDate/endDate
 * (YYYY-MM-DD, business-day range), search (run no., reference no., notes,
 * input/output item name or code).
 */
import { Prisma } from '@prisma/client';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

export const PRODUCTION_RUN_SORT_FIELDS = ['date', 'runNumber', 'yieldPct'] as const;
export type ProductionRunSortField = (typeof PRODUCTION_RUN_SORT_FIELDS)[number];
export const DEFAULT_PRODUCTION_RUN_SORT: SortSpec<ProductionRunSortField> = { field: 'date', dir: 'desc' };
/** Historic order of the endpoint (kept when no `sort` is sent). */
export const LEGACY_PRODUCTION_RUN_ORDER: Prisma.ProductionRunOrderByWithRelationInput = { date: 'desc' };

export const PRODUCTION_RUN_STATUS_FILTERS = ['active', 'cancelled'] as const;

export type ProductionRunWhereResult =
  | { ok: true; where: Prisma.ProductionRunWhereInput }
  | { ok: false; error: string };

export function buildProductionRunWhere(query: Record<string, unknown>): ProductionRunWhereResult {
  const where: Prisma.ProductionRunWhereInput = {};

  const status = firstString(query.status);
  if (status) {
    if (!(PRODUCTION_RUN_STATUS_FILTERS as readonly string[]).includes(status)) {
      return { ok: false, error: 'Status proses produksi tidak dikenal.' };
    }
    where.isCancelled = status === 'cancelled';
  }

  const machineId = firstString(query.machineId);
  if (machineId) where.machineId = machineId;

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  if (startDate || endDate) where.date = { ...localDayRange(startDate, endDate) };

  const search = firstString(query.search);
  if (search) {
    const contains = { contains: search, mode: 'insensitive' as const };
    where.OR = [
      { runNumber: contains },
      { referenceNumber: contains },
      { notes: contains },
      { items: { some: { item: { OR: [{ name: contains }, { code: contains }] } } } },
    ];
  }

  return { ok: true, where };
}

export function productionRunOrderBy(
  sort: SortSpec<ProductionRunSortField>,
): Prisma.ProductionRunOrderByWithRelationInput[] {
  const { field, dir } = sort;
  if (field === 'runNumber') return [{ runNumber: dir }];
  // Runs without a yield sort last in both directions.
  const primary: Prisma.ProductionRunOrderByWithRelationInput =
    field === 'yieldPct' ? { yieldPct: { sort: dir, nulls: 'last' } } : { [field]: dir };
  return [primary, { runNumber: dir }];
}

export interface ProductionRunCountGroup {
  isCancelled: boolean;
  _count: { _all: number };
}

export interface ProductionLineGroup {
  lineType: string;
  isByProduct: boolean;
  _sum: { quantity: Prisma.Decimal | null };
}

/** A non-cancelled run's stored yield and its total input quantity. */
export interface RunYield {
  yieldPct: Prisma.Decimal | number | string | null;
  inputQty: Prisma.Decimal | number | string | null;
}

export interface ProductionRunSummary {
  /** Every run matching the filters, cancelled ones included. */
  count: number;
  activeCount: number;
  cancelledCount: number;
  /** Quantities of non-cancelled runs. */
  inputQty: number;
  /** All output lines (main products and by-products). */
  outputQty: number;
  byproductQty: number;
  /**
   * Input-weighted average of the runs' own yield (Σ yield × input ÷ Σ input,
   * runs with a yield only) — consistent with the per-run Yield column.
   */
  yieldPct: number | null;
  /** The quantities' unit when every line item uses the same one, else null. */
  unit: string | null;
}

const dec = (v: Prisma.Decimal | number | string | null | undefined) => new Prisma.Decimal(v ?? 0);

export function summarizeProductionRuns(
  counts: readonly ProductionRunCountGroup[],
  lines: readonly ProductionLineGroup[],
  yields: readonly RunYield[],
  units: readonly string[] = [],
): ProductionRunSummary {
  let count = 0;
  let cancelledCount = 0;
  for (const g of counts) {
    count += g._count._all;
    if (g.isCancelled) cancelledCount += g._count._all;
  }
  let input = new Prisma.Decimal(0);
  let output = new Prisma.Decimal(0);
  let byproduct = new Prisma.Decimal(0);
  for (const l of lines) {
    const q = dec(l._sum.quantity);
    if (l.lineType === 'Input') {
      input = input.plus(q);
      continue;
    }
    output = output.plus(q);
    if (l.lineType === 'ByProduct' || l.isByProduct) byproduct = byproduct.plus(q);
  }
  let weighted = new Prisma.Decimal(0);
  let weight = new Prisma.Decimal(0);
  for (const y of yields) {
    if (y.yieldPct === null || y.yieldPct === undefined) continue;
    const w = dec(y.inputQty);
    if (w.lte(0)) continue;
    weighted = weighted.plus(dec(y.yieldPct).mul(w));
    weight = weight.plus(w);
  }
  return {
    count,
    activeCount: count - cancelledCount,
    cancelledCount,
    inputQty: input.toDecimalPlaces(3).toNumber(),
    outputQty: output.toDecimalPlaces(3).toNumber(),
    byproductQty: byproduct.toDecimalPlaces(3).toNumber(),
    yieldPct: weight.gt(0) ? weighted.div(weight).toDecimalPlaces(2).toNumber() : null,
    unit: new Set(units).size === 1 ? units[0] : null,
  };
}
