/**
 * Hooks and chart constants shared by the inventory and production dashboards
 * (kept apart from dashboard-kit.tsx so that file only exports components).
 */
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  DEFAULT_PERIOD,
  PERIOD_END_PARAM,
  PERIOD_PARAM,
  PERIOD_START_PARAM,
  resolvePeriod,
  type DashboardPeriod,
  type PeriodPreset,
} from './dashboard-model';

// ─── Period ─────────────────────────────────────────────────────────────────

export function useDashboardPeriod(): {
  period: DashboardPeriod;
  setPreset: (preset: PeriodPreset) => void;
  setRange: (startDate: string, endDate: string) => void;
} {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawPeriod = searchParams.get(PERIOD_PARAM);
  const rawStart = searchParams.get(PERIOD_START_PARAM);
  const rawEnd = searchParams.get(PERIOD_END_PARAM);
  const period = useMemo(
    () => resolvePeriod({ period: rawPeriod, startDate: rawStart, endDate: rawEnd }),
    [rawPeriod, rawStart, rawEnd],
  );

  const write = useCallback(
    (patch: Record<string, string | null>) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      }),
    [setSearchParams],
  );

  const setPreset = useCallback(
    (preset: PeriodPreset) => {
      if (preset === 'custom') {
        // Seed the custom range with the range currently shown.
        write({ [PERIOD_PARAM]: 'custom', [PERIOD_START_PARAM]: period.startDate, [PERIOD_END_PARAM]: period.endDate });
      } else {
        write({
          [PERIOD_PARAM]: preset === DEFAULT_PERIOD ? null : preset,
          [PERIOD_START_PARAM]: null,
          [PERIOD_END_PARAM]: null,
        });
      }
    },
    [write, period.startDate, period.endDate],
  );

  const setRange = useCallback(
    (startDate: string, endDate: string) =>
      write({ [PERIOD_PARAM]: 'custom', [PERIOD_START_PARAM]: startDate || null, [PERIOD_END_PARAM]: endDate || null }),
    [write],
  );

  return { period, setPreset, setRange };
}

/** Axis / grid styling from the theme tokens (works in light and dark). */
export const CHART_AXIS = {
  tick: { fill: 'var(--text-muted)', fontSize: 11 },
  axisLine: false,
  tickLine: false,
} as const;
export const CHART_GRID_STROKE = 'var(--border)';

