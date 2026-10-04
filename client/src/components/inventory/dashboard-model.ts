/**
 * Pure rules for the Stok & Produksi dashboards (inventory: no ?tab,
 * production: ?tab=production without ?view). No React, unit tested.
 *
 * The reporting period lives in the URL:
 *   ?period=thisMonth|lastMonth|last30|thisQuarter|ytd      (default thisMonth)
 *   ?period=custom&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 */
import type { StatDelta } from '@/components/shared';
import { formatDateRange, formatNumber, formatPercent, parseDate } from '@/lib/format';

// ─── Period ─────────────────────────────────────────────────────────────────

export const PERIOD_PARAM = 'period';
export const PERIOD_START_PARAM = 'startDate';
export const PERIOD_END_PARAM = 'endDate';

export type PeriodPreset = 'thisMonth' | 'lastMonth' | 'last30' | 'thisQuarter' | 'ytd' | 'custom';

export const PERIOD_PRESETS: ReadonlyArray<{ value: PeriodPreset; label: string }> = [
  { value: 'thisMonth', label: 'Bulan ini' },
  { value: 'lastMonth', label: 'Bulan lalu' },
  { value: 'last30', label: '30 hari terakhir' },
  { value: 'thisQuarter', label: 'Kuartal ini' },
  { value: 'ytd', label: 'Tahun berjalan' },
  { value: 'custom', label: 'Rentang khusus' },
];

export const DEFAULT_PERIOD: PeriodPreset = 'thisMonth';

export interface DashboardPeriod {
  preset: PeriodPreset;
  /** Inclusive YYYY-MM-DD bounds (business days, local time). */
  startDate: string;
  endDate: string;
  /** "Bulan ini" etc. */
  label: string;
  /** "1–4 Okt 2026" */
  rangeLabel: string;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** A real calendar date in YYYY-MM-DD form (rejects 2026-02-30). */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !ISO_DATE.test(value)) return false;
  const d = parseDate(value);
  return !!d && toIsoDate(d) === value;
}

const isPreset = (v: string | null | undefined): v is PeriodPreset =>
  PERIOD_PRESETS.some((p) => p.value === v);

function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today: Date): { startDate: string; endDate: string } {
  const y = today.getFullYear();
  const m = today.getMonth();
  const end = toIsoDate(today);
  switch (preset) {
    case 'lastMonth':
      return { startDate: toIsoDate(new Date(y, m - 1, 1)), endDate: toIsoDate(new Date(y, m, 0)) };
    case 'last30':
      return { startDate: toIsoDate(new Date(y, m, today.getDate() - 29)), endDate: end };
    case 'thisQuarter':
      return { startDate: toIsoDate(new Date(y, Math.floor(m / 3) * 3, 1)), endDate: end };
    case 'ytd':
      return { startDate: toIsoDate(new Date(y, 0, 1)), endDate: end };
    default:
      return { startDate: toIsoDate(new Date(y, m, 1)), endDate: end };
  }
}

export interface PeriodParams {
  period?: string | null;
  startDate?: string | null;
  endDate?: string | null;
}

/**
 * Resolves the URL params to a concrete range. Invalid or incomplete custom
 * ranges fall back to the default preset; a reversed custom range is swapped.
 */
export function resolvePeriod(params: PeriodParams, today: Date = new Date()): DashboardPeriod {
  const raw = isPreset(params.period) ? params.period : DEFAULT_PERIOD;
  let preset: PeriodPreset = raw;
  let range: { startDate: string; endDate: string };
  if (raw === 'custom' && isIsoDate(params.startDate) && isIsoDate(params.endDate)) {
    const [a, b] = [params.startDate, params.endDate].sort();
    range = { startDate: a, endDate: b };
  } else {
    preset = raw === 'custom' ? DEFAULT_PERIOD : raw;
    range = presetRange(preset as Exclude<PeriodPreset, 'custom'>, today);
  }
  return {
    preset,
    ...range,
    label: PERIOD_PRESETS.find((p) => p.value === preset)?.label ?? '',
    rangeLabel: formatDateRange(range.startDate, range.endDate),
  };
}

/** Days in an inclusive range (≥ 1). */
export function periodDays(p: Pick<DashboardPeriod, 'startDate' | 'endDate'>): number {
  const a = parseDate(p.startDate);
  const b = parseDate(p.endDate);
  if (!a || !b) return 1;
  return Math.max(1, Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1);
}

/** The range of the same length ending the day before `p` starts. */
export function previousPeriod(p: Pick<DashboardPeriod, 'startDate' | 'endDate'>): { startDate: string; endDate: string } {
  const start = parseDate(p.startDate) ?? new Date();
  const days = periodDays(p);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1);
  const from = new Date(end.getFullYear(), end.getMonth(), end.getDate() - days + 1);
  return { startDate: toIsoDate(from), endDate: toIsoDate(end) };
}

// ─── KPI deltas ─────────────────────────────────────────────────────────────

