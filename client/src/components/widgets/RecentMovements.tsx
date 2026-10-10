import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight } from 'lucide-react';
import api from '../../lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { MiniTable } from '../dashboard-kit/MiniTable';

interface RecentMovement {
  id: string;
  date: string;
  item: { name: string; unit: string; code: string };
  movementType: 'In' | 'Out' | 'AdjustmentIn' | 'AdjustmentOut';
  quantity: number;
  totalValue: number | null;
}

const MOVEMENT: Record<string, { labelKey: 'widgetsShared.in' | 'widgetsShared.out' | 'recentMovements.adjIn' | 'recentMovements.adjOut'; variant: BadgeProps['variant'] }> = {
  In: { labelKey: 'widgetsShared.in', variant: 'success' },
  Out: { labelKey: 'widgetsShared.out', variant: 'danger' },
  AdjustmentIn: { labelKey: 'recentMovements.adjIn', variant: 'info' },
  AdjustmentOut: { labelKey: 'recentMovements.adjOut', variant: 'warning' },
};

export default function RecentMovements() {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError, refetch } = useQuery<RecentMovement[]>({
    queryKey: ['warehouse-recent-movements'],
    queryFn: async () => (await api.get('/inventory/dashboard/recent-movements')).data,
  });

  return (
    <WidgetCard
      title={t('recentMovements.title')}
      icon={ArrowLeftRight}
      href="/inventory"
      hrefLabel={t('negativeStock.stock')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && data.length === 0}
      emptyIcon={ArrowLeftRight}
      emptyText={t('recentMovements.empty')}
      minHeight={260}
    >
      <MiniTable
        caption={t('recentMovements.caption')}
        rows={data ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: 'date', label: t('widgetsShared.date') },
          { key: 'item', label: t('widgetsShared.item') },
          { key: 'type', label: t('recentMovements.type') },
          { key: 'qty', label: t('widgetsShared.qty'), numeric: true },
          { key: 'value', label: t('widgetsShared.value'), numeric: true, hideOnMobile: true },
        ]}
        cell={(r, k) => {
          const meta = MOVEMENT[r.movementType];
          const mv = meta ? { label: t(meta.labelKey), variant: meta.variant } : { label: r.movementType, variant: 'neutral' as const };
          switch (k) {
            case 'date':
              return <span className="whitespace-nowrap text-muted-foreground">{formatDate(r.date, 'short')}</span>;
            case 'item':
              return <span className="block max-w-[140px] truncate font-medium">{r.item?.name ?? '—'}</span>;
            case 'type':
              return <Badge variant={mv.variant}>{mv.label}</Badge>;
            case 'qty':
              return formatNumber(r.quantity);
            default:
              return <span className="text-muted-foreground">{r.totalValue != null ? formatRupiah(Number(r.totalValue)) : '—'}</span>;
          }
        }}
      />
    </WidgetCard>
  );
}
