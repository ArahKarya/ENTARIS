import { AlertTriangle, CheckCircle2, Clock, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import { focusRing } from '@/components/ui/styles';
import { EmptyState } from '@/components/shared';
import { ReportPage, ReportState, ReportSummaryCards, type SummaryItem } from '@/components/report-kit';
import { formatDate, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';

export type ScheduleStatus = 'overdue' | 'due_soon' | 'on_track' | 'no_due_date';

export interface ScheduleInvoice {
  id: string;
  invoiceNumber: string;
  partyName: string;
  date: string;
  dueDate: string | null;
  outstanding: number;
  daysUntilDue: number | null;
  status: ScheduleStatus;
}

interface StatusMeta {
  labelKey: `scheduleReport.status.${ScheduleStatus}`;
  variant: NonNullable<BadgeProps['variant']>;
  icon: LucideIcon;
}

const STATUS: Record<ScheduleStatus, StatusMeta> = {
  overdue: { labelKey: 'scheduleReport.status.overdue', variant: 'danger', icon: AlertTriangle },
  due_soon: { labelKey: 'scheduleReport.status.due_soon', variant: 'warning', icon: Clock },
  on_track: { labelKey: 'scheduleReport.status.on_track', variant: 'success', icon: CheckCircle2 },
  no_due_date: { labelKey: 'scheduleReport.status.no_due_date', variant: 'neutral', icon: Clock },
};

export interface ScheduleReportProps {
  /** Must equal the route registry label. */
  title: string;
  description: string;
  /** "Supplier" / "Customer". */
  partyHeader: string;
  caption: string;
  emptyText: string;
  summary: ReadonlyArray<SummaryItem>;
  invoices: ReadonlyArray<ScheduleInvoice>;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
}

function daysText(days: number | null): string {
  if (days === null) return '—';
  return days < 0
    ? i18n.t('scheduleReport.daysOverdue', { ns: 'reports', count: Math.abs(days) })
    : i18n.t('scheduleReport.daysLeft', { ns: 'reports', count: days });
}

/** Shared layout of the payable / receivable due-date schedules. */
export function ScheduleReport({
  title,
  description,
  partyHeader,
  caption,
  emptyText,
  summary,
  invoices,
  isLoading,
  isError,
  onRetry,
}: ScheduleReportProps) {
  const { t } = useTranslation('reports');
  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground';
  return (
    <ReportPage
      title={title}
      description={description}
      period={t('scheduleReport.currentPosition')}
      summary={<ReportSummaryCards loading={isLoading} items={summary} />}
    >
      <ReportState isLoading={isLoading} isError={isError} onRetry={onRetry}>
        {invoices.length === 0 ? (
          <div className="rounded-lg border border-border bg-card">
            <EmptyState kind="empty" title={emptyText} compact />
          </div>
        ) : (
        <div
          role="region"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={0}
          aria-label={caption}
          className={cn('max-h-[70vh] overflow-auto rounded-lg border border-border bg-card shadow-[var(--shadow-1)]', focusRing)}
        >
          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>
                <th scope="col" className={cn(th, 'text-left')}>{t('scheduleReport.columns.invoiceNumber')}</th>
                <th scope="col" className={cn(th, 'text-left')}>{partyHeader}</th>
                <th scope="col" className={cn(th, 'text-left max-sm:hidden')}>{t('reportsShared.date')}</th>
                <th scope="col" className={cn(th, 'text-left')}>{t('scheduleReport.columns.dueDate')}</th>
                <th scope="col" className={cn(th, 'text-right')}>{t('scheduleReport.columns.outstanding')}</th>
                <th scope="col" className={cn(th, 'text-right')}>{t('scheduleReport.columns.timeLeft')}</th>
                <th scope="col" className={cn(th, 'text-left')}>{t('reportsShared.status')}</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => {
                const meta = STATUS[inv.status];
                const Icon = meta.icon;
                return (
                  <tr key={inv.id} className="border-b border-border hover:bg-muted/50">
                    <th scope="row" className="whitespace-nowrap px-4 py-2.5 text-left font-mono text-xs font-medium">{inv.invoiceNumber}</th>
                    <td className="px-4 py-2.5">{inv.partyName}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs max-sm:hidden">{formatDate(inv.date)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-xs">{formatDate(inv.dueDate)}</td>
                    <td className="num whitespace-nowrap px-4 py-2.5 text-right font-medium">{formatRupiah(inv.outstanding, { symbol: false })}</td>
                    <td
                      className={cn(
                        'num whitespace-nowrap px-4 py-2.5 text-right text-xs font-medium',
                        inv.daysUntilDue !== null && inv.daysUntilDue < 0 && 'text-danger-text',
                      )}
                    >
                      {daysText(inv.daysUntilDue)}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge variant={meta.variant}>
                        <Icon className="size-3.5" aria-hidden />
                        {t(meta.labelKey)}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        )}
      </ReportState>
    </ReportPage>
  );
}
