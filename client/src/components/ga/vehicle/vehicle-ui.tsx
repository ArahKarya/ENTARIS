/**
 * Small presentational pieces shared by the fleet list and detail sections.
 * Due states are always icon + text (never colour alone).
 */
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { StatusBadge } from '@/components/shared';
import { formatDate } from '@/lib/format';
import type { StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';
import type { DueState } from './vehicle-model';
import i18n from '@/i18n';

const DUE_META: Record<DueState, { readonly label: string; readonly short: string; icon: typeof Clock; className: string }> = {
  overdue: { get label() { return i18n.t('dueState.overdue'); }, get short() { return i18n.t('dueState.overdueShort'); }, icon: AlertTriangle, className: 'text-danger-text' },
  dueSoon: { get label() { return i18n.t('dueState.dueSoon'); }, get short() { return i18n.t('dueState.dueSoonShort'); }, icon: Clock, className: 'text-warning-text' },
  ok: { get label() { return i18n.t('dueState.valid'); }, get short() { return i18n.t('dueState.validShort'); }, icon: CheckCircle2, className: 'text-success-text' },
};

interface DueMarkerProps {
  state: DueState | null | undefined;
  /** Prefix such as "KIR" → "KIR: Lewat tempo". */
  prefix?: string;
  short?: boolean;
  /** Hide the "ok" marker (show only states that need action). */
  hideOk?: boolean;
  className?: string;
}

export function DueMarker({ state, prefix, short, hideOk, className }: DueMarkerProps) {
  if (!state || (hideOk && state === 'ok')) return null;
  const meta = DUE_META[state];
  const Icon = meta.icon;
  const text = short ? meta.short : meta.label;
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium', meta.className, className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {prefix ? `${prefix}: ${text}` : text}
    </span>
  );
}

/** Date with its due marker stacked under it. */
export function DueDateCell({ date, state, hideOk = true }: { date?: string | null; state: DueState | null; hideOk?: boolean }) {
  if (!date) return <span className="text-muted-foreground">—</span>;
  const flagged = state === 'overdue' || state === 'dueSoon';
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={cn('num whitespace-nowrap', flagged ? 'font-medium text-foreground' : 'text-muted-foreground')}>
        {formatDate(date)}
      </span>
      <DueMarker state={state} hideOk={hideOk} />
    </span>
  );
}

/** Chip for enum values that are not document statuses (severity, result…). */
export function ToneBadge({ label, tone, className }: { label: string; tone: StatusTone; className?: string }) {
  return <StatusBadge label={label} tone={tone} className={className} />;
}

export function DetailItem({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Column header with a unit suffix, e.g. "BIAYA (Rp)". */
export function UnitHeader({ label, unit = 'Rp' }: { label: string; unit?: string }) {
  return (
    <>
      {label} <span className="normal-case">({unit})</span>
    </>
  );
}
