import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ScrollRegion } from './ScrollRegion';

export interface LegendItem {
  label: string;
  color: string;
  /** Visible value (total / latest) so colour is never the only signal. */
  value?: string;
  /** Dash style marker for the line series (shape distinct from colour). */
  dashed?: boolean;
}

export interface ChartTableProps {
  caption: string;
  columns: string[];
  rows: ReactNode[][];
}

/** Text alternative: collapsed-by-default data table under the chart. */
export function ChartTable({ caption, columns, rows }: ChartTableProps) {
  const { t } = useTranslation('dashboard');
  return (
    <details className="mt-3 text-xs">
      <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0">
        {t('kit.dataTable')}
      </summary>
      <ScrollRegion label={t('kit.dataTableOf', { caption })} className="mt-2 max-h-56 overflow-auto border border-border">
        <table className="w-full min-w-max border-collapse text-xs">
          <caption className="sr-only">{caption}</caption>
          <thead className="sticky top-0 bg-muted">
            <tr>
              {columns.map((c, i) => (
                <th key={c} scope="col" className={cn('px-3 py-1.5 font-medium text-muted-foreground', i === 0 ? 'text-left' : 'text-right')}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-t border-border">
                {r.map((cell, ci) => (
                  <td key={ci} className={cn('px-3 py-1.5', ci === 0 ? 'text-left text-foreground' : 'text-right num text-foreground')}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
    </details>
  );
}

export interface ChartFrameProps {
  /** One-sentence summary read by screen readers (what the chart shows). */
  summary: string;
  legend?: LegendItem[];
  height?: number;
  table?: ChartTableProps;
  children: ReactNode;
}

/** Wraps a recharts chart: fixed height (no layout shift), legend with values, text alternative. */
export function ChartFrame({ summary, legend, height = 240, table, children }: ChartFrameProps) {
  return (
    <div>
      {legend && legend.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {legend.map((l) => (
            <li key={l.label} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block w-4 shrink-0"
                style={l.dashed ? { borderTop: `3px dashed ${l.color}` } : { height: 8, borderRadius: 2, backgroundColor: l.color }}
              />
              <span>{l.label}</span>
              {l.value && <span className="num font-medium text-foreground">{l.value}</span>}
            </li>
          ))}
        </ul>
      )}
      <div role="img" aria-label={summary} style={{ height }} className="w-full min-w-0">
        {children}
      </div>
      {table && <ChartTable {...table} />}
    </div>
  );
}
