import type { ReactNode } from 'react';
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
  if (isError) {
    return (
      <div className="rounded-lg border border-border bg-card">
        <EmptyState
          kind="error"
          title="Laporan gagal dimuat"
          description="Periksa koneksi Anda lalu coba lagi."
          action={onRetry && <Button onClick={onRetry}>Coba lagi</Button>}
        />
      </div>
    );
  }
  if (isLoading) {
    return (
      <div role="status" aria-busy="true" className="space-y-2 rounded-lg border border-border bg-card p-4">
        <span className="sr-only">Memuat laporan...</span>
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
          title={filtered ? 'Tidak ada hasil' : 'Tidak ada data pada periode ini'}
          description={filtered ? 'Coba ubah kata kunci pencarian.' : 'Ubah periode untuk melihat data lain.'}
          compact
        />
      </div>
    );
  }
  return <>{children}</>;
}
