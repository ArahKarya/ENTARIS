import { useQuery } from '@tanstack/react-query';
import { Package, Loader2 } from 'lucide-react';
import api from '../../lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CategoryItem {
  category: string;
  itemCount: number;
  totalQuantity: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatNumber = (val: number | string, decimals = 0) =>
  Number(val).toLocaleString('id-ID', { maximumFractionDigits: decimals });

// ---------------------------------------------------------------------------
// Main Widget
// ---------------------------------------------------------------------------

export default function CategoryDistribution() {
  const { data, isLoading } = useQuery<CategoryItem[]>({
    queryKey: ['warehouse-category-distribution'],
    queryFn: async () => {
      const r = await api.get('/inventory/dashboard/by-category');
      return r.data;
    },
  });

  const maxQty = data ? Math.max(...data.map((c) => c.totalQuantity), 1) : 1;

  return (
    <div
      className="border rounded-xl p-5"
      style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Distribusi Kategori
        </h2>
      </div>
      {isLoading ? (
        <div className="py-12 flex items-center justify-center">
          <Loader2 className="animate-spin" size={24} style={{ color: 'var(--color-text-muted)' }} />
        </div>
      ) : !data || data.length === 0 ? (
        <div className="py-12 text-center" style={{ color: 'var(--color-text-muted)' }}>
          <Package size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-xs">Belum ada data kategori</p>
        </div>
      ) : (
        <div className="space-y-3 max-h-64 overflow-y-auto">
          {data.map((cat) => (
            <div key={cat.category}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {cat.category || 'Tanpa Kategori'}
                </span>
                <span className="text-xs tabular-nums" style={{ color: 'var(--color-text-muted)' }}>
                  {formatNumber(cat.totalQuantity)}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-700">
                <div
                  className="h-2 rounded-full bg-blue-500 transition-all"
                  style={{ width: `${Math.round((cat.totalQuantity / maxQty) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
