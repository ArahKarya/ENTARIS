import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import api from '../../lib/api';

interface MonthData {
  name: string;
  revenue: number;
  expense: number;
  profit: number;
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 });

interface Props {
  startDate?: string;
  endDate?: string;
}

export default function MonthlyProfitChart({ startDate, endDate }: Props = {}) {
  const { data, isLoading } = useQuery<MonthData[]>({
    queryKey: ['monthly-profit', startDate, endDate],
    queryFn: async () => (await api.get('/dashboard/monthly-profit', { params: { startDate, endDate } })).data,
  });

  if (isLoading || !data) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-indigo-500" />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Tren Laba Bulanan</h3>
        </div>
        <div className="animate-pulse h-48 rounded" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />
      </div>
    );
  }

  const maxVal = Math.max(...data.map((d) => Math.max(d.revenue, d.expense)), 1);

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={16} className="text-indigo-500" />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Tren Laba Bulanan</h3>
      </div>

      {/* Bar chart */}
      <div className="flex items-end gap-1.5 h-40">
        {data.map((d) => {
          const revH = (d.revenue / maxVal) * 100;
          const expH = (d.expense / maxVal) * 100;
          return (
            <div key={d.name} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex items-end justify-center gap-0.5" style={{ height: '120px' }}>
                <div
                  className="w-2.5 rounded-t bg-blue-500 transition-all"
                  style={{ height: `${revH}%`, minHeight: d.revenue > 0 ? '4px' : '0' }}
                  title={`Pendapatan: Rp ${fmt(d.revenue)}`}
                />
                <div
                  className="w-2.5 rounded-t bg-red-400 transition-all"
                  style={{ height: `${expH}%`, minHeight: d.expense > 0 ? '4px' : '0' }}
                  title={`Beban: Rp ${fmt(d.expense)}`}
                />
              </div>
              <span className="text-[9px] font-medium" style={{ color: 'var(--color-text-muted)' }}>
                {d.name}
              </span>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-4 mt-3 text-xs" style={{ color: 'var(--color-text-muted)' }}>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-blue-500" /> Pendapatan</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" /> Beban</span>
      </div>

      {/* Summary: last month */}
      {data.length > 0 && (() => {
        const last = data[data.length - 1];
        return (
          <div className="mt-3 pt-3 border-t text-center" style={{ borderColor: 'var(--color-border-light)' }}>
            <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              Laba Bulan Terakhir
            </p>
            <p className={`text-sm font-bold mt-0.5 ${last.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              Rp {fmt(last.profit)}
            </p>
          </div>
        );
      })()}
    </div>
  );
}
