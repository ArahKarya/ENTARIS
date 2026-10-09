import { useQuery } from '@tanstack/react-query';
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { BarChart3 } from 'lucide-react';
import api from '../../lib/api';
import { formatNumber } from '@/lib/format';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { ChartFrame } from '../dashboard-kit/ChartFrame';
import { AXIS_TICK, GRID_STROKE, TOOLTIP_STYLE } from '../dashboard-kit/chart-theme';

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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
const LABELS: Record<string, string> = { masuk: 'Masuk', keluar: 'Keluar', net: 'Net' };

export default function MovementTrendChart() {
  const { data, isLoading, isError, refetch } = useQuery<MovementTrendItem[]>({
    queryKey: ['warehouse-movement-trend'],
    queryFn: async () => {
      const r = await api.get<MovementTrendRaw[]>('/inventory/dashboard/movement-trend');
      return r.data.map((d) => {
        const [, m] = d.month.split('-');
        return {
          month: MONTH_NAMES[parseInt(m, 10) - 1] ?? d.month,
          masuk: d.inQty + d.adjInQty,
          keluar: d.outQty + d.adjOutQty,
          net: d.netChange,
        };
      });
    },
  });
  const rows = data ?? [];

  return (
    <WidgetCard
      title="Tren Pergerakan Stok"
      description="6 bulan terakhir"
      icon={BarChart3}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && rows.length === 0}
      emptyIcon={BarChart3}
      emptyText="Tidak ada pergerakan stok dalam 6 bulan terakhir."
      minHeight={290}
    >
      <ChartFrame
        summary={`Grafik batang kuantitas stok masuk dan keluar per bulan dengan garis perubahan bersih, ${rows.length} bulan.`}
        legend={[
          { label: 'Masuk', color: 'var(--chart-3)' },
          { label: 'Keluar', color: 'var(--chart-4)' },
          { label: 'Net', color: 'var(--chart-1)', dashed: true },
        ]}
        table={{
          caption: 'Pergerakan stok per bulan',
          columns: ['Bulan', 'Masuk', 'Keluar', 'Net'],
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
              formatter={(v, n) => [formatNumber(Number(v)), LABELS[String(n)] ?? String(n)]}
            />
            <Bar dataKey="masuk" name="masuk" stackId="a" fill="var(--chart-3)" isAnimationActive={false} />
            <Bar dataKey="keluar" name="keluar" stackId="a" fill="var(--chart-4)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Line type="monotone" dataKey="net" name="net" stroke="var(--chart-1)" strokeWidth={2} strokeDasharray="5 3" dot={{ r: 3, fill: 'var(--chart-1)' }} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </ChartFrame>
    </WidgetCard>
  );
}
