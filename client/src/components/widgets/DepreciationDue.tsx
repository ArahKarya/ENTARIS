import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { CalendarClock, CheckCircle2 } from 'lucide-react';
import api from '../../lib/api';
import { formatDate, formatRupiah } from '@/lib/format';
import { Badge } from '@/components/ui/badge';
import { ScrollRegion } from '../dashboard-kit/ScrollRegion';
import { WidgetCard } from '../dashboard-kit/WidgetCard';

interface UpcomingEntry {
  id: string;
  assetNumber: string;
  assetName: string;
  category: string;
  amount: number;
  dueDate: string;
}

interface ApiResponse {
  depreciationDue: {
    thisMonthAmount: number;
    thisMonthEntries: number;
    upcoming: UpcomingEntry[];
  };
}

export default function DepreciationDue() {
  const { t } = useTranslation('dashboard');
  const { data, isLoading, isError, refetch } = useQuery<ApiResponse>({
    queryKey: ['dashboard-fixed-assets'],
    queryFn: async () => (await api.get('/dashboard/fixed-assets')).data,
  });
  const due = data?.depreciationDue;

  return (
    <WidgetCard
      title={t('depreciationDue.title')}
      description={t('depreciationDue.description')}
      icon={CalendarClock}
      href="/fixed-assets"
      hrefLabel={t('depreciationDue.fixedAssets')}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => void refetch()}
      minHeight={200}
    >
      {due && (
        <>
          <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-muted/50 px-3 py-2.5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{t('depreciationDue.thisMonth')}</p>
              <p className="num text-base font-semibold text-foreground">{formatRupiah(due.thisMonthAmount)}</p>
            </div>
            <p className="num text-xs text-muted-foreground">{t('depreciationDue.entries', { count: due.thisMonthEntries })}</p>
          </div>
          {due.upcoming.length === 0 ? (
            <div role="status" className="flex flex-col items-center gap-2 py-6 text-center text-muted-foreground">
              <CheckCircle2 className="size-6 opacity-60" aria-hidden />
              <p className="text-xs">{t('depreciationDue.allPosted')}</p>
            </div>
          ) : (
            <ScrollRegion label={t('depreciationDue.listLabel')} className="max-h-48 overflow-y-auto">
<ul className="divide-y divide-border">
              {due.upcoming.map((e) => (
                <li key={e.id} className="flex items-center gap-3 py-1.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-foreground">{e.assetNumber}</span>
                      <Badge>{e.category}</Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{e.assetName}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-xs font-semibold text-foreground">{formatRupiah(e.amount)}</p>
                    <p className="text-[11px] text-muted-foreground">{formatDate(e.dueDate)}</p>
                  </div>
                </li>
              ))}
            </ul>
</ScrollRegion>
          )}
        </>
      )}
    </WidgetCard>
  );
}
