import { useQuery } from '@tanstack/react-query';
import { TrendingUp } from 'lucide-react';
import api from '../../lib/api';
import { cn } from '../../lib/utils';

interface RatioData {
  currentRatio: number;
  debtToEquity: number;
  debtToAsset: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 });

export default function FinancialRatios() {
  const { data, isLoading } = useQuery<RatioData>({
    queryKey: ['financial-ratios'],
    queryFn: async () => (await api.get('/dashboard/financial-ratios')).data,
  });

  if (isLoading || !data) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={16} className="text-blue-500" />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Rasio Keuangan</h3>
        </div>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-10 rounded" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />)}
        </div>
      </div>
    );
  }

  const ratios = [
    { label: 'Current Ratio', value: data.currentRatio, suffix: 'x', good: data.currentRatio >= 1.5 },
    { label: 'Debt to Equity', value: data.debtToEquity, suffix: 'x', good: data.debtToEquity <= 2 },
    { label: 'Debt to Asset', value: data.debtToAsset, suffix: 'x', good: data.debtToAsset <= 0.5 },
  ];

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp size={16} className="text-blue-500" />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Rasio Keuangan</h3>
      </div>
      <div className="space-y-3">
        {ratios.map((r) => (
          <div key={r.label} className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--color-bg-secondary)' }}>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>{r.label}</span>
            <span className={cn('text-sm font-bold', r.good ? 'text-green-600' : 'text-amber-600')}>
              {r.value}{r.suffix}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t grid grid-cols-3 gap-2 text-center" style={{ borderColor: 'var(--color-border-light)' }}>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Total Aset</p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>Rp {fmt(data.totalAssets)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Liabilitas</p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>Rp {fmt(data.totalLiabilities)}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Ekuitas</p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: 'var(--color-text-primary)' }}>Rp {fmt(data.totalEquity)}</p>
        </div>
      </div>
    </div>
  );
}
