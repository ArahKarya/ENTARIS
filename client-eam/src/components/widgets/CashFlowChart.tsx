import { useQuery } from '@tanstack/react-query';
import { ArrowDownCircle, ArrowUpCircle, Wallet } from 'lucide-react';
import api from '../../lib/api';

interface CashFlowData {
  days: { date: string; cashIn: number; cashOut: number }[];
  totalIn: number;
  totalOut: number;
  net: number;
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 });

interface CashFlowProps {
  startDate?: string;
  endDate?: string;
}

export default function CashFlowChart({ startDate, endDate }: CashFlowProps = {}) {
  const { data, isLoading } = useQuery<CashFlowData>({
    queryKey: ['dashboard-cash-flow', startDate, endDate],
    queryFn: async () => (await api.get('/dashboard/cash-flow', { params: { startDate, endDate } })).data,
  });

  if (isLoading || !data) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wallet size={16} className="text-emerald-500" />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Arus Kas Bulan Ini</h3>
        </div>
        <div className="animate-pulse space-y-3">
          <div className="h-8 rounded" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />
          <div className="h-8 rounded" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />
          <div className="h-8 rounded" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Wallet size={16} className="text-emerald-500" />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Arus Kas Bulan Ini</h3>
      </div>

      <div className="space-y-3">
        {/* Cash In */}
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
          <ArrowDownCircle size={18} className="text-green-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Kas Masuk</p>
            <p className="text-sm font-bold text-green-600">Rp {fmt(data.totalIn)}</p>
          </div>
        </div>

        {/* Cash Out */}
        <div className="flex items-center gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
          <ArrowUpCircle size={18} className="text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Kas Keluar</p>
            <p className="text-sm font-bold text-red-600">Rp {fmt(data.totalOut)}</p>
          </div>
        </div>

        {/* Net */}
        <div className="flex items-center gap-3 p-3 rounded-lg border-2" style={{
          backgroundColor: 'var(--color-bg-secondary)',
          borderColor: data.net >= 0 ? 'rgb(34 197 94 / 0.3)' : 'rgb(239 68 68 / 0.3)',
        }}>
          <Wallet size={18} className={data.net >= 0 ? 'text-green-600' : 'text-red-500'} />
          <div className="flex-1">
            <p className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Arus Kas Bersih</p>
            <p className={`text-sm font-bold ${data.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              Rp {fmt(data.net)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
