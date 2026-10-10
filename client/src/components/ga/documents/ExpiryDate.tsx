import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { EXPIRY_LABEL, expiryDistance, type GaExpiryState } from './ga-document-model';

const ICON = { expired: AlertTriangle, expiring: Clock, valid: CheckCircle2 } as const;
const TONE: Record<GaExpiryState, string> = {
  expired: 'text-danger-text',
  expiring: 'text-warning-text',
  valid: 'text-success-text',
};
/** Narrow-screen variant (mobile stack). */
const SHORT: Record<GaExpiryState, string> = { expired: 'Kedaluwarsa', expiring: 'Segera habis', valid: 'Berlaku' };

interface ExpiryDateProps {
  date?: string | null;
  state?: GaExpiryState | null;
  /** Only the marker with a short label (mobile stack). */
  markerOnly?: boolean;
  /** Add "12 hari lagi" / "lewat 5 hari" after the label. */
  showDistance?: boolean;
  className?: string;
}

/**
 * Expiry date with its state marker. The state is carried by an icon and a
 * text label, never by colour alone. The mobile stack (markerOnly) shows only
 * expired / expiring; the detail sheet uses ExpiryStateLine.
 */
export function ExpiryDate({ date, state, markerOnly = false, showDistance = true, className }: ExpiryDateProps) {
  // Mobile stack: only the states that need attention.
  const marked = markerOnly ? (state === 'expired' || state === 'expiring' ? state : null) : state ?? null;
  if (markerOnly && !marked) return null;
  const alert = marked === 'expired' || marked === 'expiring';
  if (!date && !markerOnly && !marked) return <span className={cn('text-muted-foreground', className)}>—</span>;
  const Icon = marked ? ICON[marked] : null;
  return (
    <span className={cn('inline-flex flex-col items-start gap-0.5', className)}>
      {!markerOnly && (
        <span className={cn('num whitespace-nowrap', alert ? 'font-medium text-foreground' : 'text-muted-foreground')}>
          {date ? formatDate(date) : 'Tanpa batas'}
        </span>
      )}
      {marked && Icon && (
        <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium', TONE[marked])}>
          <Icon className="size-3.5" aria-hidden />
          {markerOnly ? (
            <>
              <span aria-hidden>{SHORT[marked]}</span>
              <span className="sr-only">{EXPIRY_LABEL[marked]}</span>
            </>
          ) : (
            <>
              {EXPIRY_LABEL[marked]}
              {showDistance && alert && date && (
                <span className="font-normal text-muted-foreground">· {expiryDistance(date)}</span>
              )}
            </>
          )}
        </span>
      )}
    </span>
  );
}

/** Full state line for the detail sheet, including "Berlaku". */
export function ExpiryStateLine({ date, state }: { date?: string | null; state: GaExpiryState | null }) {
  if (!state) return <span className="text-muted-foreground">Tidak dipantau (dicabut/diarsipkan)</span>;
  const Icon = ICON[state];
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1 text-sm font-medium', TONE[state])}>
      <Icon className="size-4" aria-hidden />
      {EXPIRY_LABEL[state]}
      {date ? (
        <span className="font-normal text-muted-foreground">· {expiryDistance(date)}</span>
      ) : (
        <span className="font-normal text-muted-foreground">· tanpa tanggal kedaluwarsa</span>
      )}
    </span>
  );
}
