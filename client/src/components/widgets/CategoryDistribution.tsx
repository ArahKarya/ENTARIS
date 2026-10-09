import { useQuery } from '@tanstack/react-query';
import { Layers } from 'lucide-react';
import api from '../../lib/api';
import { formatNumber } from '@/lib/format';
import { ScrollRegion } from '../dashboard-kit/ScrollRegion';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface CategoryItem {
  category: string;
  itemCount: number;
  totalQuantity: number;
}

export default function CategoryDistribution() {
  const { data, isLoading, isError, refetch } = useQuery<CategoryItem[]>({
    queryKey: ['warehouse-category-distribution'],
    queryFn: async () => (await api.get('/inventory/dashboard/by-category')).data,
  });
  const maxQty = data ? Math.max(...data.map((c) => c.totalQuantity), 1) : 1;

  return (
    <WidgetCard
      title="Kategori dengan stok terbanyak"
      description="Total kuantitas stok per kategori"
      icon={Layers}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && data.length === 0}
      emptyIcon={Layers}
      emptyText="Belum ada item persediaan yang berkategori. Isi kategori saat menambah item."
      minHeight={260}
    >
      <ScrollRegion label="Distribusi stok per kategori" className="max-h-72 overflow-y-auto">
<ul className="space-y-3">
        {(data ?? []).map((cat) => (
          <li key={cat.category}>
            <div className="mb-1 flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-xs font-medium text-foreground">{cat.category || 'Tanpa Kategori'}</span>
              <span className="num shrink-0 text-xs text-muted-foreground">{formatNumber(cat.totalQuantity)}</span>
            </div>
            <div className="h-2 rounded-full bg-muted" aria-hidden>
              <div className="h-2 rounded-full bg-chart-2" style={{ width: `${Math.round((cat.totalQuantity / maxQty) * 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
</ScrollRegion>
    </WidgetCard>
  );
}
