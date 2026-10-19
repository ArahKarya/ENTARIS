import { AlertTriangle, Clock } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import i18n from '@/i18n';

/** Server-derived (`dueState` on paged rows): open guarantee past / near its expected return date. */
export type GuaranteeDueState = 'overdue' | 'dueSoon';

const DUE_LABEL: Record<GuaranteeDueState, string> = {
  get overdue() { return i18n.t('dueState.overdue'); },
  get dueSoon() { return i18n.t('dueState.dueSoon'); },
};
/** Narrow-screen variant (mobile stack under the amount). */
const DUE_LABEL_SHORT: Record<GuaranteeDueState, string> = {
  get overdue() { return i18n.t('dueState.overdueShort'); },
  get dueSoon() { return i18n.t('dueState.nearShort'); },
};

interface DueDateProps {
  date?: string | null;
  dueState?: GuaranteeDueState | null;
  /** Hide the date and show only the marker with a short label (mobile stack). */
  markerOnly?: boolean;
  className?: string;
}

/**
 * Expected return date with its due marker. The state is carried by an icon
 * and a text label, never by colour alone.
 */
export function DueDate({ date, dueState, markerOnly = false, className }: DueDateProps) {
  if (markerOnly && !dueState) return null;
  if (!date && !markerOnly) return <span className="text-muted-foreground">—</span>;
  const Icon = dueState === 'overdue' ? AlertTriangle : Clock;
  return (
    <span className={cn('inline-flex flex-col items-start gap-0.5', className)}>
      {!markerOnly && (
        <span className={cn('num whitespace-nowrap', dueState ? 'font-medium text-foreground' : 'text-muted-foreground')}>
          {formatDate(date)}
        </span>
      )}
      {dueState && (
        <span
          className={cn(
            'inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium',
            dueState === 'overdue' ? 'text-danger-text' : 'text-warning-text',
          )}
        >
          <Icon className="size-3.5" aria-hidden />
          {markerOnly ? (
            <>
              <span aria-hidden>{DUE_LABEL_SHORT[dueState]}</span>
              <span className="sr-only">{DUE_LABEL[dueState]}</span>
            </>
          ) : (
            DUE_LABEL[dueState]
          )}
        </span>
      )}
    </span>
  );
}
