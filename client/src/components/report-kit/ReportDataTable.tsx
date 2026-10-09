import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { focusRing } from '@/components/ui/styles';

export interface DataColumn<T> {
  key: string;
  /** Column header text. */
  header: string;
  /** Numeric columns: right aligned + tabular figures. */
  numeric?: boolean;
  /** Renders the cell content. */
  render: (row: T, index: number) => ReactNode;
  /** Extra classes for the body cell. */
  className?: string | ((row: T) => string | undefined);
  /** Hide the column below the `sm` breakpoint (keep it available in the data otherwise). */
  hideBelowSm?: boolean;
  /** Render the cell as a row header (`<th scope="row">`), normally the first column. */
  rowHeader?: boolean;
}

export interface ReportDataTableProps<T> {
  /** Accessible table name (sr-only caption and the scroll region label). */
  caption: string;
  columns: ReadonlyArray<DataColumn<T>>;
  rows: ReadonlyArray<T>;
  getRowKey: (row: T, index: number) => string;
  /** Extra `<tr>`s rendered directly after a row (expanded detail rows). */
  afterRow?: (row: T) => ReactNode;
  rowClassName?: (row: T) => string | undefined;
  /** `<tr>`s for the `<tfoot>` (totals). Cells must match the column count. */
  footer?: ReactNode;
  /** Shown as a single row when `rows` is empty. */
  emptyText?: string;
  /** 'card' draws its own border; 'bare' sits inside a ReportSection. */
  variant?: 'card' | 'bare';
  maxHeightClass?: string;
  className?: string;
}

const TH =
  'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground max-sm:px-3';

/**
 * Generic operational-report table: sticky header, keyboard-focusable scroll region,
 * right-aligned tabular numerics, optional expanded rows and totals footer.
 * Display only - the caller passes already-computed values.
 */
export function ReportDataTable<T>({
  caption,
  columns,
  rows,
  getRowKey,
  afterRow,
  rowClassName,
  footer,
  emptyText = 'Tidak ada baris pada periode ini.',
  variant = 'card',
  maxHeightClass = 'max-h-[70vh]',
  className,
}: ReportDataTableProps<T>) {
  return (
    <div
      role="region"
      // Scroll container must be keyboard reachable (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-label={caption}
      className={cn(
        // relative: contains sr-only text so it cannot widen the page.
        'relative overflow-auto',
        variant === 'card' && 'rounded-lg border border-border bg-card shadow-[var(--shadow-1)]',
        focusRing,
        maxHeightClass,
        className,
      )}
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                scope="col"
                className={cn(TH, col.numeric ? 'text-right' : 'text-left', col.hideBelowSm && 'max-sm:hidden')}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-sm text-muted-foreground">
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <RowGroup key={getRowKey(row, index)}>
                <tr className={cn('border-b border-border hover:bg-muted/50', rowClassName?.(row))}>
                  {columns.map((col) => {
                    const cls = cn(
                      'px-4 py-2.5 align-top max-sm:px-3',
                      col.numeric && 'num text-right',
                      col.hideBelowSm && 'max-sm:hidden',
                      typeof col.className === 'function' ? col.className(row) : col.className,
                    );
                    return col.rowHeader ? (
                      <th key={col.key} scope="row" className={cn(cls, 'text-left font-medium')}>
                        {col.render(row, index)}
                      </th>
                    ) : (
                      <td key={col.key} className={cls}>
                        {col.render(row, index)}
                      </td>
                    );
                  })}
                </tr>
                {afterRow?.(row)}
              </RowGroup>
            ))
          )}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}

function RowGroup({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

/** Footer cell helper: consistent total-row styling for `footer` rows. */
export const TOTAL_ROW_CLASS = 'border-t-2 border-border-strong bg-muted font-semibold';
