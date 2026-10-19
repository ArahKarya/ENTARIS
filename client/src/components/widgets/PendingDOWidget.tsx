import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CheckCircle2, ChevronRight, Truck } from 'lucide-react';
import api from '../../lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { ScrollRegion } from '../dashboard-kit/ScrollRegion';
import { WidgetCard } from '../dashboard-kit/WidgetCard';
import { ReportNotice } from '../report-kit/ReportNotice';

interface PendingDO {
  id: string;
  doNumber: string;
  date: string;
  customer: { id: string; name: string } | null;
  itemCount: number;
  totalQty: number;
  unit: string;
  ageDays: number;
}

const AGE_WARNING = 5;
const AGE_CRITICAL = 10;

export default function PendingDOWidget() {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard-pending-do'],
    queryFn: async () => {
      const res = await api.get('/dashboard/pending-do');
      return res.data as PendingDO[];
    },
    refetchInterval: 60_000,
  });

  const items = data ?? [];
  const count = items.length;
  const overdue = items.filter((it) => it.ageDays >= AGE_WARNING).length;

  return (
    <WidgetCard
      title={t('pendingDo.title')}
      icon={Truck}
      href="/delivery-orders"
      hrefLabel={t('pendingDo.deliveryOrders')}
      actions={data ? <Badge variant={count === 0 ? 'success' : overdue > 0 ? 'danger' : 'warning'}>{t('pendingDo.count', { count })}</Badge> : undefined}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && count === 0}
      emptyIcon={CheckCircle2}
      emptyText={t('pendingDo.empty')}
    >
      {overdue > 0 && (
        <ReportNotice tone="warning" className="mb-3">
          <Trans t={t} i18nKey="pendingDo.notice" values={{ count: overdue, days: AGE_WARNING }} components={{ b: <strong /> }} />
        </ReportNotice>
      )}
      <ScrollRegion label={t('pendingDo.listLabel')} className="max-h-80 overflow-y-auto">
<ul className="space-y-1.5">
        {items.slice(0, 10).map((it) => (
          <li key={it.id}>
            <Link to="/delivery-orders" className="flex min-h-11 items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-foreground">{it.doNumber}</span>
                  <span className="text-muted-foreground">{formatDate(it.date)}</span>
                </div>
                <p className="mt-0.5 truncate font-medium text-foreground">{it.customer?.name ?? '—'}</p>
                <p className="num mt-0.5 text-[11px] text-muted-foreground">
                  {formatNumber(it.totalQty, { maxDecimals: 3 })} {it.unit} - {t('widgetsShared.itemCount', { count: it.itemCount })}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className={cn('num font-semibold', it.ageDays >= AGE_CRITICAL ? 'text-danger-text' : it.ageDays >= AGE_WARNING ? 'text-warning-text' : 'text-muted-foreground')}>
                  {it.ageDays === 0 ? t('widgetsShared.today') : t('widgetsShared.days', { count: it.ageDays })}
                </p>
                <ChevronRight className="inline size-3 text-muted-foreground" aria-hidden />
              </div>
            </Link>
          </li>
        ))}
      </ul>
</ScrollRegion>
      {count > 10 && <p className="mt-2 text-xs text-muted-foreground">{t('pendingDo.more', { count: count - 10 })}</p>}
    </WidgetCard>
  );
}
