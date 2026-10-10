import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['dashboard-fixed-assets'],
    queryFn: async () => (await api.get('/dashboard/fixed-assets')).data,
  });
  const rows = data?.byCategory ?? [];
  const total = rows.reduce((s, r) => s + r.totalBookValue, 0);

  return (
    <WidgetCard
      title={t('fixedAssetsByCategory.title')}
      description={t('fixedAssetsByCategory.description')}
      icon={PieChart}
      href="/fixed-assets"
      hrefLabel={t('depreciationDue.fixedAssets')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && rows.length === 0}
      emptyIcon={PieChart}
      emptyText={t('fixedAssetsByCategory.empty')}
      minHeight={290}
    >
      <DonutBreakdown
        data={rows.map((r) => ({ key: r.category, label: r.category, value: r.totalBookValue, note: t('fixedAssetsByCategory.assetCount', { count: r.count }) }))}
        formatValue={(n) => formatRupiah(n, { compact: true })}
        summary={t('fixedAssetsByCategory.summary', { total: formatRupiah(total) })}
        caption={t('fixedAssetsByCategory.caption')}
        valueHeader={t('fixedAssetsByCategory.bookValue')}
      />
    </WidgetCard>
  );
}
