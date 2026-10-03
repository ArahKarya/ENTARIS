/**
 * DataTable — TanStack-based table for list pages.
 *
 * Two modes:
 *  • client (legacy): pass `data` only; sorting/paging happen in memory.
 *  • server: pass `pagination` (page/pageSize/total + handlers). Paging and
 *    sorting are manual — the server already returned the right page. Use
 *    `listTableProps(list, total)` from ./list-kit to wire useListState.
 *
 * Column meta (ColumnDef.meta):
 *   align: 'right'   → right-aligned tabular figures (amounts, qty) — header too
 *   hideBelow: 'sm' | 'md' | 'lg' | 'xl' → column hidden under that breakpoint
 *   headerClassName / cellClassName → extra classes
 * Sorting is opt-in per column (`enableSorting: true`); in server mode the
 * column id must be the API sort field (e.g. id: 'date' → ?sort=-date).
 *
 * Mobile strategy (<640px): PRIORITY COLUMNS + HORIZONTAL SCROLL. Mark
 * secondary columns with `meta.hideBelow`; keep the document number, party,
 * the key amount, status and the ⋯ menu visible. The scroll container is a
 * labelled, focusable region so any overflow stays reachable by keyboard.
 * (`mobileCard` remains for legacy client-mode callers.)
 *
 * Density: rows are 44px (Nyaman) or 36px (Ringkas). Secondary lines inside
 * a cell can hide in compact mode with `group-data-[density=compact]/table:hidden`.
 *
 * Rows: `onRowClick` makes every row focusable; click, Enter or Space opens
 * the detail. Clicks on buttons/links/menus inside the row are ignored, so
 * <RowActions> and <DocumentLink> keep their own behaviour.
 *
 * States: skeleton rows while loading; error ("Coba lagi" → onRetry);
 * no results with active filters ("Hapus filter" → onClearFilters);
 * no data yet (`empty` title/description/action).
 */
import {
  type ColumnDef,
  type Header,
  type RowData,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useMemo, useState, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown, RotateCcw, X } from 'lucide-react';
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ListSort } from '@/hooks/useListState';
import type { TableDensity } from '@/hooks/useTableDensity';
import { cn } from '@/lib/utils';
import { EmptyState } from './empty-state';
import { Pagination } from './pagination';
import { DensityToggle } from './density-toggle';

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: 'left' | 'center' | 'right';
    hideBelow?: 'sm' | 'md' | 'lg' | 'xl';
    headerClassName?: string;
    cellClassName?: string;
  }
}

const HIDE_BELOW = {
  sm: 'hidden sm:table-cell',
  md: 'hidden md:table-cell',
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
} as const;

const ALIGN = { left: 'text-left', center: 'text-center', right: 'num text-right' } as const;

const ROW_HEIGHT: Record<TableDensity, string> = {
  comfortable: 'h-11 py-2',
  compact: 'h-9 py-1',
};

const INTERACTIVE = 'a,button,input,select,textarea,label,[role="menuitem"],[role="checkbox"],[data-row-click="ignore"]';

export interface DataTablePagination {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: readonly number[];
}

export interface DataTableEmpty {
  title?: ReactNode;
  description?: ReactNode;
  /** e.g. <Button>Buat faktur</Button> */
  action?: ReactNode;
}

export interface DataTableProps<TData, TValue = unknown> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[] | undefined;
  /** Accessible name of the table and its scroll region, e.g. "Daftar faktur penjualan". */
  label?: string;
  getRowId?: (row: TData, index: number) => string;

  /** Server mode: the presence of this prop switches to manual pagination. */
  pagination?: DataTablePagination;
  /** Noun used in "Menampilkan 1–25 dari 312 <itemLabel>". */
  itemLabel?: string;
  sort?: ListSort | null;
  onSortChange?: (sort: ListSort | null) => void;

  /** First load (no rows yet): skeleton rows. */
  loading?: boolean;
  /** Refetching with stale rows visible (dims the body). */
  fetching?: boolean;
  error?: unknown;
  onRetry?: () => void;
  /** Filters/search are active → empty result shows "Tidak ada hasil". */
  filtered?: boolean;
  onClearFilters?: () => void;
  empty?: DataTableEmpty;

  onRowClick?: (row: TData) => void;
  rowClassName?: (row: TData) => string | undefined;
  density?: TableDensity;
  /** Shows the Nyaman/Ringkas toggle in the footer (pair with useTableDensity). */
  onDensityChange?: (density: TableDensity) => void;
  /** Sticky header + bounded height from sm up (default true). */
  stickyHeader?: boolean;
  /** CSS length for the bounded height (default: viewport minus shell chrome). */
  maxHeight?: string;
  className?: string;

  /** Client mode only. */
  pageSize?: number;
  /** Client mode only (legacy): card list below md instead of the table. */
  mobileCard?: (item: TData, index: number) => ReactNode;
}

