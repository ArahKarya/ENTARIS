import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Minus, Percent, TrendingDown, TrendingUp } from 'lucide-react';
import api from '../../lib/api';
import { cn } from '@/lib/utils';
import { formatNumber } from '@/lib/format';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { ChartFrame } from '../dashboard-kit/ChartFrame';
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE } from '../dashboard-kit/chart-theme';
import { useChartAnimation } from '@/contexts/motion-context';

interface YieldTrendMonth {
  label: string;
  avgYield: number;
  runCount: number;
}

interface YieldTrendData {
  months: YieldTrendMonth[];
  overallAvg: number;
  latest: number;
  deltaPct: number;
}

export default function YieldTrendChart() {
  const { t } = useTranslation('dashboard');
  const animate = useChartAnimation();
  const pct2 = (v: number) => formatNumber(v, { decimals: 2 });
  const { data, isLoading, isError, refetch } = useQuery<YieldTrendData>({
    queryKey: ['dashboard-yield-trend'],
    queryFn: async () => (await api.get('/inventory/dashboard/yield-trend')).data,
  });

  const DeltaIcon = !data || data.deltaPct === 0 ? Minus : data.deltaPct > 0 ? TrendingUp : TrendingDown;
  const deltaTone = !data || data.deltaPct === 0 ? 'text-muted-foreground' : data.deltaPct > 0 ? 'text-success-text' : 'text-danger-text';

  return (
    <WidgetCard
      title={t('yieldTrend.title')}
      description={t('yieldTrend.description')}
      icon={Percent}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      minHeight={290}
    >
      {data && (
        <>
          <dl className="mb-3 grid grid-cols-3 gap-3">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('yieldTrend.thisMonth')}</dt>
              <dd className="num text-lg font-semibold text-foreground">{pct2(data.latest)}%</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('yieldTrend.average')}</dt>
              <dd className="num text-lg font-semibold text-foreground">{pct2(data.overallAvg)}%</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">{t('yieldTrend.vsLastMonth')}</dt>
              <dd className={cn('num flex items-center gap-1 text-lg font-semibold', deltaTone)}>
                <DeltaIcon className="size-4" aria-hidden />
                {data.deltaPct > 0 ? '+' : ''}
                {formatNumber(data.deltaPct, { decimals: 1 })}%
              </dd>
            </div>
          </dl>
          <ChartFrame
            height={190}
            summary={t('yieldTrend.summary', { count: data.months.length, latest: pct2(data.latest), avg: pct2(data.overallAvg) })}
            table={{
              caption: t('yieldTrend.caption'),
              columns: [t('monthlyProfit.month'), t('productionDeepDive.yieldPct'), t('productionDeepDive.runCount')],
              rows: data.months.map((m) => [m.label, pct2(m.avgYield), String(m.runCount)]),
            }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.months} margin={{ top: 10, right: 8, left: -12, bottom: 0 }} accessibilityLayer={false}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} />
                <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  formatter={(v) => [`${pct2(Number(v))}%`, t('yieldTrend.yield')]}
                  labelFormatter={(label, payload) => t('yieldTrend.tooltipLabel', { label, count: payload?.[0]?.payload?.runCount ?? 0 })}
                />
                {data.overallAvg > 0 && (
                  <ReferenceLine
                    y={data.overallAvg}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="4 4"
                    label={{ value: t('yieldTrend.avgLine', { value: formatNumber(data.overallAvg, { decimals: 1 }) }), position: 'insideTopRight', fontSize: 10, fill: 'var(--muted-foreground)' }}
                  />
                )}
                <Line type="monotone" dataKey="avgYield" stroke="var(--chart-2)" strokeWidth={2.5} dot={{ r: 3, fill: 'var(--chart-2)' }} activeDot={{ r: 5 }} isAnimationActive={animate} />
              </LineChart>
            </ResponsiveContainer>
          </ChartFrame>
        </>
      )}
    </WidgetCard>
  );
}
