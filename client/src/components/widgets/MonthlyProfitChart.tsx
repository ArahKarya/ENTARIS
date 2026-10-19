import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3 } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '@/lib/format';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { ChartFrame } from '../dashboard-kit/ChartFrame';
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE, compactIdrTick } from '../dashboard-kit/chart-theme';
import { useChartAnimation } from '@/contexts/motion-context';

interface MonthData {
  name: string;
  revenue: number;
  expense: number;
  profit: number;
}

interface Props {
  startDate?: string;
  endDate?: string;
}

export default function MonthlyProfitChart({ startDate, endDate }: Props = {}) {
  const { t } = useTranslation('dashboard');
  const animate = useChartAnimation();
  const { data, isLoading, isError, refetch } = useQuery<MonthData[]>({
    queryKey: ['monthly-profit', startDate, endDate],
    queryFn: async () => (await api.get('/dashboard/monthly-profit', { params: { startDate, endDate } })).data,
  });
  const rows = data ?? [];
  const last = rows[rows.length - 1];

  return (
    <WidgetCard
      title={t('monthlyProfit.title')}
      description={t('monthlyProfit.description')}
      icon={BarChart3}
      href="/reports/profit-loss"
      hrefLabel={t('expenseBreakdown.profitLoss')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={rows.length === 0}
      emptyText={t('monthlyProfit.empty')}
      minHeight={290}
    >
      <ChartFrame
        summary={last ? t('monthlyProfit.summaryWithLast', { month: last.name, profit: formatRupiah(last.profit) }) : t('monthlyProfit.summary')}
        legend={[
          { label: t('monthlyProfit.revenue'), color: 'var(--chart-2)' },
          { label: t('monthlyProfit.expense'), color: 'var(--chart-4)' },
          ...(last ? [{ label: t('monthlyProfit.profitOf', { month: last.name }), color: 'var(--chart-3)', value: formatRupiah(last.profit, { compact: true, negative: 'parens' as const }) }] : []),
        ]}
        table={{
          caption: t('monthlyProfit.caption'),
          columns: [t('monthlyProfit.month'), t('monthlyProfit.revenue'), t('monthlyProfit.expense'), t('monthlyProfit.profit')],
          rows: rows.map((r) => [r.name, formatRupiah(r.revenue), formatRupiah(r.expense), formatRupiah(r.profit, { negative: 'parens' })]),
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} accessibilityLayer={false}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={AXIS_TICK} dy={6} />
            <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={compactIdrTick} width={44} />
            <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--muted)' }} formatter={(v) => formatRupiah(Number(v))} />
            <Bar dataKey="revenue" name={t('monthlyProfit.revenue')} fill="var(--chart-2)" radius={[3, 3, 0, 0]} isAnimationActive={animate} />
            <Bar dataKey="expense" name={t('monthlyProfit.expense')} fill="var(--chart-4)" radius={[3, 3, 0, 0]} isAnimationActive={animate} />
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
    </WidgetCard>
  );
}