function SortIcon({ dir }: { dir: false | 'asc' | 'desc' }) {
  if (dir === 'asc') return <ArrowUp className="size-3.5" aria-hidden />;
  if (dir === 'desc') return <ArrowDown className="size-3.5" aria-hidden />;
  return <ChevronsUpDown className="size-3.5 opacity-40" aria-hidden />;
}

function nextSort(id: string, current: ListSort | null | undefined, descFirst: boolean): ListSort | null {
  if (!current || current.id !== id) return { id, desc: descFirst };
  if (current.desc === descFirst) return { id, desc: !descFirst };
  return null;
}

export function DataTable<TData, TValue = unknown>({
  columns,
  data,
  label,
  getRowId,
  pagination,
  itemLabel,
  sort,
  onSortChange,
  loading,
  fetching,
  error,
  onRetry,
  filtered,
  onClearFilters,
  empty,
  onRowClick,
  rowClassName,
  density = 'comfortable',
  onDensityChange,
  stickyHeader = true,
  maxHeight = 'calc(100dvh - 11rem)',
  className,
  pageSize = 10,
  mobileCard,
}: DataTableProps<TData, TValue>) {
  const server = !!pagination;
  const [clientSorting, setClientSorting] = useState<SortingState>([]);
  const [clientPage, setClientPage] = useState({ pageIndex: 0, pageSize });
  const rows = useMemo(() => data ?? [], [data]);

  const sorting: SortingState = server ? (sort ? [{ id: sort.id, desc: sort.desc }] : []) : clientSorting;

  const table = useReactTable({
    data: rows,
    columns,
    getRowId,
    defaultColumn: { enableSorting: false },
    getCoreRowModel: getCoreRowModel(),
    ...(server
      ? { manualPagination: true, manualSorting: true, rowCount: pagination.total }
      : { getPaginationRowModel: getPaginationRowModel(), getSortedRowModel: getSortedRowModel() }),
    state: server ? { sorting } : { sorting, pagination: clientPage },
    onSortingChange: server ? undefined : setClientSorting,
    onPaginationChange: server ? undefined : setClientPage,
  });

  const visibleRows = table.getRowModel().rows;
  const colCount = columns.length;
  const firstLoad = !!loading && rows.length === 0;
  const hasError = !!error;

  const toggleSort = (header: Header<TData, unknown>) => {
    const id = header.column.id;
    const descFirst = header.column.columnDef.sortDescFirst ?? false;
    if (server) {
      onSortChange?.(nextSort(id, sort, descFirst));
    } else {
      const cur = clientSorting[0];
      const next = nextSort(id, cur ? { id: cur.id, desc: cur.desc } : null, descFirst);
      setClientSorting(next ? [{ id: next.id, desc: next.desc }] : []);
    }
  };

  const openRow = (row: TData) => onRowClick?.(row);

  const handleRowClick = (e: MouseEvent<HTMLTableRowElement>, row: TData) => {
    const target = e.target as HTMLElement;
    const hit = target.closest(INTERACTIVE);
    if (hit && hit !== e.currentTarget && e.currentTarget.contains(hit)) return;
    // Portaled menus bubble through React; ignore anything outside the row DOM.
    if (!e.currentTarget.contains(target)) return;
    openRow(row);
  };

  const handleRowKey = (e: KeyboardEvent<HTMLTableRowElement>, row: TData) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openRow(row);
    }
  };

  const cellClasses = (meta: ColumnDef<TData, TValue>['meta'] | undefined) =>
    cn(meta?.align && ALIGN[meta.align], meta?.hideBelow && HIDE_BELOW[meta.hideBelow]);

  let body: ReactNode;
  if (firstLoad) {
    const count = Math.min(server ? pagination.pageSize : pageSize, 8);
    body = Array.from({ length: count }, (_, i) => (
      <TableRow key={`sk-${i}`} className="hover:bg-transparent">
        {table.getVisibleLeafColumns().map((col) => (
          <TableCell key={col.id} className={cn(ROW_HEIGHT[density], cellClasses(col.columnDef.meta))}>
            <Skeleton className={cn('h-4', col.columnDef.meta?.align === 'right' ? 'ml-auto w-20' : 'w-[70%] max-w-40')} />
          </TableCell>
        ))}
      </TableRow>
    ));
  } else if (hasError || visibleRows.length === 0) {
    const state = hasError ? (
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
    ) : filtered ? (
      <EmptyState
        kind="no-results"
        compact
        action={
          onClearFilters && (
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              <X aria-hidden />
              Hapus filter
            </Button>
          )
        }
      />
    ) : (
      <EmptyState kind="empty" compact title={empty?.title} description={empty?.description} action={empty?.action} />
    );
    body = (
      <TableRow className="hover:bg-transparent">
        <TableCell colSpan={colCount} className="h-auto p-0">
          {state}
        </TableCell>
      </TableRow>
    );
  } else {
    body = visibleRows.map((row) => (
      <TableRow
        key={row.id}
        tabIndex={onRowClick ? 0 : undefined}
        onClick={onRowClick ? (e) => handleRowClick(e, row.original) : undefined}
        onKeyDown={onRowClick ? (e) => handleRowKey(e, row.original) : undefined}
        className={cn(
          onRowClick &&
            'cursor-pointer focus-visible:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
          rowClassName?.(row.original),
        )}
      >
        {row.getVisibleCells().map((cell) => {
          const meta = cell.column.columnDef.meta;
          return (
            <TableCell key={cell.id} className={cn(ROW_HEIGHT[density], cellClasses(meta), meta?.cellClassName)}>
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </TableCell>
          );
        })}
      </TableRow>
    ));
  }

  const regionStyle = stickyHeader ? ({ '--dt-max-h': maxHeight } as CSSProperties) : undefined;

  const tableEl = (
    <div
      role="region"
      aria-label={label}
      // Focusable so keyboard users can scroll overflowing columns.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      style={regionStyle}
      className={cn(
        'relative overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring',
        stickyHeader && 'sm:max-h-[var(--dt-max-h)]',
      )}
    >
      <table
        data-density={density}
        className="group/table w-full caption-bottom border-collapse text-sm"
        aria-busy={loading || fetching || undefined}
      >
        {label && <caption className="sr-only">{label}</caption>}
        <TableHeader className="[&_tr]:border-b-0">
          {table.getHeaderGroups().map((group) => (
            <TableRow key={group.id} className="hover:bg-transparent">
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta;
                // Server mode: opt-in via enableSorting (display columns have no accessor).
                const canSort = server
                  ? !!onSortChange && header.column.columnDef.enableSorting === true
                  : header.column.getCanSort();
                const dir = header.column.getIsSorted();
                const content = header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext());
                return (
                  <TableHead
                    key={header.id}
                    aria-sort={canSort ? (dir === 'asc' ? 'ascending' : dir === 'desc' ? 'descending' : 'none') : undefined}
                    className={cn(
                      'whitespace-nowrap bg-muted shadow-[inset_0_-1px_0_var(--border)]',
                      stickyHeader && 'sticky top-0 z-[var(--z-sticky)]',
                      cellClasses(meta),
                      meta?.headerClassName,
                    )}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(header as Header<TData, unknown>)}
                        className={cn(
                          '-mx-1 inline-flex items-center gap-1 rounded-sm px-1 uppercase tracking-wide hover:text-foreground',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          meta?.align === 'right' && 'flex-row-reverse',
                          dir && 'text-foreground',
                        )}
                      >
                        <span>{content}</span>
                        <SortIcon dir={dir} />
                      </button>
                    ) : (
                      content
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody className={cn(fetching && !firstLoad && 'opacity-60 transition-opacity')}>{body}</TableBody>
      </table>
    </div>
  );

  const densityToggle = onDensityChange ? (
    <DensityToggle value={density} onChange={onDensityChange} className="hidden sm:inline-flex" />
  ) : null;

  let footer: ReactNode = null;
  if (server && !hasError) {
    footer = (
      <Pagination
        page={pagination.page}
        pageSize={pagination.pageSize}
        total={pagination.total}
        onPageChange={pagination.onPageChange}
        onPageSizeChange={pagination.onPageSizeChange}
        pageSizeOptions={pagination.pageSizeOptions}
        itemLabel={itemLabel}
        loading={firstLoad}
        extra={densityToggle}
      />
    );
  } else if (!server && rows.length > clientPage.pageSize) {
    footer = (
      <Pagination
        page={clientPage.pageIndex + 1}
        pageSize={clientPage.pageSize}
        total={rows.length}
        onPageChange={(p) => setClientPage((s) => ({ ...s, pageIndex: p - 1 }))}
        itemLabel={itemLabel}
        extra={densityToggle}
      />
    );
  }

  return (
    <div className={cn('space-y-3', className)}>
      {mobileCard && !server && (
        <div className="space-y-3 md:hidden">
          {visibleRows.length ? (
            visibleRows.map((row, index) => <div key={row.id}>{mobileCard(row.original, index)}</div>)
          ) : (
            <EmptyState kind="empty" compact />
          )}
        </div>
      )}
      <div
        className={cn(
          'overflow-hidden rounded-lg border border-border bg-card shadow-[var(--shadow-1)]',
          mobileCard && !server && 'hidden md:block',
        )}
      >
        {tableEl}
        {footer}
      </div>
    </div>
  );
}
