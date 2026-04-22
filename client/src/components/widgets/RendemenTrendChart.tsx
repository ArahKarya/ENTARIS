import { useQuery } from '@tanstack/react-query';
import { Percent, Loader2, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import api from '../../lib/api';

interface RendemenTrendMonth {
  label: string;
  avgRendemen: number;
  runCount: number;
}

interface RendemenTrendData {
  months: RendemenTrendMonth[];
  overallAvg: number;
  latest: number;
  deltaPct: number;
}

export default function RendemenTrendChart() {
  const { data, isLoading } = useQuery<RendemenTrendData>({
    queryKey: ['dashboard-rendemen-trend'],
    queryFn: async () => (await api.get('/inventory/dashboard/rendemen-trend')).data,
  });

  const DeltaIcon = !data ? Minus : data.deltaPct > 0 ? TrendingUp : data.deltaPct < 0 ? TrendingDown : Minus;
  const deltaColor = !data || data.deltaPct === 0
    ? 'text-gray-500'
    : data.deltaPct > 0
    ? 'text-green-600'
    : 'text-red-600';

  return (
    <div
      className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            Yield Produksi
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Rata-rata yield per bulan (6 bulan)
          </p>
        </div>
        <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
          <Percent size={16} className="text-indigo-600" />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="py-12 flex items-center justify-center">
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                Bulan Ini
              </p>
              <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                {data.latest.toFixed(2)}
                <span className="text-xs font-normal ml-0.5" style={{ color: 'var(--color-text-muted)' }}>%</span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                Rata-rata
              </p>
              <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                {data.overallAvg.toFixed(2)}
                <span className="text-xs font-normal ml-0.5" style={{ color: 'var(--color-text-muted)' }}>%</span>
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
                vs Bulan Lalu
              </p>
              <p className={`text-xl font-bold tabular-nums flex items-center gap-1 ${deltaColor}`}>
                <DeltaIcon size={16} />
                {data.deltaPct > 0 ? '+' : ''}{data.deltaPct.toFixed(1)}
                <span className="text-xs font-normal ml-0.5">%</span>
              </p>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.months} margin={{ top: 10, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: 'var(--color-text-muted)' }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10, fill: 'var(--color-text-muted)' }}
                tickLine={false}
                axisLine={false}
                domain={[0, 100]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value: any) => [`${Number(value).toFixed(2)}%`, 'Yield']}
                labelFormatter={(label: any, payload: any) => {
                  const rc = payload?.[0]?.payload?.runCount ?? 0;
                  return `${label} — ${rc} run`;
                }}
              />
              {data.overallAvg > 0 && (
                <ReferenceLine
                  y={data.overallAvg}
                  stroke="#a3a3a3"
                  strokeDasharray="4 4"
                  label={{
                    value: `avg ${data.overallAvg.toFixed(1)}%`,
                    position: 'insideTopRight',
                    fontSize: 10,
                    fill: 'var(--color-text-muted)',
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="avgRendemen"
                stroke="#6366f1"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#6366f1' }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </>
      )}
    </div>
  );
}
