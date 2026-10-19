import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/format';
import { getStatusLabel } from '@/lib/status';
import { cn } from '@/lib/utils';
import { HISTORY_LABEL, type PaymentRequestHistory } from './payment-request';

const TONE: Record<string, string> = {
  APPROVE: 'bg-success',
  PAY: 'bg-success',
  REJECT: 'bg-danger',
  RETURN: 'bg-warning',
  CANCEL: 'bg-muted-foreground',
  CANCEL_PAYMENT: 'bg-warning',
  SUBMIT: 'bg-primary',
};

/** Vertical history of a payment request (oldest first). */
export function Timeline({ items }: { items: PaymentRequestHistory[] }) {
  const { t } = useTranslation('finance');
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{t('timeline.empty')}</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5">
      {items.map((h) => (
        <li key={h.id} className="relative">
          <span
            aria-hidden
            className={cn('absolute -left-[1.6rem] top-1.5 size-2.5 rounded-full ring-4 ring-card', TONE[h.action] ?? 'bg-border-strong')}
          />
          <p className="text-sm font-medium text-foreground">
            {HISTORY_LABEL[h.action] ?? h.action}
            {h.toStatus && h.fromStatus !== h.toStatus && (
              <span className="font-normal text-muted-foreground"> → {getStatusLabel(h.toStatus, 'payment_request')}</span>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {h.actor.fullName} · <time dateTime={h.createdAt}>{formatDateTime(h.createdAt)}</time>
          </p>
          {h.note && <p className="mt-1 whitespace-pre-line rounded-md bg-muted/60 px-2.5 py-1.5 text-sm text-foreground">{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}
