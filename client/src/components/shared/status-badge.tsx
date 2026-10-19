import { cn } from '@/lib/utils';
import { getStatusMeta, type DocType, type StatusTone } from '@/lib/status';

const TONE_CLASSES: Record<StatusTone, { chip: string; dot: string }> = {
  neutral: { chip: 'bg-neutral-subtle text-neutral-text', dot: 'bg-muted-foreground' },
  primary: { chip: 'bg-primary-subtle text-primary-subtle-foreground', dot: 'bg-primary' },
  info: { chip: 'bg-info-subtle text-info-text', dot: 'bg-info' },
  success: { chip: 'bg-success-subtle text-success-text', dot: 'bg-success' },
  warning: { chip: 'bg-warning-subtle text-warning-text', dot: 'bg-warning' },
  danger: { chip: 'bg-danger-subtle text-danger-text', dot: 'bg-danger' },
};

export interface StatusBadgeProps {
  /** Raw status from the API (e.g. `PartiallyPaid`, `IN_PROGRESS`, `Disetor`). */
  status?: string | null;
  /** Document type, for statuses whose meaning differs per document. */
  docType?: DocType;
  /** Override the registry label. */
  label?: string;
  /** @deprecated use `label` */
  labelOverride?: string;
  /** Override the registry tone (or render a non-status chip). */
  tone?: StatusTone;
  /** Show the leading dot (default true). */
  dot?: boolean;
  className?: string;
}

/** Tinted status chip driven by lib/status.ts (Indonesian labels). */
export function StatusBadge({ status, docType, label, labelOverride, tone, dot = true, className }: StatusBadgeProps) {
  const meta = getStatusMeta(status, docType);
  const t = TONE_CLASSES[tone ?? meta.tone];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium leading-4',
        t.chip,
        className,
      )}
    >
      {dot && <span className={cn('size-1.5 shrink-0 rounded-full', t.dot)} aria-hidden />}
      {label ?? labelOverride ?? meta.label}
    </span>
  );
}
