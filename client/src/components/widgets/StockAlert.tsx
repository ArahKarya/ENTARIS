import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CheckCircle2, PackageX } from 'lucide-react';
import api from '../../lib/api';
import { formatNumber } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { ScrollRegion } from '../dashboard-kit/ScrollRegion';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

export interface StockAlertItem {
  id: string;
  name: string;
  unit: string;
  currentStock: number;
  minimumStock: number;
  status: 'Habis' | 'Rendah';
}

export default function StockAlert() {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError, refetch } = useQuery<StockAlertItem[]>({
    queryKey: ['dashboard-stock-alerts'],
    queryFn: async () => (await api.get('/dashboard/stock-alerts')).data,
  });

  return (
    <WidgetCard
      title={t('kpiCards.stockCritical')}
      description={t('stockAlert.description')}
      icon={PackageX}
      href="/inventory"
      hrefLabel={t('negativeStock.stock')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && data.length === 0}
      emptyIcon={CheckCircle2}
      emptyText={t('stockAlert.empty')}
    >
      <ScrollRegion label={t('stockAlert.listLabel')} className="max-h-72 overflow-y-auto">
<ul className="divide-y divide-border">
        {(data ?? []).map((item) => (
          <li key={item.id} className="flex items-center gap-3 py-2">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-foreground">{item.name}</p>
              <p className="num mt-0.5 text-xs text-muted-foreground">
                {t('stockAlert.stockLine', { current: formatNumber(item.currentStock), min: formatNumber(item.minimumStock), unit: item.unit })}
              </p>
            </div>
            <Badge variant={item.status === 'Habis' ? 'danger' : 'warning'}>{item.status === 'Habis' ? t('stockAlert.out') : t('stockAlert.low')}</Badge>
          </li>
        ))}
      </ul>
</ScrollRegion>
      {data && data.length >= 20 && (
        <Link to="/inventory" className="mt-2 inline-block text-xs text-primary hover:underline">{t('stockAlert.top20')}</Link>
      )}
    </WidgetCard>
  );
}
