import { useQuery } from '@tanstack/react-query';
import { Truck, Loader2, Package } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '../../lib/formatters';

interface TopVendor {
  rank: number;
  partyId: string;
  partyName: string;
  total: number;
}

export default function TopVendors() {
  const { data, isLoading } = useQuery<TopVendor[]>({
    queryKey: ['dashboard-top-vendors'],
    queryFn: async () => (await api.get('/dashboard/top-vendors')).data,
  });

  const rankColors = ['text-yellow-500', 'text-gray-400', 'text-amber-600'];

  return (
    <div
      className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Vendor Teratas
        </h2>
        <Truck size={16} style={{ color: 'var(--color-text-muted)' }} />
      </div>

      {isLoading ? (
        <div className="py-8 flex items-center justify-center">
          <Loader2 className="animate-spin" size={20} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="py-8 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <Package size={28} className="mx-auto mb-2 opacity-50" />
          <p className="text-xs">Belum ada data pembelian</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map((v) => (
            <div key={v.partyId} className="flex items-center gap-3">
              <span
                className={`text-sm font-bold w-6 text-center ${rankColors[v.rank - 1] || ''}`}
                style={v.rank > 3 ? { color: 'var(--color-text-muted)' } : undefined}
              >
                {v.rank}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                  {v.partyName}
                </p>
              </div>
              <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-text-secondary)' }}>
                {formatRupiah(v.total)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
