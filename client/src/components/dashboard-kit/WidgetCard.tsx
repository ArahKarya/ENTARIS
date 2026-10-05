import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, RotateCw, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export interface WidgetCardProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  /** "Lihat semua" style drill-down link. */
  href?: string;
  hrefLabel?: string;
  /** Extra header content (legend, toggle). */
  actions?: ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  isEmpty?: boolean;
  emptyIcon?: LucideIcon;
  emptyText?: string;
  /** Reserved body height (px) while loading/empty so the layout never shifts. */
  minHeight?: number;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
}

/** Skeleton body with a fixed height — also used as the lazy-chunk Suspense fallback. */
export function WidgetSkeleton({ height = 220, title }: { height?: number; title?: string }) {
  return (
    <section
      aria-busy="true"
      aria-label={title ? `${title} (memuat)` : 'Memuat widget'}
      className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-1)]"
    >
      <Skeleton className="h-4 w-40" />
      <Skeleton className="mt-4 w-full" style={{ height }} />
    </section>
  );
}

/**
 * Dashboard widget shell: header (title, link, actions) + body that handles
 * loading skeleton, error card with retry, and empty state consistently.
 */
export function WidgetCard({
  title,
  description,
  icon: Icon,
  href,
  hrefLabel = 'Lihat semua',
  actions,
  isLoading,
  isError,
  onRetry,
  isEmpty,
  emptyIcon: EmptyIcon,
  emptyText = 'Belum ada data',
  minHeight = 160,
  className,
  bodyClassName,
  children,
}: WidgetCardProps) {
  let body: ReactNode;
  if (isLoading) {
    body = (
      <div className="space-y-3" style={{ minHeight }} aria-hidden>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    );
  } else if (isError) {
    body = (
      <div role="alert" className="flex flex-col items-center justify-center gap-2 text-center" style={{ minHeight }}>
        <AlertTriangle className="size-6 text-danger-text" aria-hidden />
        <p className="text-sm font-medium text-foreground">Data gagal dimuat</p>
        {onRetry && (
          <Button type="button" variant="outline" size="sm" onClick={onRetry} className="min-h-11 sm:min-h-8">
            <RotateCw className="size-3.5" aria-hidden /> Coba lagi
          </Button>
        )}
      </div>
    );
  } else if (isEmpty) {
    body = (
      <div role="status" className="flex items-center gap-2.5 rounded-md bg-muted/40 px-3 py-3 text-muted-foreground">
        {EmptyIcon && <EmptyIcon className="size-5 shrink-0 opacity-70" strokeWidth={1.5} aria-hidden />}
        <p className="text-sm">{emptyText}</p>
      </div>
    );
  } else {
    body = children;
  }

  return (
    <section
      aria-label={title}
      aria-busy={isLoading || undefined}
      className={cn('min-w-0 rounded-lg border border-border bg-card p-4 text-card-foreground shadow-[var(--shadow-1)]', className)}
    >
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {Icon && <Icon className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />}
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {actions}
          {href && (
            <Link
              to={href}
              className="inline-flex min-h-11 items-center gap-1 rounded-sm text-xs font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-0"
            >
              {hrefLabel} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
      </header>
      <div className={bodyClassName}>{body}</div>
    </section>
  );
}
