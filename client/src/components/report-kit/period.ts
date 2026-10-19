/**
 * Pure period helpers for report filters. Dates are local calendar days as
 * "yyyy-MM-dd" strings (the format the report APIs already take).
 */
import { endOfMonth, endOfQuarter, endOfYear, format, startOfMonth, startOfQuarter, startOfYear, subMonths, subQuarters, subYears } from 'date-fns';
import i18n from '@/i18n';
import { formatDate, formatDateRange } from '@/lib/format';

export interface DateRange {
  startDate: string;
  endDate: string;
}

export type RangePreset = 'month' | 'lastMonth' | 'quarter' | 'year';
export type AsOfPreset = 'today' | 'lastMonthEnd' | 'lastQuarterEnd' | 'lastYearEnd';

/** Preset chips; `labelKey` is a `reports` namespace key, translated at render time. */
export const RANGE_PRESETS = [
  { id: 'month', labelKey: 'kit.presets.month' },
  { id: 'lastMonth', labelKey: 'kit.presets.lastMonth' },
  { id: 'quarter', labelKey: 'kit.presets.quarter' },
  { id: 'year', labelKey: 'kit.presets.year' },
] as const satisfies ReadonlyArray<{ id: RangePreset; labelKey: string }>;

export const AS_OF_PRESETS = [
  { id: 'today', labelKey: 'kit.presets.today' },
  { id: 'lastMonthEnd', labelKey: 'kit.presets.lastMonthEnd' },
  { id: 'lastQuarterEnd', labelKey: 'kit.presets.lastQuarterEnd' },
  { id: 'lastYearEnd', labelKey: 'kit.presets.lastYearEnd' },
] as const satisfies ReadonlyArray<{ id: AsOfPreset; labelKey: string }>;

export function toIso(d: Date): string {
  return format(d, 'yyyy-MM-dd');
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real calendar date written as yyyy-MM-dd. */
export function isIsoDate(value: string | null | undefined): value is string {
  const m = value ? ISO.exec(value) : null;
  if (!m) return false;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.getFullYear() === Number(m[1]) && d.getMonth() === Number(m[2]) - 1 && d.getDate() === Number(m[3]);
}

/** A range is usable when both ends are real dates and start <= end. */
export function isRangeValid(range: DateRange): boolean {
  return isIsoDate(range.startDate) && isIsoDate(range.endDate) && range.startDate <= range.endDate;
}

export function rangeForPreset(preset: RangePreset, today: Date = new Date()): DateRange {
  switch (preset) {
    case 'month':
      return { startDate: toIso(startOfMonth(today)), endDate: toIso(endOfMonth(today)) };
    case 'lastMonth': {
      const prev = subMonths(today, 1);
      return { startDate: toIso(startOfMonth(prev)), endDate: toIso(endOfMonth(prev)) };
    }
    case 'quarter':
      return { startDate: toIso(startOfQuarter(today)), endDate: toIso(endOfQuarter(today)) };
    case 'year':
      return { startDate: toIso(startOfYear(today)), endDate: toIso(endOfYear(today)) };
  }
}

export function asOfForPreset(preset: AsOfPreset, today: Date = new Date()): string {
  switch (preset) {
    case 'today':
      return toIso(today);
    case 'lastMonthEnd':
      return toIso(endOfMonth(subMonths(today, 1)));
    case 'lastQuarterEnd':
      return toIso(endOfQuarter(subQuarters(today, 1)));
    case 'lastYearEnd':
      return toIso(endOfYear(subYears(today, 1)));
  }
}

/** Which preset a range equals, or 'custom'. */
export function detectRangePreset(range: DateRange, today: Date = new Date()): RangePreset | 'custom' {
  const hit = RANGE_PRESETS.find((p) => {
    const r = rangeForPreset(p.id, today);
    return r.startDate === range.startDate && r.endDate === range.endDate;
  });
  return hit ? hit.id : 'custom';
}

export function detectAsOfPreset(date: string, today: Date = new Date()): AsOfPreset | 'custom' {
  const hit = AS_OF_PRESETS.find((p) => asOfForPreset(p.id, today) === date);
  return hit ? hit.id : 'custom';
}

/** Falls back to `fallback` unless the pair is a valid range. */
export function normalizeRange(startDate: string | null | undefined, endDate: string | null | undefined, fallback: DateRange): DateRange {
  const candidate = { startDate: startDate ?? '', endDate: endDate ?? '' };
  return isRangeValid(candidate) ? candidate : fallback;
}

export function normalizeAsOf(date: string | null | undefined, fallback: string): string {
  return isIsoDate(date) ? date : fallback;
}

/** "Periode 1-31 Okt 2026" / "Per 05 Okt 2026" (follows the UI language). */
export function periodLabel(value: DateRange | string): string {
  return typeof value === 'string'
    ? i18n.t('kit.period.asOf', { ns: 'reports', date: formatDate(value) })
    : i18n.t('kit.period.range', { ns: 'reports', range: formatDateRange(value.startDate, value.endDate) });
}