/** Count change vs the previous period: "+3" / "-2" / "0". */
export function countDelta(current: number, previous: number | null | undefined, label = 'vs periode sebelumnya'): StatDelta | undefined {
  if (previous === null || previous === undefined) return undefined;
  if (current === 0 && previous === 0) return undefined;
  const diff = current - previous;
  return {
    value: `${diff > 0 ? '+' : ''}${formatNumber(diff)}`,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
    label,
  };
}

/** Percentage-point change of a percentage KPI (yield): "+1,2 poin". */
export function pointDelta(current: number | null | undefined, previous: number | null | undefined, label = 'vs periode sebelumnya'): StatDelta | undefined {
  if (current === null || current === undefined || previous === null || previous === undefined) return undefined;
  const diff = Math.round((current - previous) * 10) / 10;
  return {
    value: `${diff > 0 ? '+' : ''}${formatNumber(diff, { maxDecimals: 1 })} poin`,
    direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat',
    label,
  };
}

/** Yield stored as percent (62.5) → "62,5%". */
export const formatYield = (pct: number | null | undefined): string =>
  pct === null || pct === undefined ? '-' : formatPercent(pct / 100, { decimals: 1 });

// ─── Inventory: "Perlu tindakan" ────────────────────────────────────────────

export interface AttentionItem {
  id: string;
  code: string;
  name: string;
  unit: string;
  currentStock: number | string;
  minimumStock: number | string;
  stockStatus?: 'out' | 'low' | 'ok';
}

/** Out-of-stock first, then below-minimum, each in the server's order, capped. */
export function attentionRows<T extends AttentionItem>(out: readonly T[], low: readonly T[], limit = 8): T[] {
  const seen = new Set<string>();
  const rows: T[] = [];
  for (const item of [...out, ...low]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    rows.push(item);
    if (rows.length >= limit) break;
  }
  return rows;
}

/** Stock as a share of the minimum (0..1+), null without a minimum. */
export function stockCoverage(currentStock: number | string, minimumStock: number | string): number | null {
  const cur = Number(currentStock);
  const min = Number(minimumStock);
  if (!Number.isFinite(cur) || !Number.isFinite(min) || min <= 0) return null;
  return Math.max(0, cur / min);
}

// ─── Production ─────────────────────────────────────────────────────────────

export interface ProductionKpiSummary {
  activeCount: number;
  inputQty: number;
  outputQty: number;
  byproductQty: number;
  yieldPct: number | null;
  unit: string | null;
}

/** Main-product output: all output lines minus by-products. */
export const mainOutputQty = (s: Pick<ProductionKpiSummary, 'outputQty' | 'byproductQty'>): number =>
  Math.max(0, s.outputQty - s.byproductQty);

export interface LoadedHppTotals {
  totalCostInputSide: number;
  totalCostOutputSide: number;
  avgLoadedHppPerKg: number;
  runsWithHppCount: number;
}

/** Conversion cost of the period (input- + output-side standard costs), null when no run has HPP. */
export function conversionCost(h: LoadedHppTotals | null | undefined): number | null {
  if (!h || h.runsWithHppCount <= 0) return null;
  return Math.round((h.totalCostInputSide + h.totalCostOutputSide) * 100) / 100;
}

export interface YieldTrendPoint {
  date: string;
  avgYield: number;
  count: number;
}

/** Chart rows with a short "dd/MM" axis label. */
export function yieldTrendRows(trend: readonly YieldTrendPoint[]): Array<YieldTrendPoint & { label: string }> {
  return trend.map((t) => ({ ...t, label: `${t.date.slice(8, 10)}/${t.date.slice(5, 7)}` }));
}

/**
 * Y-axis bounds for a yield chart: values (and the reference line) padded and
 * snapped to multiples of 5, at least 10 points tall, clamped to 0..100.
 */
export function yieldDomain(values: readonly number[], reference?: number | null): [number, number] {
  const all = [...values, ...(reference !== null && reference !== undefined ? [reference] : [])].filter(Number.isFinite);
  if (all.length === 0) return [0, 100];
  let lo = Math.max(0, Math.floor((Math.min(...all) - 2) / 5) * 5);
  let hi = Math.min(100, Math.ceil((Math.max(...all) + 2) / 5) * 5);
  if (hi - lo < 10) {
    hi = Math.min(100, lo + 10);
    lo = Math.max(0, hi - 10);
  }
  return [lo, hi];
}

export interface TopProduct {
  id: string;
  name: string;
  unit: string;
  quantity: number;
}

export interface ProductHpp {
  itemId: string;
  avgComputedHpp: number;
}

/** Top outputs with each product's average loaded HPP (when known) and share of the top-list volume. */
export function topProductRows(
  outputs: readonly TopProduct[],
  hpp: readonly ProductHpp[],
): Array<TopProduct & { avgHpp: number | null; share: number }> {
  const max = outputs.reduce((m, o) => Math.max(m, o.quantity), 0);
  const byId = new Map(hpp.map((h) => [h.itemId, h.avgComputedHpp]));
  return outputs.map((o) => ({
    ...o,
    avgHpp: byId.get(o.id) ?? null,
    share: max > 0 ? o.quantity / max : 0,
  }));
}
