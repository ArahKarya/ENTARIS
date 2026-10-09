import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { formatRupiah } from '@/lib/format';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { ChartFrame } from '../dashboard-kit/ChartFrame';
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE, compactIdrTick } from '../dashboard-kit/chart-theme';

interface Point {
  name: string;
  pendapatan: number;
  beban: number;
}

interface RevenueChartProps {
  data: Point[] | null | undefined;
  loading: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** Overrides the subtitle (e.g. when a trailing window replaces a one-month period). */
  description?: string;
}

export default function RevenueChart({ data, loading, isError, onRetry, description = 'Per bulan pada periode terpilih' }: RevenueChartProps) {
  const rows = data ?? [];
  const totalIn = rows.reduce((s, r) => s + r.pendapatan, 0);
  const totalOut = rows.reduce((s, r) => s + r.beban, 0);
  return (
    <WidgetCard
      title="Apakah pendapatan menutup beban?"
      description={description}
      icon={TrendingUp}
      href="/reports/profit-loss"
      hrefLabel="Laba rugi"
      isLoading={loading}
      isError={isError}
      onRetry={onRetry}
      isEmpty={rows.length === 0}
      emptyText="Belum ada transaksi pada periode ini"
      minHeight={290}
    >
      <ChartFrame
        summary={`Grafik area pendapatan dan beban per bulan. Total pendapatan ${formatRupiah(totalIn)}, total beban ${formatRupiah(totalOut)}.`}
        legend={[
          { label: 'Pendapatan', color: 'var(--chart-2)', value: formatRupiah(totalIn, { compact: true }) },
          { label: 'Beban', color: 'var(--chart-4)', dashed: true, value: formatRupiah(totalOut, { compact: true }) },
        ]}
        table={{
          caption: 'Pendapatan dan beban per bulan',
          columns: ['Bulan', 'Pendapatan', 'Beban'],
          rows: rows.map((r) => [r.name, formatRupiah(r.pendapatan), formatRupiah(r.beban)]),
        }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ top: 5, right: 8, left: 0, bottom: 0 }} accessibilityLayer={false}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRID_STROKE} />
            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={AXIS_TICK} dy={6} />
            <YAxis axisLine={false} tickLine={false} tick={AXIS_TICK} tickFormatter={compactIdrTick} domain={[0, 'auto']} width={44} />
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v) => formatRupiah(Number(v))} />
            <Area type="monotone" dataKey="pendapatan" name="Pendapatan" stroke="var(--chart-2)" strokeWidth={2} fill="var(--chart-2)" fillOpacity={0.12} dot={rows.length <= 2} isAnimationActive={false} />
            <Area type="monotone" dataKey="beban" name="Beban" stroke="var(--chart-4)" strokeWidth={2} strokeDasharray="5 3" fill="var(--chart-4)" fillOpacity={0.08} dot={rows.length <= 2} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartFrame>
    </WidgetCard>
  );
}
