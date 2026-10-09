/**
 * Building blocks shared by the inventory and production dashboards:
 * URL-bound period selector, titled panel, panel states and chart tooltip.
 */
import { useId, type ReactNode } from 'react';
import { CalendarRange, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { DateInput, EmptyState } from '@/components/shared';
import { cn } from '@/lib/utils';
import {
  DEFAULT_PERIOD,
  PERIOD_PRESETS,
  type DashboardPeriod,
  type PeriodPreset,
} from './dashboard-model';

interface PeriodToolbarProps {
  period: DashboardPeriod;
  onPresetChange: (preset: PeriodPreset) => void;
  onRangeChange: (startDate: string, endDate: string) => void;
  /** Extra controls / notes on the right. */
  children?: ReactNode;
  className?: string;
}

/** "Periode" select (+ date range when custom) with the resolved range as text. */
export function PeriodToolbar({ period, onPresetChange, onRangeChange, children, className }: PeriodToolbarProps) {
  const id = useId();
  const custom = period.preset === 'custom';
  return (
    <div role="group" aria-label="Periode dashboard" className={cn('flex flex-wrap items-center gap-2', className)}>
      <label htmlFor={`${id}-preset`} className="sr-only">
        Periode
      </label>
      <Select value={period.preset} onValueChange={(v) => onPresetChange(v as PeriodPreset)}>
        <SelectTrigger id={`${id}-preset`} className="w-full sm:w-48">
          <CalendarRange className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0 flex-1">
            <SelectValue />
          </span>
        </SelectTrigger>
        <SelectContent>
          {PERIOD_PRESETS.map((p) => (
            <SelectItem key={p.value} value={p.value}>
              {p.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {custom ? (
        <fieldset className="flex w-full items-center gap-1.5 sm:w-auto">
          <legend className="sr-only">Rentang tanggal</legend>
          <label htmlFor={`${id}-from`} className="sr-only">
            Dari tanggal
          </label>
          <DateInput
            id={`${id}-from`}
            value={period.startDate}
            max={period.endDate}
            onChange={(v) => v && onRangeChange(v, period.endDate)}
            className="min-w-0 flex-1 sm:w-36 sm:flex-none"
          />
          <span className="text-muted-foreground" aria-hidden>
            –
          </span>
          <label htmlFor={`${id}-to`} className="sr-only">
            Sampai tanggal
          </label>
          <DateInput
            id={`${id}-to`}
            value={period.endDate}
            min={period.startDate}
            onChange={(v) => v && onRangeChange(period.startDate, v)}
            className="min-w-0 flex-1 sm:w-36 sm:flex-none"
          />
        </fieldset>
      ) : (
        <span className="num text-sm text-muted-foreground">{period.rangeLabel}</span>
      )}
      {period.preset !== DEFAULT_PERIOD && (
        <Button variant="ghost" size="md" onClick={() => onPresetChange(DEFAULT_PERIOD)} className="text-muted-foreground">
          <RotateCcw aria-hidden />
          Bulan ini
        </Button>
      )}
      {children && <div className="ml-auto flex items-center gap-2">{children}</div>}
    </div>
  );
}

// Panel

interface PanelProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right side of the header (link, toggle, count). */
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  /** Accessible id for aria-labelledby. */
  id?: string;
}

/** Card with a compact header; the body is flush when `bodyClassName` sets p-0. */
export function Panel({ title, description, action, children, className, bodyClassName, id }: PanelProps) {
  const autoId = useId();
  const headingId = id ?? `panel-${autoId}`;
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex min-w-0 flex-col rounded-lg border border-border bg-card text-card-foreground shadow-[var(--shadow-1)]',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 id={headingId} className="font-heading text-sm font-semibold leading-5 text-foreground">
            {title}
          </h2>
          {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </header>
      <div className={cn('min-w-0 flex-1 p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Loading / error / empty body for a panel. Renders `children` otherwise. */
export function PanelState({
  loading,
  error,
  empty,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyIcon,
  skeleton = 'rows',
  children,
}: {
  loading?: boolean;
  error?: unknown;
  empty?: boolean;
  onRetry?: () => void;
  emptyTitle?: ReactNode;
  emptyDescription?: ReactNode;
  emptyIcon?: Parameters<typeof EmptyState>[0]['icon'];
  skeleton?: 'rows' | 'chart';
  children: ReactNode;
}) {
  if (loading) {
    return skeleton === 'chart' ? (
      <div aria-busy className="flex h-64 items-end gap-3 px-2 pb-2" role="status" aria-label="Memuat grafik">
        {[56, 80, 40, 68, 30, 90, 50].map((h, i) => (
          <Skeleton key={i} className="flex-1" style={{ height: `${h}%` }} />
        ))}
      </div>
    ) : (
      <div aria-busy className="space-y-3" role="status" aria-label="Memuat data">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState
        kind="error"
        compact
        action={
          onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw aria-hidden />
              Coba lagi
            </Button>
          )
        }
      />
    );
  }
  if (empty) {
    return <EmptyState kind="empty" compact icon={emptyIcon} title={emptyTitle} description={emptyDescription} />;
  }
  return <>{children}</>;
}

// Charts

interface TooltipRow {
  label: ReactNode;
  value: ReactNode;
  color?: string;
}

/** Token-styled tooltip body; pass as `content` render to recharts' <Tooltip>. */
export function ChartTooltipBox({ title, rows }: { title?: ReactNode; rows: TooltipRow[] }) {
  return (
    <div className="min-w-40 rounded-md border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-[var(--shadow-2)]">
      {title && <p className="mb-1 font-medium text-foreground">{title}</p>}
      <dl className="space-y-0.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-4">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />}
              {r.label}
            </dt>
            <dd className="num font-medium text-foreground">{r.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Small segmented toggle (aria-pressed buttons). */
export function SegmentedToggle<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border border-border bg-muted p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(o.value)}
            className={cn(
              'h-7 rounded-sm px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              active ? 'bg-card text-foreground shadow-[var(--shadow-1)]' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
