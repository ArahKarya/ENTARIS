import { useQuery } from '@tanstack/react-query';
import { Package, Loader2 } from 'lucide-react';
import api from '../../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ProductionStats {
  totalRuns: number;
  thisMonthRuns: number;
  avgRendemen: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatNumber = (val: number | string, decimals = 0) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export default function ProductionStatsWidget() {
  const { data, isLoading } = useQuery<ProductionStats>({
    queryKey: ['warehouse-production-stats'],
    queryFn: async () => {
      const r = await api.get('/inventory/dashboard/production-stats');
      return r.data;
    },
  });

  return (
    <div
      className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Statistik Produksi
        </h2>
      </div>
      {isLoading ? (
        <div className="py-12 flex items-center justify-center">
          <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : !data ? (
        <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <Package size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs">Belum ada data produksi</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              Total Produksi
            </span>
            <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
              {formatNumber(data.totalRuns)}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              Produksi Bulan Ini
            </span>
            <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
              {formatNumber(data.thisMonthRuns)}
            </p>
          </div>
          <div>
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
              Rata-rata Yield
            </span>
            <p className="text-lg font-semibold tabular-nums mt-0.5" style={{ color: 'var(--color-text-primary)' }}>
              {Number(data.avgRendemen).toFixed(1)}%
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
