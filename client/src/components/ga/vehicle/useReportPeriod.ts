import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DEFAULT_REPORT_PRESET, resolveReportPeriod, type ReportPeriod, type ReportPreset } from './fleet-report-model';

/** Report period bound to ?period=&startDate=&endDate= (default preset omitted from the URL). */
export function useReportPeriod(): {
  period: ReportPeriod;
  setPreset: (p: ReportPreset) => void;
  setRange: (startDate: string, endDate: string) => void;
} {
  const [sp, setSp] = useSearchParams();
  const raw = sp.get('period');
  const s = sp.get('startDate');
  const e = sp.get('endDate');
  const period = useMemo(() => resolveReportPeriod({ period: raw, startDate: s, endDate: e }), [raw, s, e]);

  const write = useCallback(
    (patch: Record<string, string | null>) =>
      setSp((prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v) next.set(k, v);
          else next.delete(k);
        }
        return next;
      }),
    [setSp],
  );

  const setPreset = useCallback(
    (p: ReportPreset) =>
      p === 'custom'
        ? write({ period: 'custom', startDate: period.startDate, endDate: period.endDate })
        : write({ period: p === DEFAULT_REPORT_PRESET ? null : p, startDate: null, endDate: null }),
    [write, period.startDate, period.endDate],
  );
  const setRange = useCallback(
    (startDate: string, endDate: string) => write({ period: 'custom', startDate: startDate || null, endDate: endDate || null }),
    [write],
  );
  return { period, setPreset, setRange };
}
