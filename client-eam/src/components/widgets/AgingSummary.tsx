import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import api from '../../lib/api';
import { cn } from '../../lib/utils';

interface AgingBucket {
  label: string;
  amount: number;
}

interface AgingData {
  receivable: AgingBucket[];
  payable: AgingBucket[];
  totalReceivable: number;
  totalPayable: number;
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 });

export default function AgingSummary() {
  const { data, isLoading } = useQuery<AgingData>({
    queryKey: ['aging-summary'],
    queryFn: async () => (await api.get('/dashboard/aging-summary')).data,
  });

  if (isLoading || !data) {
    return (
      <div className="card p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={16} className="text-orange-500" />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Ringkasan Aging</h3>
        </div>
        <div className="animate-pulse space-y-3">
          {[1, 2, 3, 4].map((i) => <div key={i} className="h-6 rounded" style={{ backgroundColor: 'var(--color-bg-tertiary)' }} />)}
        </div>
      </div>
    );
  }

  const bucketColors = ['bg-green-500', 'bg-yellow-400', 'bg-orange-500', 'bg-red-500', 'bg-red-700'];

  const renderBar = (buckets: AgingBucket[], total: number) => {
    if (total === 0) return <div className="h-3 rounded-full bg-gray-200" />;
    return (
      <div className="flex h-3 rounded-full overflow-hidden">
        {buckets.map((b, i) => {
          const pct = (b.amount / total) * 100;
          if (pct === 0) return null;
          return (
            <div
              key={b.label}
              className={cn('transition-all', bucketColors[i])}
              style={{ width: `${pct}%` }}
              title={`${b.label}: Rp ${fmt(b.amount)}`}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <Clock size={16} className="text-orange-500" />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>Ringkasan Aging</h3>
      </div>

      {/* Piutang (AR) */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Piutang (AR)</span>
          <span className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>Rp {fmt(data.totalReceivable)}</span>
        </div>
        {renderBar(data.receivable, data.totalReceivable)}
      </div>

      {/* Hutang (AP) */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium" style={{ color: 'var(--color-text-secondary)' }}>Hutang (AP)</span>
          <span className="text-xs font-bold" style={{ color: 'var(--color-text-primary)' }}>Rp {fmt(data.totalPayable)}</span>
        </div>
        {renderBar(data.payable, data.totalPayable)}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
        {data.receivable.map((b, i) => (
          <span key={b.label} className="flex items-center gap-1">
            <span className={cn('w-2 h-2 rounded-sm', bucketColors[i])} />
            {b.label}
          </span>
        ))}
      </div>
    </div>
  );
}
