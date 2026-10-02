import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Loader2, CheckCircle2 } from 'lucide-react';
import api from '../../lib/api';

interface BackfillBreakdown {
  itemId: string;
  code: string;
  name: string;
  unit: string;
  qtyPending: number;
  estimatedValue: number;
}

interface BackfillSummary {
  pendingCount: number;
  totalPendingValue: number;
  breakdown: BackfillBreakdown[];
}

const formatRupiahCompact = (value: number) => {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000_000) return `${sign}Rp ${(abs / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  if (abs >= 1_000_000) return `${sign}Rp ${(abs / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} Jt`;
  return `${sign}Rp ${abs.toLocaleString('id-ID')}`;
};

export default function CogsBackfillWidget() {
  const { data, isLoading } = useQuery<BackfillSummary>({
    queryKey: ['cogs-backfill-summary'],
    queryFn: async () => (await api.get('/cogs-backfill/summary')).data,
    refetchInterval: 60_000,
  });

  const empty = !isLoading && (!data || data.pendingCount === 0);

  return (
    <div
      className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
            COGS Pending Settle
          </h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Sales stok minus — auto-settle saat barang masuk
          </p>
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${empty ? 'bg-emerald-50 dark:bg-emerald-900/30' : 'bg-amber-50 dark:bg-amber-900/30'}`}>
          {empty ? (
            <CheckCircle2 size={16} className="text-emerald-600" />
          ) : (
            <AlertTriangle size={16} className="text-amber-600" />
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : empty ? (
        <p className="text-sm py-4 text-center" style={{ color: 'var(--color-text-muted)' }}>
          Tidak ada COGS pending. Semua sales tercover stok.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Item Pending</p>
              <p className="text-xl font-bold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                {data!.pendingCount}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>Estimasi Nilai</p>
              <p className="text-xl font-bold tabular-nums text-amber-600">
                {formatRupiahCompact(data!.totalPendingValue)}
              </p>
            </div>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {data!.breakdown.slice(0, 8).map((b) => (
              <div key={b.itemId} className="flex items-center justify-between text-xs py-1.5 border-t" style={{ borderColor: 'var(--color-border)' }}>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>{b.name}</p>
                  <p style={{ color: 'var(--color-text-muted)' }}>
                    {b.qtyPending.toLocaleString('id-ID', { maximumFractionDigits: 3 })} {b.unit}
                  </p>
                </div>
                <span className="font-mono tabular-nums text-amber-700 ml-2">
                  {formatRupiahCompact(b.estimatedValue)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
