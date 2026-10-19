import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CheckCircle2, FileWarning } from 'lucide-react';
import api from '../../lib/api';
import { formatRupiah } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { ScrollRegion } from '../dashboard-kit/ScrollRegion';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface OverdueItem {
  type: 'sales' | 'purchase';
  invoiceNumber: string;
  partyName: string;
  amount: number;
  daysOverdue: number;
}

export default function OverdueInvoices() {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError, refetch } = useQuery<OverdueItem[]>({
    queryKey: ['dashboard-overdue'],
    queryFn: async () => (await api.get('/dashboard/overdue')).data,
  });

  return (
    <WidgetCard
      title={t('overdueInvoices.title')}
      description={t('overdueInvoices.description')}
      icon={FileWarning}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && data.length === 0}
      emptyIcon={CheckCircle2}
      emptyText={t('overdueInvoices.empty')}
    >
      <ScrollRegion label={t('overdueInvoices.listLabel')} className="max-h-72 overflow-y-auto">
<ul className="divide-y divide-border">
        {(data ?? []).map((inv, i) => (
          <li key={`${inv.type}-${inv.invoiceNumber}-${i}`}>
            <Link
              to={inv.type === 'sales' ? '/sales' : '/purchase'}
              className="flex min-h-11 items-center gap-3 rounded-sm py-2 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium text-foreground">{inv.invoiceNumber}</span>
                  <Badge variant={inv.type === 'sales' ? 'info' : 'neutral'}>{inv.type === 'sales' ? t('overdueInvoices.receivable') : t('overdueInvoices.payable')}</Badge>
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{inv.partyName}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="num text-xs font-semibold text-danger-text">{formatRupiah(inv.amount)}</p>
                <p className="num text-xs text-warning-text">{t('widgetsShared.days', { count: inv.daysOverdue })}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
</ScrollRegion>
    </WidgetCard>
  );
}
