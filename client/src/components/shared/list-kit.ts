/**
 * Glue between useListState() and <DataTable> / export helpers.
 *
 *   const list = useListState({ filters: ['status', 'partyId', 'startDate', 'endDate'] });
 *   const q = useQuery({ queryKey: ['x', 'list', list.params], queryFn: …, placeholderData: keepPreviousData });
 *   <DataTable {...listTableProps(list, q.data?.total)} columns={columns} data={q.data?.data} … />
 */
import type { ListState } from '@/hooks/useListState';
import api from '@/lib/api';

/** Server-mode props for DataTable derived from the list state. */
export function listTableProps<K extends string>(list: ListState<K>, total: number | undefined) {
  return {
    pagination: {
      page: list.page,
      pageSize: list.pageSize,
      total: total ?? 0,
      onPageChange: list.setPage,
      onPageSizeChange: list.setPageSize,
      pageSizeOptions: list.pageSizeOptions,
    },
    sort: list.sort,
    onSortChange: list.setSort,
    filtered: list.hasActiveFilters,
    onClearFilters: list.resetFilters,
  };
}

/** Response shape shared by every paginated list endpoint. */
export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export interface FetchAllResult<T> {
  rows: T[];
  total: number;
  /** True when maxRows stopped the loop before `total` was reached. */
  truncated: boolean;
}

/**
 * Loads every row matching `params` page by page (for Excel export), using
 * the endpoint's maximum page size. Stops at `maxRows` as a safety net.
 */
export async function fetchAllPages<T>(
  url: string,
  params: Record<string, string | number>,
  { pageSize = 500, maxRows = 10_000 }: { pageSize?: number; maxRows?: number } = {},
): Promise<FetchAllResult<T>> {
  const rows: T[] = [];
  let total = 0;
  for (let page = 1; ; page += 1) {
    const res = await api.get<Paginated<T>>(url, { params: { ...params, page, limit: pageSize } });
    const batch = res.data.data ?? [];
    total = res.data.total ?? batch.length;
    rows.push(...batch);
    if (batch.length < pageSize || rows.length >= total) return { rows, total, truncated: false };
    if (rows.length >= maxRows) return { rows, total, truncated: true };
  }
}
