import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import api from '../../lib/api';
import { formatDate, formatRupiah } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { ScrollRegion } from '../dashboard-kit/ScrollRegion';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface UpcomingItem {
  type: 'sales' | 'purchase';
  invoiceNumber: string;
  partyName: string;
  amount: number;
  dueDate: string;
  daysLeft: number;
}

/** Invoices (AR/AP) that fall due within the next 14 days: counterpart of "Invoice Jatuh Tempo". */
export default function UpcomingDueInvoices() {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError, refetch } = useQuery<UpcomingItem[]>({
    queryKey: ['dashboard-upcoming-due'],
    queryFn: async () => (await api.get('/dashboard/upcoming-due')).data,
  });

  return (
    <WidgetCard
      title={t('upcomingDue.title')}
      description={t('upcomingDue.description')}
      icon={CalendarClock}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      isEmpty={!!data && data.length === 0}
      emptyIcon={CheckCircle2}
      emptyText={t('upcomingDue.empty')}
    >
      <ScrollRegion label={t('upcomingDue.listLabel')} className="max-h-72 overflow-y-auto">
        <ul className="divide-y divide-border">
          {(data ?? []).map((inv) => (
            <li key={`${inv.type}-${inv.invoiceNumber}`}>
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
                  <p className="num text-xs font-semibold text-foreground">{formatRupiah(inv.amount)}</p>
                  <p className="num text-xs text-muted-foreground">
                    {formatDate(inv.dueDate)} · {inv.daysLeft === 0 ? t('widgetsShared.today') : t('upcomingDue.daysLeft', { count: inv.daysLeft })}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </ScrollRegion>
    </WidgetCard>
  );
}
