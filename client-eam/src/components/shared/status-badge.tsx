import { cn } from '@/lib/utils';

type StatusVariant = 'default' | 'success' | 'warning' | 'destructive' | 'secondary';

const STATUS_MAP: Record<string, { label: string; variant: StatusVariant }> = {
  ACTIVE: { label: 'Active', variant: 'success' },
  INACTIVE: { label: 'Inactive', variant: 'secondary' },
  PENDING: { label: 'Pending', variant: 'warning' },
  APPROVED: { label: 'Approved', variant: 'success' },
  REJECTED: { label: 'Rejected', variant: 'destructive' },
  CANCELLED: { label: 'Cancelled', variant: 'secondary' },
  DRAFT: { label: 'Draft', variant: 'secondary' },
  PROCESSING: { label: 'Processing', variant: 'warning' },
  COMPLETED: { label: 'Completed', variant: 'success' },
  FAILED: { label: 'Failed', variant: 'destructive' },
  ON_HOLD: { label: 'On Hold', variant: 'warning' },
};

const DOT_STYLES: Record<StatusVariant, string> = {
  default: 'bg-[var(--info)]',
  success: 'bg-[var(--success)]',
  warning: 'bg-[var(--warning)]',
  destructive: 'bg-destructive',
  secondary: 'bg-muted-foreground/60',
};

interface StatusBadgeProps {
  status: string;
  labelOverride?: string;
}

export function StatusBadge({ status, labelOverride }: StatusBadgeProps) {
  const config = STATUS_MAP[status] || {
    label: status,
    variant: 'secondary' as StatusVariant,
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-border bg-muted/60 px-2 py-0.5',
        'text-[11px] font-medium text-foreground tracking-tight whitespace-nowrap',
      )}
    >
      <span className={cn('h-1.5 w-1.5 rounded-full shrink-0', DOT_STYLES[config.variant])} />
      {labelOverride ?? config.label}
    </span>
  );
}
