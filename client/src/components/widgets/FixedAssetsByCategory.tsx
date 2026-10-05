import { useQuery } from '@tanstack/react-query';
import { PieChart } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '@/lib/format';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { DonutBreakdown } from '../dashboard-kit/DonutBreakdown';

interface CategoryRow {
  category: string;
  count: number;
  totalCost: number;
  totalBookValue: number;
  pct: number;
}

interface ApiResponse {
  byCategory: CategoryRow[];
}

export default function FixedAssetsByCategory() {
  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['dashboard-fixed-assets'],
    queryFn: async () => (await api.get('/dashboard/fixed-assets')).data,
  });
  const rows = data?.byCategory ?? [];
  const total = rows.reduce((s, r) => s + r.totalBookValue, 0);

  return (
    <WidgetCard
      title="Aset per Kategori"
      description="Distribusi nilai buku"
      icon={PieChart}
      href="/fixed-assets"
      hrefLabel="Aset tetap"
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && rows.length === 0}
      emptyIcon={PieChart}
      emptyText="Belum ada aset"
      minHeight={290}
    >
      <DonutBreakdown
        data={rows.map((r) => ({ key: r.category, label: r.category, value: r.totalBookValue, note: `${r.count} aset` }))}
        formatValue={(n) => formatRupiah(n, { compact: true })}
        summary={`Diagram donat nilai buku aset tetap per kategori, total ${formatRupiah(total)}.`}
        caption="Nilai buku aset per kategori"
        valueHeader="Nilai buku"
      />
    </WidgetCard>
  );
}
