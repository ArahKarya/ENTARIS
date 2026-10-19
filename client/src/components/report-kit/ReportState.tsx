import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared';

export interface ReportStateProps {
  isLoading: boolean;
  isError: boolean;
  /** Loaded fine but nothing to show. */
  isEmpty?: boolean;
  /** Empty because a search/filter hides everything (vs. truly no data). */
  filtered?: boolean;
  onRetry?: () => void;
  /** Skeleton size. */
  rows?: number;
  children: ReactNode;
}

/** Renders loading skeleton -> error (with retry) -> empty -> children. */
export function ReportState({ isLoading, isError, isEmpty, filtered, onRetry, rows = 8, children }: ReportStateProps) {
  const { t } = useTranslation('reports');
  if (isError) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          kind="error"
          title={t('kit.state.errorTitle')}
          description={t('kit.state.errorDescription')}
          action={onRetry && <Button onClick={onRetry}>{t('kit.state.retry')}</Button>}
        />
      </div>
    );
  }
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" className="space-y-2 rounded-lg border border-border bg-card p-4">
        <span className="sr-only">{t('kit.state.loading')}</span>
        {Array.from({ length: rows }, (_, i) => (
          <Skeleton key={i} className="h-8 w-full" style={{ opacity: 1 - i * 0.08 }} />
        ))}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          kind={filtered ? 'no-results' : 'empty'}
          title={filtered ? t('kit.state.noResultsTitle') : t('kit.state.emptyTitle')}
          description={filtered ? t('kit.state.noResultsDescription') : t('kit.state.emptyDescription')}
          compact
        />
      </div>
    );
  }
  return <>{children}</>;
}
