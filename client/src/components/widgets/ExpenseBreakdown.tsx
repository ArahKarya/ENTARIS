import React from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../../lib/api';
import { PieChart as PieIcon, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { formatRupiah } from '../../lib/formatters';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

interface Props {
  startDate?: string;
  endDate?: string;
}

const ExpenseBreakdown: React.FC<Props> = ({ startDate, endDate }) => {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-expense-breakdown', startDate, endDate],
    queryFn: async () => {
      const r = await api.get('/dashboard/expense-breakdown', { params: { startDate, endDate } });
      return r.data;
    },
  });

  const total = (data || []).reduce((s: number, d: any) => s + d.amount, 0);

  return (
    <div
      className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Beban Bulan Ini
        </h2>
        <PieIcon size={16} style={{ color: 'var(--color-text-muted)' }} />
      </div>

      {isLoading ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <PieIcon size={28} className="mx-auto mb-2 opacity-50" />
          <p className="text-xs">Belum ada data beban bulan ini</p>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="w-full h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data}
                  dataKey="amount"
                  nameKey="accountName"
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={2}
                >
                  {data.map((_: any, i: number) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: any) => formatRupiah(value)}
                  contentStyle={{
                    fontSize: 12,
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="w-full space-y-1.5 mt-2">
            {data.slice(0, 5).map((d: any, i: number) => (
              <div key={d.accountId} className="flex items-center gap-2 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
                  style={{ backgroundColor: COLORS[i % COLORS.length] }}
                />
                <span className="flex-1 truncate" style={{ color: 'var(--color-text-secondary)' }}>
                  {d.accountName}
                </span>
                <span className="tabular-nums font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {total > 0 ? `${((d.amount / total) * 100).toFixed(0)}%` : '0%'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseBreakdown;
