import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ScrollRegion } from './ScrollRegion';

export interface MiniColumn {
  key: string;
  label: string;
  /** Numeric columns: right-aligned + tabular-nums. */
  numeric?: boolean;
  /** Hide below the sm breakpoint. */
  hideOnMobile?: boolean;
  className?: string;
}

export interface MiniTableProps<T> {
  caption: string;
  columns: MiniColumn[];
  rows: T[];
  rowKey: (row: T) => string;
  cell: (row: T, key: string) => ReactNode;
  maxHeightClass?: string;
}

/** Compact table for dashboard cards: caption, focusable scroll region, sticky header. */
export function MiniTable<T>({ caption, columns, rows, rowKey, cell, maxHeightClass = 'max-h-80' }: MiniTableProps<T>) {
  return (
    <ScrollRegion label={caption} className={cn('overflow-auto', maxHeightClass)}>
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-card">
          <tr className="text-muted-foreground">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn('pb-2 pr-3 font-medium last:pr-0', c.numeric ? 'text-right' : 'text-left', c.hideOnMobile && 'hidden sm:table-cell', c.className)}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={rowKey(r)} className="border-t border-border">
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn('py-2 pr-3 text-foreground last:pr-0', c.numeric && 'num text-right', c.hideOnMobile && 'hidden sm:table-cell', c.className)}
                >
                  {cell(r, c.key)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollRegion>
  );
}
