import { useQuery } from '@tanstack/react-query';
import { Warehouse, Loader2 } from 'lucide-react';
import api from '../../lib/api';
import { cn } from '../../lib/utils';
import { formatRupiah } from '../../lib/formatters';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TopItem {
  id: string;
  code: string;
  name: string;
  currentStock: number;
  minimumStock: number;
  averageCost: number;
  stockValue: number;
  unit: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatNumber = (val: number | string, decimals = 0) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

function stockColor(current: number, min: number): string {
  if (min <= 0) return 'bg-green-500';
  if (current > min * 2) return 'bg-green-500';
  if (current > min) return 'bg-yellow-500';
  return 'bg-red-500';
}

function stockPct(current: number, min: number): number {
  if (min <= 0) return 100;
  const target = min * 3;
  return Math.min(100, Math.round((current / target) * 100));
}

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export default function TopItemsByStock() {
  const { data, isLoading } = useQuery<TopItem[]>({
    queryKey: ['warehouse-top-items'],
    queryFn: async () => {
      const r = await api.get('/inventory/dashboard/top-items');
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
          Daftar Stok Item {data ? `(${data.length})` : ''}
        </h2>
      </div>
      {isLoading ? (
        <div className="py-12 flex items-center justify-center">
          <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <Warehouse size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs">Belum ada data item</p>
        </div>
      ) : (
        <div className="overflow-auto max-h-96">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: 'var(--color-text-muted)' }}>
                <th className="text-left font-medium pb-2">Kode</th>
                <th className="text-left font-medium pb-2">Nama</th>
                <th className="text-right font-medium pb-2">Stok</th>
                <th className="text-right font-medium pb-2">Nilai</th>
                <th className="text-right font-medium pb-2">Min</th>
                <th className="font-medium pb-2 w-24">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.map((item) => {
                const current = Number(item.currentStock);
                const min = Number(item.minimumStock);
                return (
                  <tr
                    key={item.id}
                    className="border-t"
                    style={{ borderColor: 'var(--color-border)' }}
                  >
                    <td className="py-2">
                      <span className="font-mono bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 rounded" style={{ color: 'var(--color-text-primary)' }}>
                        {item.code}
                      </span>
                    </td>
                    <td className="py-2 font-medium" style={{ color: 'var(--color-text-primary)' }}>
                      {item.name}
                    </td>
                    <td className="py-2 text-right tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                      {formatNumber(current)}
                    </td>
                    <td className="py-2 text-right tabular-nums font-mono" style={{ color: 'var(--color-text-primary)' }}>
                      {formatRupiah(item.stockValue)}
                    </td>
                    <td className="py-2 text-right tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                      {formatNumber(min)}
                    </td>
                    <td className="py-2">
                      {min > 0 ? (
                        <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-700">
                          <div
                            className={cn('h-2 rounded-full transition-all', stockColor(current, min))}
                            style={{ width: `${stockPct(current, min)}%` }}
                          />
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
