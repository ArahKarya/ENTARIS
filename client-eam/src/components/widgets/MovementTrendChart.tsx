import { useQuery } from '@tanstack/react-query';
import { BarChart3, Loader2 } from 'lucide-react';
import {
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import api from '../../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatNumber = (val: number | string, decimals = 0) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export default function MovementTrendChart() {
  const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

  const { data, isLoading } = useQuery<MovementTrendItem[]>({
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

  return (
    <div
      className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Tren Pergerakan Stok (6 Bulan)
        </h2>
        <div className="flex items-center gap-4 text-xs" style={{ color: 'var(--color-text-muted)' }}>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-green-500 inline-block" />
            Masuk
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-500 inline-block" />
            Keluar
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-blue-500 inline-block" />
            Net
          </span>
        </div>
      </div>
      <div className="h-64">
        {isLoading ? (
          <div className="py-12 flex items-center justify-center">
            <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-text-muted)' }} />
          </div>
        ) : !data || data.length === 0 ? (
          <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
            <BarChart3 size={32} className="mx-auto mb-2 opacity-30" />
            <p className="text-xs">Belum ada data pergerakan</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-border)" />
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                dy={8}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                tickFormatter={(v) => formatNumber(v)}
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
                formatter={(value, name) => {
                  const labels: Record<string, string> = { masuk: 'Masuk', keluar: 'Keluar', net: 'Net Change' };
                  return [formatNumber(Number(value)), labels[String(name)] ?? String(name)];
                }}
              />
              <Legend wrapperStyle={{ display: 'none' }} />
              <Bar dataKey="masuk" stackId="a" fill="#22c55e" radius={[0, 0, 0, 0]} />
              <Bar dataKey="keluar" stackId="a" fill="#ef4444" radius={[4, 4, 0, 0]} />
              <Line
                type="monotone"
                dataKey="net"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ r: 3, fill: '#3b82f6' }}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
