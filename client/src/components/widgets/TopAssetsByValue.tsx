import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Trophy } from 'lucide-react';
import api from '../../lib/api';
import { formatDate, formatRupiah } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { MiniTable } from '../dashboard-kit/MiniTable';

interface TopAssetRow {
  id: string;
  assetNumber: string;
  name: string;
  category: string;
  acquisitionDate: string;
  acquisitionCost: number;
  bookValue: number;
  accumulatedDepreciation: number;
  accumPct: number;
}

interface ApiResponse {
  topAssets: TopAssetRow[];
}

export default function TopAssetsByValue() {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['dashboard-fixed-assets'],
    queryFn: async () => (await api.get('/dashboard/fixed-assets')).data,
  });
  const rows = data?.topAssets ?? [];

  return (
    <WidgetCard
      title={t('topAssets.title')}
      description={t('topAssets.description')}
      icon={Trophy}
      href="/fixed-assets"
      hrefLabel={t('depreciationDue.fixedAssets')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && rows.length === 0}
      emptyIcon={Trophy}
      emptyText={t('fixedAssetsByCategory.empty')}
      minHeight={200}
    >
      <MiniTable
        caption={t('topAssets.caption')}
        rows={rows}
        rowKey={(r) => r.id}
        columns={[
          { key: 'code', label: t('widgetsShared.code'), hideOnMobile: true },
          { key: 'name', label: t('widgetsShared.name') },
          { key: 'cat', label: t('widgetsShared.category'), hideOnMobile: true },
          { key: 'cost', label: t('topAssets.cost'), numeric: true, hideOnMobile: true },
          { key: 'book', label: t('topAssets.bookValue'), numeric: true },
          { key: 'dep', label: t('topAssets.depreciation'), numeric: true },
        ]}
        cell={(a, k) => {
          switch (k) {
            case 'code':
              return <span className="font-mono text-muted-foreground">{a.assetNumber}</span>;
            case 'name':
              return (
                <div className="max-w-[180px]">
                  <p className="truncate font-medium">{a.name}</p>
                  <p className="text-[11px] text-muted-foreground">{t('topAssets.acquired', { date: formatDate(a.acquisitionDate) })}</p>
                </div>
              );
            case 'cat':
              return <Badge>{a.category}</Badge>;
            case 'cost':
              return <span className="text-muted-foreground">{formatRupiah(a.acquisitionCost)}</span>;
            case 'book':
              return <span className="font-semibold">{formatRupiah(a.bookValue)}</span>;
            default:
              return (
                <div className="flex items-center justify-end gap-1.5">
                  <div className="h-1.5 w-12 overflow-hidden rounded-sm bg-muted" aria-hidden>
                    <div className="h-full bg-chart-4" style={{ width: `${Math.min(100, a.accumPct)}%` }} />
                  </div>
                  <span className="w-9 text-right text-[11px] text-muted-foreground">{a.accumPct}%</span>
                </div>
              );
          }
        }}
      />
    </WidgetCard>
  );
}
