import React from 'react';
import { Loader2 } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const formatRupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

interface RevenueChartProps {
  data: any[] | null;
  loading: boolean;
}

const RevenueChart: React.FC<RevenueChartProps> = ({ data, loading }) => (
  <div
    className="border rounded-xl p-5"
    style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
  >
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
        Pendapatan vs Beban
      </h2>
      <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
          Pendapatan
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm bg-gray-300 inline-block" />
          Beban
        </span>
      </div>
    </div>
    <div className="h-64">
      {loading ? (
        <div className="h-full flex items-center justify-center">
          <Loader2 className="animate-spin" size={28} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data || []} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2563EB" stopOpacity={0.12} />
                <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#9ca3af" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#9ca3af" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
            <XAxis
              dataKey="name"
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: '#9ca3af', fontSize: 11 }}
              tickFormatter={(v) => (v === 0 ? '0' : `${Math.round(v / 1000000)}jt`)}
              domain={[0, 'auto']}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--color-bg-primary)',
                border: '1px solid var(--color-border)',
                borderRadius: '8px',
                fontSize: 12,
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                color: 'var(--color-text-primary)',
              }}
              formatter={(value: any) => [formatRupiah(value), '']}
            />
            <Area
              type="monotone"
              dataKey="pendapatan"
              stroke="#2563EB"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorIncome)"
              dot={false}
            />
            <Area
              type="monotone"
              dataKey="beban"
              stroke="#9ca3af"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorExpense)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  </div>
);

export default RevenueChart;
