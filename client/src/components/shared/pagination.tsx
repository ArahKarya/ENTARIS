import { useEffect, useId, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatNumber } from '@/lib/format';
import { PAGE_SIZE_OPTIONS, getPageCount, getPageItems, getRowRange } from '@/lib/pagination';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  /** Total rows on the server for the current filters. */
  total: number;
  onPageChange: (page: number) => void;
  /** Omit to hide the page-size select. */
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
  /** Noun after the total, e.g. "faktur" → "Menampilkan 1–25 dari 312 faktur". */
  itemLabel?: string;
  /** Disables the controls (e.g. while the first page is loading). */
  disabled?: boolean;
  /** First load: shows "Memuat…" instead of the row count. */
  loading?: boolean;
  /** Extra tools rendered before the page-size select (e.g. DensityToggle). */
  extra?: ReactNode;
  className?: string;
}

/**
 * "Menampilkan 1–25 dari 312" + rows-per-page select + prev / numbered / next.
 * Pages beyond the last one (after a delete or a narrower filter) are clamped.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
  itemLabel,
  disabled,
  loading,
  extra,
  className,
}: PaginationProps) {
  const sizeId = useId();
  const pageCount = getPageCount(total, pageSize);
  const { from, to } = getRowRange(page, pageSize, total);
  const items = getPageItems(page, pageCount);

  useEffect(() => {
    if (!disabled && !loading && total > 0 && page > pageCount) onPageChange(pageCount);
  }, [disabled, loading, total, page, pageCount, onPageChange]);

  const summary = loading
    ? 'Memuat…'
    : total === 0
      ? `Tidak ada ${itemLabel ?? 'data'}`
      : `Menampilkan ${formatNumber(from)}–${formatNumber(to)} dari ${formatNumber(total)}${itemLabel ? ` ${itemLabel}` : ''}`;

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-border px-3 py-2.5 text-sm',
        className,
      )}
    >
      <p className="num text-muted-foreground" aria-live="polite">
        {summary}
      </p>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {extra}
        {onPageSizeChange && (
          <div className="hidden items-center gap-2 sm:flex">
            <label htmlFor={sizeId} className="whitespace-nowrap text-muted-foreground">
              Baris per halaman
            </label>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => onPageSizeChange(Number(v))}
              disabled={disabled || loading}
            >
              <SelectTrigger id={sizeId} className="h-8 w-[4.5rem] md:h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizeOptions.map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <nav aria-label="Paginasi" className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(page - 1)}
            disabled={disabled || loading || page <= 1}
            aria-label="Halaman sebelumnya"
          >
            <ChevronLeft aria-hidden />
          </Button>

          <span className="num px-2 text-muted-foreground sm:hidden">
            {page} / {pageCount}
          </span>

          <ul className="hidden items-center gap-1 sm:flex">
            {items.map((item) =>
              typeof item === 'number' ? (
                <li key={item}>
                  <Button
                    variant={item === page ? 'secondary' : 'ghost'}
                    size="sm"
                    className={cn(
                      'num min-w-8 px-2 text-sm font-normal',
                      item === page && 'border-border-strong font-semibold text-foreground',
                    )}
                    onClick={() => onPageChange(item)}
                    disabled={disabled || loading}
                    aria-label={`Halaman ${item}`}
                    aria-current={item === page ? 'page' : undefined}
                  >
                    {item}
                  </Button>
                </li>
              ) : (
                <li key={item} aria-hidden className="px-1 text-muted-foreground">
                  …
                </li>
              ),
            )}
          </ul>

          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => onPageChange(page + 1)}
            disabled={disabled || loading || page >= pageCount}
            aria-label="Halaman berikutnya"
          >
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      </div>
    </div>
  );
}
