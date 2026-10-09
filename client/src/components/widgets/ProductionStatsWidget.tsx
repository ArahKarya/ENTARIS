import { useQuery } from '@tanstack/react-query';
import { Factory } from 'lucide-react';
import api from '../../lib/api';
import { formatNumber } from '@/lib/format';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface ProductionStats {
  totalRuns: number;
  thisMonthRuns: number;
  avgYield: number;
}

export default function ProductionStatsWidget() {
  const { data, isLoading, isError, refetch } = useQuery<ProductionStats>({
    queryKey: ['warehouse-production-stats'],
    queryFn: async () => (await api.get('/inventory/dashboard/production-stats')).data,
  });

  const items = data
    ? [
        ['Total Produksi', formatNumber(data.totalRuns)],
        ['Produksi Bulan Ini', formatNumber(data.thisMonthRuns)],
        ['Rata-rata Yield', `${Number(data.avgYield).toFixed(1)}%`],
      ]
    : [];

  return (
    <WidgetCard
      title="Statistik Produksi"
      icon={Factory}
      href="/inventory"
      hrefLabel="Produksi"
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!isLoading && !isError && !data}
      emptyIcon={Factory}
      emptyText="Belum ada produksi yang diposting. Draf produksi belum dihitung sampai diposting."
      minHeight={150}
    >
      <dl className="grid grid-cols-3 gap-3 lg:grid-cols-1">
        {items.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="num mt-0.5 text-lg font-semibold text-foreground">{v}</dd>
          </div>
        ))}
      </dl>
    </WidgetCard>
  );
}
