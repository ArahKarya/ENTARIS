import { useId, type ElementType, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface ReportSectionProps {
  title: string;
  icon?: ElementType;
  /** Small count chip next to the title. */
  count?: number;
  description?: ReactNode;
  /** Edge-to-edge body (a single bare <ReportDataTable variant="bare" />); the header gets a divider. */
  flush?: boolean;
  children: ReactNode;
  className?: string;
}

/** Titled card (h2) grouping a block of a report. */
export function ReportSection({ title, icon: Icon, count, description, flush, children, className }: ReportSectionProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-1)]',
        !flush && 'p-4 max-sm:p-3 sm:p-5',
        className,
      )}
    >
      <div className={cn('flex items-center gap-2', flush ? 'border-b border-border px-4 py-3 max-sm:px-3' : 'mb-3')}>
        {Icon && (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary-subtle-foreground">
            <Icon className="size-4" aria-hidden />
          </span>
        )}
        <h2 id={headingId} className="text-sm font-semibold text-foreground">
          {title}
        </h2>
        {count !== undefined && (
          <span className="num rounded-sm bg-muted px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
        )}
      </div>
      {description && <p className={cn('text-xs text-muted-foreground', flush ? 'px-4 pt-3 max-sm:px-3' : 'mb-3')}>{description}</p>}
      {children}
    </section>
  );
}

/** Filter strip wrapper for pages that need custom controls instead of <ReportFilters />. */
export function ReportFilterSection({ children, className }: { children: ReactNode; className?: string }) {
  const { t } = useTranslation('reports');
  return (
    <section aria-label={t('kit.filters.label')} className={cn('no-print flex flex-wrap items-end gap-3', className)} data-no-print>
      {children}
    </section>
  );
}

export interface MetricItem {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Colour class from tokens, e.g. 'text-danger-text'. Never the only signal: pair with text/sign. */
  valueClassName?: string;
}

/** Compact non-currency KPI grid (counts, kg, %): label + value + optional hint. */
export function ReportMetricGrid({
  items,
  label,
  className,
}: {
  items: ReadonlyArray<MetricItem>;
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation('reports');
  return (
    <dl aria-label={label ?? t('kit.summary')} className={cn('grid grid-cols-2 gap-3 sm:grid-cols-4', className)}>
      {items.map((m) => (
        <div key={m.label} className="min-w-0 rounded-lg border border-border bg-muted/40 px-4 py-3 max-sm:px-3">
          <dt className="text-xs font-medium text-muted-foreground">{m.label}</dt>
          <dd className={cn('num mt-0.5 break-words text-lg font-semibold text-foreground', m.valueClassName)}>{m.value}</dd>
          {m.hint && <dd className="mt-0.5 text-xs text-muted-foreground">{m.hint}</dd>}
        </div>
      ))}
    </dl>
  );
}
