import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError, refetch } = useQuery<ProductionStats>({
    queryKey: ['warehouse-production-stats'],
    queryFn: async () => (await api.get('/inventory/dashboard/production-stats')).data,
  });

  const items = data
    ? [
        [t('productionStats.total'), formatNumber(data.totalRuns)],
        [t('productionStats.thisMonth'), formatNumber(data.thisMonthRuns)],
        [t('productionStats.avgYield'), `${formatNumber(Number(data.avgYield), { decimals: 1 })}%`],
      ]
    : [];

  return (
    <WidgetCard
      title={t('productionStats.title')}
      icon={Factory}
      href="/inventory"
      hrefLabel={t('productionStats.production')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!isLoading && !isError && !data}
      emptyIcon={Factory}
      emptyText={t('productionStats.empty')}
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
