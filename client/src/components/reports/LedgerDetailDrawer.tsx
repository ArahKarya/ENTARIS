import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../lib/api';
import { ExternalLink } from 'lucide-react';
import { formatRupiah, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { EmptyState, LoadingState } from '@/components/shared';
import { Button } from '@/components/ui/button';

interface LedgerDetailDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  accountId: string | null;
  accountName: string;
  startDate?: string;
  endDate?: string;
}

const LedgerDetailDrawer: React.FC<LedgerDetailDrawerProps> = ({
  isOpen,
  onClose,
  accountId,
  accountName,
  startDate,
  endDate,
}) => {
  const { t } = useTranslation('reports');
  const navigate = useNavigate();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['ledger-detail', accountId, startDate, endDate],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (accountId) params.accountId = accountId;
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const r = await api.get('/reports/ledger-detail', { params });
      return r.data;
    },
    enabled: isOpen && !!accountId,
  });

  const handleReferenceClick = (referenceType: string, _referenceId: string) => {
    // Navigate to related page based on reference type
    if (referenceType === 'JournalEntry' || referenceType === 'journal') {
      navigate('/gl');
    } else if (referenceType === 'SalesInvoice' || referenceType === 'sales') {
      navigate('/sales');
    } else if (referenceType === 'PurchaseInvoice' || referenceType === 'purchase') {
      navigate('/purchase');
    } else if (referenceType === 'Payment' || referenceType === 'payment') {
      navigate('/payments');
    } else {
      navigate('/gl');
    }
    onClose();
  };

  const th = 'px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground';
  const hasEntries = !!data?.entries && data.entries.length > 0;

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="lg">
        <SheetHeader>
          <SheetTitle className="truncate">{accountName}</SheetTitle>
          <SheetDescription>{data?.accountNumber || ''} &middot; {t('ledgerDetailDrawer.subtitle')}</SheetDescription>
        </SheetHeader>

        <SheetBody role="region" aria-label={t('ledgerDetailDrawer.bodyLabel')} tabIndex={0}>
          {isLoading ? (
            <LoadingState label={t('ledgerDetailDrawer.loading')} />
          ) : isError ? (
            <EmptyState
              kind="error"
              title={t('ledgerDetailDrawer.errorTitle')}
              description={t('ledgerDetailDrawer.errorDescription')}
              action={<Button variant="outline" onClick={() => refetch()}>{t('kit.state.retry')}</Button>}
            />
          ) : !hasEntries ? (
            <EmptyState title={t('ledgerDetailDrawer.emptyTitle')} description={t('ledgerDetailDrawer.emptyDescription')} />
          ) : (
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable at phone width
            <div className="overflow-x-auto rounded-lg border border-border" role="region" aria-label={t('ledgerDetailDrawer.tableLabel')} tabIndex={0}>
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="bg-muted/50">
                    <th scope="col" className={cn(th, 'text-left')}>{t('reportsShared.date')}</th>
                    <th scope="col" className={cn(th, 'text-left')}>{t('reportsShared.reference')}</th>
                    <th scope="col" className={cn(th, 'text-left')}>{t('reportsShared.description')}</th>
                    <th scope="col" className={cn(th, 'text-right')}>{t('reportsShared.debit')}</th>
                    <th scope="col" className={cn(th, 'text-right')}>{t('reportsShared.credit')}</th>
                    <th scope="col" className={cn(th, 'text-right')}>{t('reportsShared.balance')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.entries.map((entry: any) => (
                    <tr key={entry.id} className="border-t border-border hover:bg-accent/50">
                      <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{formatDate(entry.date)}</td>
                      <td className="px-3 py-2.5">
                        <button
                          type="button"
                          onClick={() => handleReferenceClick(entry.referenceType, entry.referenceId)}
                          className="inline-flex min-h-8 items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {entry.referenceType}
                          <ExternalLink className="size-3" aria-hidden />
                        </button>
                      </td>
                      <td className="max-w-[200px] truncate px-3 py-2.5 text-muted-foreground" title={entry.description || ''}>
                        {entry.description || '—'}
                      </td>
                      <td className={cn('whitespace-nowrap px-3 py-2.5 text-right tabular-nums', entry.debit > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                        {entry.debit > 0 ? formatRupiah(entry.debit) : '—'}
                      </td>
                      <td className={cn('whitespace-nowrap px-3 py-2.5 text-right tabular-nums', entry.credit > 0 ? 'text-foreground' : 'text-muted-foreground')}>
                        {entry.credit > 0 ? formatRupiah(entry.credit) : '—'}
                      </td>
                      <td className={cn('whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums', entry.runningBalance < 0 ? 'text-danger-text' : 'text-foreground')}>
                        {formatRupiah(Math.abs(entry.runningBalance))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
};

export default LedgerDetailDrawer;
