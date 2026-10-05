import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { focusRing } from '@/components/ui/styles';
import { formatAmount, visibleRows, type ReportRow } from './rows';

export interface ReportColumn {
  key: string;
  label: string;
}

export interface ReportTableProps {
  /** Accessible table name (rendered as an sr-only caption and the region label). */
  caption: string;
  /** Numeric columns (right aligned, tabular). Row `values` align by index. */
  columns: ReadonlyArray<ReportColumn>;
  rows: ReadonlyArray<ReportRow>;
  /** Rows rendered in <tfoot> (e.g. grand total). */
  footer?: ReadonlyArray<ReportRow>;
  /** Header of the label column. Default "Uraian". */
  labelHeader?: string;
  /** Show the code column with this header (e.g. "No. Akun"). Omit to hide. */
  codeHeader?: string;
  /** 'dash' renders 0 as an em dash (trial balance style). Default 'value'. */
  zero?: 'value' | 'dash';
  /** Scroll container height cap. Default 70vh. */
  maxHeightClass?: string;
  className?: string;
}

const INDENT_PX = 20;

const ROW_CLASS: Record<string, string> = {
  item: 'border-b border-border hover:bg-muted/50',
  group: 'border-b border-border bg-muted/40 font-semibold',
  subtotal: 'border-b border-border bg-muted font-semibold',
  total: 'border-y-2 border-border-strong bg-muted font-semibold',
  grand: 'bg-primary text-primary-foreground text-base font-bold',
  note: 'border-b border-border',
};

/**
 * Financial-statement table: sections, group/subtotal/total rows, indent levels,
 * collapsible groups, drill-down buttons, right-aligned tabular numbers with
 * negatives in (parentheses), sticky header, keyboard-focusable scroll region.
 */
export function ReportTable({
  caption,
  columns,
  rows,
  footer,
  labelHeader = 'Uraian',
  codeHeader,
  zero = 'value',
  maxHeightClass = 'max-h-[70vh]',
  className,
}: ReportTableProps) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const visible = useMemo(() => visibleRows(rows, collapsed), [rows, collapsed]);
  const span = columns.length + 1 + (codeHeader ? 1 : 0);

  const toggle = (key: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const renderRow = (row: ReportRow, expandable: boolean) => {
    const kind = row.kind ?? 'item';
    const level = row.level ?? 0;

    if (kind === 'section') {
      return (
        <tr key={row.key} className="bg-muted">
          <th scope="rowgroup" colSpan={span} className="px-4 py-2.5 max-sm:px-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {row.label}
          </th>
        </tr>
      );
    }
    if (kind === 'note') {
      return (
        <tr key={row.key} className={ROW_CLASS.note}>
          <td colSpan={span} className="px-4 py-5 text-center text-sm text-muted-foreground">
            {row.label}
          </td>
        </tr>
      );
    }

    const isCollapsed = collapsed.has(row.key);
    const emphasised = kind !== 'item';
    return (
      <tr key={row.key} className={ROW_CLASS[kind]}>
        {codeHeader && (
          <td className={cn('whitespace-nowrap px-4 py-2.5 max-sm:px-3 font-mono text-xs max-sm:hidden', kind === 'grand' ? '' : 'text-muted-foreground')}>{row.code}</td>
        )}
        <th scope="row" className="px-4 py-2.5 max-sm:px-3 text-left font-[inherit]" style={{ paddingLeft: `${level * INDENT_PX + 16}px` }}>
          <span className="flex min-w-0 items-center gap-1.5">
            {expandable ? (
              <button
                type="button"
                onClick={() => toggle(row.key)}
                aria-expanded={!isCollapsed}
                aria-label={`${isCollapsed ? 'Buka' : 'Tutup'} ${row.label}`}
                className={cn('-ml-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent max-sm:size-9', focusRing)}
              >
                {isCollapsed ? <ChevronRight className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
              </button>
            ) : kind === 'group' ? (
              <span className="inline-block size-6 shrink-0" aria-hidden />
            ) : null}
            {row.onSelect ? (
              <button
                type="button"
                onClick={row.onSelect}
                aria-label={row.selectLabel ?? `Lihat rincian ${row.label}`}
                className={cn('-mx-1 rounded-sm px-1 text-left font-medium text-primary underline-offset-2 hover:underline max-sm:min-h-11', focusRing)}
              >
                {row.label}
              </button>
            ) : (
              <span className={cn(emphasised ? '' : 'font-normal')}>{row.label}</span>
            )}
          </span>
        </th>
        {columns.map((col, i) => {
          const value = row.values?.[i];
          return (
            <td
              key={col.key}
              className={cn(
                'num px-4 py-2.5 max-sm:px-3 text-right',
                kind === 'item' && 'font-normal',
                typeof value === 'number' && value < 0 && kind !== 'grand' && 'text-danger-text',
                typeof value === 'number' && value === 0 && zero === 'dash' && 'text-muted-foreground',
              )}
            >
              {formatAmount(value, zero)}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div
      role="region"
      // Scroll container must be keyboard reachable (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-label={caption}
      className={cn('overflow-auto rounded-lg border border-border bg-card shadow-[var(--shadow-1)]', focusRing, maxHeightClass, className)}
    >
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {codeHeader && (
              <th scope="col" className="sticky top-0 z-10 whitespace-nowrap max-sm:hidden border-b border-border bg-muted px-4 py-2.5 max-sm:px-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {codeHeader}
              </th>
            )}
            <th scope="col" className="sticky top-0 z-10 border-b border-border bg-muted px-4 py-2.5 max-sm:px-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {labelHeader}
            </th>
            {columns.map((col) => (
              <th key={col.key} scope="col" className="sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-4 py-2.5 max-sm:px-3 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{visible.map(({ row, expandable }) => renderRow(row, expandable))}</tbody>
        {footer && footer.length > 0 && <tfoot>{footer.map((row) => renderRow(row, false))}</tfoot>}
      </table>
    </div>
  );
}
