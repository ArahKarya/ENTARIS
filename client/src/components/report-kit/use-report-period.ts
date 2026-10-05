/**
 * URL-synced report period, built on useListState so back/forward and shared
 * links keep the period (?startDate=…&endDate=… or ?date=…). Invalid or missing
 * params fall back to the defaults. `list` is exposed for extra URL state such
 * as the committed search text (`list.search`, `list.setSearch`).
 */
import { useCallback, useMemo } from 'react';
import { useListState, type ListState } from '@/hooks/useListState';
import { asOfForPreset, normalizeAsOf, normalizeRange, rangeForPreset, type DateRange } from './period';

const RANGE_KEYS = ['startDate', 'endDate'] as const;
const AS_OF_KEYS = ['date'] as const;

export interface ReportRangeState extends DateRange {
  setRange: (range: DateRange) => void;
  list: ListState<(typeof RANGE_KEYS)[number]>;
}

/** Default period when the URL has none (both ends required to apply). Omit = current month; `{ startDate: '', endDate: '' }` = all history. */
export type ReportRangeOptions = Partial<DateRange>;

/** Default period = current month, full month (month-end postings show up). */
export function useReportRange(options: ReportRangeOptions = {}): ReportRangeState {
  const list = useListState({ filters: RANGE_KEYS });
  const { startDate: rawStart, endDate: rawEnd } = list.filters;
  const { setFilters } = list;
  const fallbackStart = options.startDate;
  const fallbackEnd = options.endDate;
  const { startDate, endDate } = useMemo(
    () =>
      normalizeRange(
        rawStart,
        rawEnd,
        fallbackStart !== undefined && fallbackEnd !== undefined
          ? { startDate: fallbackStart, endDate: fallbackEnd }
          : rangeForPreset('month'),
      ),
    [rawStart, rawEnd, fallbackStart, fallbackEnd],
  );
  const setRange = useCallback((r: DateRange) => setFilters({ startDate: r.startDate, endDate: r.endDate }), [setFilters]);
  return { startDate, endDate, setRange, list };
}

export interface ReportAsOfState {
  date: string;
  setDate: (date: string) => void;
  list: ListState<(typeof AS_OF_KEYS)[number]>;
}

/** Default as-of date = today. */
export function useReportAsOf(): ReportAsOfState {
  const list = useListState({ filters: AS_OF_KEYS });
  const raw = list.filters.date;
  const { setFilter } = list;
  const date = useMemo(() => normalizeAsOf(raw, asOfForPreset('today')), [raw]);
  const setDate = useCallback((d: string) => setFilter('date', d), [setFilter]);
  return { date, setDate, list };
}
