import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Warehouse } from 'lucide-react';
import api from '../../lib/api';
import i18n from '@/i18n';
import { formatNumber, formatRupiah } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { MiniTable } from '../dashboard-kit/MiniTable';

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

type Level = { label: string; variant: 'success' | 'warning' | 'danger' };

function stockLevel(current: number, min: number): Level | null {
  if (min <= 0) return null;
  if (current > min * 2) return { label: i18n.t('topItemsByStock.level.safe', { ns: 'dashboard' }), variant: 'success' };
  if (current > min) return { label: i18n.t('topItemsByStock.level.low', { ns: 'dashboard' }), variant: 'warning' };
  return { label: i18n.t('topItemsByStock.level.critical', { ns: 'dashboard' }), variant: 'danger' };
}

export default function TopItemsByStock() {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError, refetch } = useQuery<TopItem[]>({
    queryKey: ['warehouse-top-items'],
    queryFn: async () => (await api.get('/inventory/dashboard/top-items')).data,
  });

  return (
    <WidgetCard
      title={data ? t('topItemsByStock.titleCount', { count: data.length }) : t('topItemsByStock.title')}
      icon={Warehouse}
      href="/inventory"
      hrefLabel={t('negativeStock.stock')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && data.length === 0}
      emptyIcon={Warehouse}
      emptyText={t('topItemsByStock.empty')}
      minHeight={260}
    >
      <MiniTable
        caption={t('topItemsByStock.caption')}
        rows={data ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: 'code', label: t('widgetsShared.code'), hideOnMobile: true },
          { key: 'name', label: t('widgetsShared.name') },
          { key: 'stock', label: t('widgetsShared.stock'), numeric: true },
          { key: 'value', label: t('widgetsShared.value'), numeric: true, hideOnMobile: true },
          { key: 'min', label: t('topItemsByStock.min'), numeric: true, hideOnMobile: true },
          { key: 'status', label: t('widgetsShared.status') },
        ]}
        cell={(r, k) => {
          const cur = Number(r.currentStock);
          const min = Number(r.minimumStock);
          switch (k) {
            case 'code':
              return <span className="rounded bg-muted px-1.5 py-0.5 font-mono">{r.code}</span>;
            case 'name':
              return <span className="font-medium">{r.name}</span>;
            case 'stock':
              return formatNumber(cur);
            case 'value':
              return formatRupiah(r.stockValue);
            case 'min':
              return <span className="text-muted-foreground">{formatNumber(min)}</span>;
            default: {
              const lv = stockLevel(cur, min);
              return lv ? <Badge variant={lv.variant}>{lv.label}</Badge> : <span className="text-muted-foreground">—</span>;
            }
          }
        }}
      />
    </WidgetCard>
  );
}
