import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3 } from 'lucide-react';
import api from '../../lib/api';
import { LOCALE, formatNumber } from '@/lib/format';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { ChartFrame } from '../dashboard-kit/ChartFrame';
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE } from '../dashboard-kit/chart-theme';
import { useChartAnimation } from '@/contexts/motion-context';

interface MovementTrendRaw {
  month: string;
  inQty: number;
  outQty: number;
  adjInQty: number;
  adjOutQty: number;
  netChange: number;
}

interface MovementTrendItem {
  month: string;
  masuk: number;
  keluar: number;
  net: number;
}

/** "2026-10" -> "Okt" / "Oct"; formatted at render time so it follows the UI language. */
function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Intl.DateTimeFormat(LOCALE, { month: 'short' }).format(new Date(y, m - 1, 1));
}

export default function MovementTrendChart() {
  const { t } = useTranslation('dashboard');
  const animate = useChartAnimation();
  const labels: Record<string, string> = { masuk: t('movementTrend.in'), keluar: t('movementTrend.out'), net: t('movementTrend.net') };
  const { data, isLoading, isError, refetch } = useQuery<MovementTrendItem[]>({
    queryKey: ['warehouse-movement-trend'],
    queryFn: async () => {
      const r = await api.get<MovementTrendRaw[]>('/inventory/dashboard/movement-trend');
      return r.data.map((d) => {
        return {
          month: d.month,
          masuk: d.inQty + d.adjInQty,
          keluar: d.outQty + d.adjOutQty,
          net: d.netChange,
        };
      });
    },
  });
  const rows = (data ?? []).map((r) => ({ ...r, month: monthLabel(r.month) }));

  return (
    <WidgetCard
      title={t('movementTrend.title')}
      description={t('movementTrend.description')}
      icon={BarChart3}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && rows.length === 0}
      emptyIcon={BarChart3}
      emptyText={t('movementTrend.empty')}
      minHeight={290}
    >
      <ChartFrame
        summary={t('movementTrend.summary', { count: rows.length })}
        legend={[
          { label: labels.masuk, color: 'var(--chart-3)' },
          { label: labels.keluar, color: 'var(--chart-4)' },
          { label: labels.net, color: 'var(--chart-1)', dashed: true },
        ]}
        table={{
          caption: t('movementTrend.caption'),
          columns: [t('monthlyProfit.month'), labels.masuk, labels.keluar, labels.net],
          rows: rows.map((r) => [r.month, formatNumber(r.masuk), formatNumber(r.keluar), formatNumber(r.net)]),
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} accessibilityLayer={false}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tick={AXIS_TICK} dy={6} />
            <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={(v) => formatNumber(v)} width={48} />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: 'var(--muted)' }}
              formatter={(v, n) => [formatNumber(Number(v)), labels[String(n)] ?? String(n)]}
            />
            <Bar dataKey="masuk" name="masuk" stackId="a" fill="var(--chart-3)" isAnimationActive={animate} />
            <Bar dataKey="keluar" name="keluar" stackId="a" fill="var(--chart-4)" radius={[3, 3, 0, 0]} isAnimationActive={animate} />
            <Line type="monotone" dataKey="net" name="net" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: 'var(--chart-1)' }} isAnimationActive={animate} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>
    </WidgetCard>
  );
}
