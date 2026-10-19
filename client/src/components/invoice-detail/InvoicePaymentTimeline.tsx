/* eslint-disable @typescript-eslint/no-explicit-any -- API payloads are untyped (same as the legacy drawer) */
/**
 * Riwayat Pembayaran: combined cash/bank + deposit timeline sorted by date,
 * including cancelled entries (faded + struck through) for transparency.
 */
import { CreditCard, Wallet, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate, formatRupiah } from '@/lib/format';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export interface PaymentTimelineEntry {
  kind: 'cash' | 'deposit';
  id: string;
  label?: string;
  date: string;
  amount: number | string;
  isCancelled?: boolean;
  raw?: any;
}

interface InvoicePaymentTimelineProps {
  entries: PaymentTimelineEntry[];
  isSales: boolean;
  invoiceCancelled: boolean;
  onCancelDepositApp: (appId: string) => void;
}

export function InvoicePaymentTimeline({
  entries,
  isSales,
  invoiceCancelled,
  onCancelDepositApp,
}: InvoicePaymentTimelineProps) {
  const { t } = useTranslation('sales');
  if (entries.length === 0) return null;
  const depositTone = isSales ? 'info' : 'warning';
  return (
    <div className="border-b border-border px-6 py-4">
      <h3 className="mb-3 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <CreditCard size={10} aria-hidden /> {t('invoicePaymentTimeline.title', { count: entries.length })}
      </h3>
      <ul className="space-y-2">
        {entries.map((entry) => {
          const isDeposit = entry.kind === 'deposit';
          const cancelled = entry.isCancelled;
          const tone = isDeposit ? depositTone : 'success';
          const Icon = isDeposit ? Wallet : CreditCard;
          return (
            <li
              key={`${entry.kind}-${entry.id}`}
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg border p-3',
                cancelled
                  ? 'border-border bg-muted/40 opacity-70'
                  : tone === 'info'
                    ? 'border-info/30 bg-info-subtle/40'
                    : tone === 'warning'
                      ? 'border-warning/30 bg-warning-subtle/40'
                      : 'border-success/30 bg-success-subtle/40',
              )}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  className={cn(
                    'rounded p-1.5',
                    cancelled
                      ? 'bg-muted text-muted-foreground'
                      : tone === 'info'
                        ? 'bg-info-subtle text-info-text'
                        : tone === 'warning'
                          ? 'bg-warning-subtle text-warning-text'
                          : 'bg-success-subtle text-success-text',
                  )}
                >
                  <Icon size={13} aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs font-medium text-foreground">
                    {entry.label}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-normal text-muted-foreground">
                      {isDeposit ? t('invoicePaymentTimeline.deposit') : t('invoicePaymentTimeline.cashBank')}
                    </span>
                    {cancelled && <span className="text-xs font-normal text-danger-text">{t('invoicePaymentTimeline.cancelledTag')}</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(entry.date)}
                    {cancelled && entry.raw?.cancelledAt && (
                      <span className="text-danger-text"> · {t('invoicePaymentTimeline.cancelledOn', { date: formatDate(entry.raw.cancelledAt) })}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={cn(
                    'text-sm font-semibold tabular-nums',
                    cancelled
                      ? 'text-muted-foreground line-through'
                      : tone === 'info'
                        ? 'text-info-text'
                        : tone === 'warning'
                          ? 'text-warning-text'
                          : 'text-success-text',
                  )}
                >
                  {formatRupiah(Number(entry.amount))}
                </span>
                {isDeposit && !cancelled && !invoiceCancelled && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="text-danger-text max-sm:size-11"
                    aria-label={t('invoicePaymentTimeline.cancelAllocationAria', { label: entry.label ?? '' }).trim()}
                    title={t('invoicePaymentTimeline.cancelAllocation')}
                    onClick={() => onCancelDepositApp(entry.id)}
                  >
                    <XCircle aria-hidden />
                  </Button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
