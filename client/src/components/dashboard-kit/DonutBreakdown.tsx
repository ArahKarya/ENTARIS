import type { ReactNode } from 'react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { ChartFrame } from './ChartFrame';
import { CHART_COLORS, TOOLTIP_STYLE } from './chart-theme';

export interface DonutDatum {
  key: string;
  label: string;
  value: number;
  /** Secondary text under the label, e.g. "3 aset". */
  note?: string;
}

export interface DonutBreakdownProps {
  data: DonutDatum[];
  formatValue: (n: number) => string;
  summary: string;
  caption: string;
  valueHeader: string;
  /** Rows shown in the visible legend (full list stays in the data table). */
  legendLimit?: number;
  footer?: ReactNode;
}

/** Donut + visible legend listing label, amount and percentage (colour is never the only signal). */
export function DonutBreakdown({ data, formatValue, summary, caption, valueHeader, legendLimit = 6, footer }: DonutBreakdownProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const pct = (v: number) => (total > 0 ? `${((v / total) * 100).toFixed(0)}%` : '0%');
  return (
    <div className="flex flex-col gap-3">
      <ChartFrame
        height={176}
        summary={summary}
        table={{
          caption,
          columns: ['Kelompok', valueHeader, 'Porsi'],
          rows: data.map((d) => [d.label, formatValue(d.value), pct(d.value)]),
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <PieChart accessibilityLayer={false}>
            <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" innerRadius={44} outerRadius={72} paddingAngle={2} isAnimationActive={false} stroke="var(--card)">
              {data.map((d, i) => (
                <Cell key={d.key} fill={CHART_COLORS[i % CHART_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatValue(Number(v))} />
          </PieChart>
        </ResponsiveContainer>
      </ChartFrame>
      <ul className="space-y-1.5">
        {data.slice(0, legendLimit).map((d, i) => (
          <li key={d.key} className="flex items-center gap-2 text-xs">
            <span aria-hidden className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="min-w-0 flex-1 truncate text-foreground">
              {d.label}
              {d.note && <span className="ml-1 text-muted-foreground">({d.note})</span>}
            </span>
            <span className="num shrink-0 font-medium text-foreground">{formatValue(d.value)}</span>
            <span className="num w-10 shrink-0 text-right text-muted-foreground">{pct(d.value)}</span>
          </li>
        ))}
      </ul>
      {footer}
    </div>
  );
}
