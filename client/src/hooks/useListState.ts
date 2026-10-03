/**
 * useListState — URL-synced state for server-paginated list pages.
 *
 * Everything that defines "what the list shows" lives in the URL search params,
 * so back/forward works and links can be shared:
 *
 *   ?page=2&size=50&q=beras&sort=-date&status=Paid&startDate=2026-01-01
 *
 *   page   1-based page (omitted when 1)
 *   size   page size, one of pageSizeOptions (omitted when default, 25)
 *   q      search text, committed 300 ms after the last keystroke
 *   sort   "field" ascending or "-field" descending (omitted when default)
 *   <key>  one param per filter key you declare (status, partyId, …)
 *
 * Changing search, a filter, the sort or the page size resets page to 1.
 * Search typing replaces the history entry; other changes push a new one.
 * Params you do not declare (e.g. deep-link flags) are left untouched.
 *
 * Usage (see pages/SalesInvoices.tsx for the full reference page):
 *
 *   const list = useListState({ filters: ['status', 'partyId', 'startDate', 'endDate'] });
 *   const { data } = useQuery({
 *     queryKey: ['sales-invoices', 'list', list.params],
 *     queryFn: () => api.get('/sales/invoices', { params: list.params }).then((r) => r.data),
 *     placeholderData: keepPreviousData,
 *   });
 *   // list.params → { page, limit, search?, sort?, status?, … } (empty values dropped)
 *   // list.filterParams → same without page/limit/sort, for /summary or export
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DEFAULT_PAGE_SIZE, PAGE_SIZE_OPTIONS, normalizePageSize } from '@/lib/pagination';

export interface ListSort {
  /** Column / API field id, e.g. "date". */
  id: string;
  desc: boolean;
}

export interface UseListStateOptions<K extends string> {
  /** Filter keys stored in the URL (each becomes ?key=value and an API param). */
  filters?: readonly K[];
  defaultPageSize?: number;
  pageSizeOptions?: readonly number[];
  /** Sort applied when the URL has none (not written to the URL). */
  defaultSort?: ListSort | null;
  searchDebounceMs?: number;
}

export type ListParams = Record<string, string | number>;

export interface ListState<K extends string = string> {
  page: number;
  pageSize: number;
  pageSizeOptions: readonly number[];
  /** Live search input value (bind to the input). */
  searchInput: string;
  /** Committed (debounced) search, as stored in the URL — use for queries. */
  search: string;
  filters: Readonly<Record<K, string>>;
  sort: ListSort | null;
  /** True when search or any filter is set (drives "Reset" and the no-results state). */
  hasActiveFilters: boolean;
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
  setSearch: (value: string) => void;
  setFilter: (key: K, value: string) => void;
  setFilters: (patch: Partial<Record<K, string>>) => void;
  setSort: (sort: ListSort | null) => void;
  /** Clears search and all filters (keeps page size and sort). */
  resetFilters: () => void;
  /** API params for the list endpoint: page, limit, search, sort, filters. */
  params: ListParams;
  /** API params without paging/sort, for summary and export endpoints. */
  filterParams: Record<string, string>;
}

export const LIST_PARAM = { page: 'page', size: 'size', search: 'q', sort: 'sort' } as const;

export function serializeSort(sort: ListSort | null | undefined): string {
  return sort ? `${sort.desc ? '-' : ''}${sort.id}` : '';
}

export function parseSort(raw: string | null | undefined): ListSort | null {
  if (!raw) return null;
  const desc = raw.startsWith('-');
  const id = desc ? raw.slice(1) : raw;
  return id ? { id, desc } : null;
}

function parsePositiveInt(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

type Patch = Record<string, string | null>;

const EMPTY_FILTERS: readonly never[] = [];

export function useListState<K extends string = never>(options: UseListStateOptions<K> = {}): ListState<K> {
  const {
    filters: filterKeys = EMPTY_FILTERS as readonly K[],
    defaultPageSize = DEFAULT_PAGE_SIZE,
    pageSizeOptions = PAGE_SIZE_OPTIONS,
    defaultSort = null,
    searchDebounceMs = 300,
  } = options;

  const [searchParams, setSearchParams] = useSearchParams();
  const filterKeyList = filterKeys.join('|');

  const page = parsePositiveInt(searchParams.get(LIST_PARAM.page)) ?? 1;
  const sizeParam = parsePositiveInt(searchParams.get(LIST_PARAM.size));
  const pageSize = sizeParam ? normalizePageSize(sizeParam, pageSizeOptions, defaultPageSize) : defaultPageSize;
  const search = searchParams.get(LIST_PARAM.search) ?? '';
  const sortRaw = searchParams.get(LIST_PARAM.sort);
  const defaultSortRaw = serializeSort(defaultSort);
  const sort = useMemo(() => parseSort(sortRaw ?? defaultSortRaw), [sortRaw, defaultSortRaw]);

  const filterValues = filterKeys.map((k) => searchParams.get(k) ?? '').join('\u0000');
  const filters = useMemo(() => {
    const values = filterValues.split('\u0000');
    return Object.fromEntries(filterKeys.map((k, i) => [k, values[i] ?? ''])) as Record<K, string>;
    // filterKeyList stands in for filterKeys (array identity changes every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterValues, filterKeyList]);

  /** Applies a patch to the URL; empty values are removed. */
  const update = useCallback(
    (patch: Patch, { resetPage = true, replace = false }: { resetPage?: boolean; replace?: boolean } = {}) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(patch)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, value);
          }
          if (resetPage) next.delete(LIST_PARAM.page);
          return next;
        },
        { replace },
      );
    },
    [setSearchParams],
  );

  // ── Search: local input, debounced commit to the URL ─────────────────────
  const [searchInput, setSearchInput] = useState(search);
  const [syncedSearch, setSyncedSearch] = useState(search);
  // Last value this hook wrote itself; an URL change to anything else
  // (back/forward, shared link) overwrites the input.
  const [ownCommit, setOwnCommit] = useState(search);
  if (search !== syncedSearch) {
    setSyncedSearch(search);
    if (search !== ownCommit) {
      setOwnCommit(search);
      setSearchInput(search);
    }
  }

  useEffect(() => {
    const next = searchInput.trim();
    if (next === search) return undefined;
    const timer = window.setTimeout(() => {
      setOwnCommit(next);
      update({ [LIST_PARAM.search]: next }, { replace: true });
    }, searchDebounceMs);
    return () => window.clearTimeout(timer);
  }, [searchInput, search, searchDebounceMs, update]);

  // ── Setters ───────────────────────────────────────────────────────────────
  const setPage = useCallback(
    (next: number) => {
      const p = Math.max(1, Math.trunc(next) || 1);
      update({ [LIST_PARAM.page]: p === 1 ? null : String(p) }, { resetPage: false });
    },
    [update],
  );

  const setPageSize = useCallback(
    (size: number) => {
      const s = normalizePageSize(size, pageSizeOptions, defaultPageSize);
      update({ [LIST_PARAM.size]: s === defaultPageSize ? null : String(s) });
    },
    [update, pageSizeOptions, defaultPageSize],
  );

  const setFilters = useCallback(
    (patch: Partial<Record<K, string>>) => {
      const clean: Patch = {};
      for (const [k, v] of Object.entries(patch)) clean[k] = (v as string | undefined) ?? null;
      update(clean);
    },
    [update],
  );

  const setFilter = useCallback((key: K, value: string) => update({ [key]: value }), [update]);

  const setSort = useCallback(
    (next: ListSort | null) => {
      const raw = serializeSort(next);
      update({ [LIST_PARAM.sort]: raw === defaultSortRaw ? null : raw || null });
    },
    [update, defaultSortRaw],
  );

  const resetFilters = useCallback(() => {
    setOwnCommit('');
    setSearchInput('');
    const patch: Patch = { [LIST_PARAM.search]: null };
    for (const k of filterKeyList.split('|').filter(Boolean)) patch[k] = null;
    update(patch);
  }, [update, filterKeyList]);

  // ── Derived API params ────────────────────────────────────────────────────
  const filterParams = useMemo(() => {
    const out: Record<string, string> = {};
    if (search) out.search = search;
    for (const [k, v] of Object.entries(filters) as [string, string][]) if (v) out[k] = v;
    return out;
  }, [search, filters]);

  const params = useMemo<ListParams>(() => {
    const out: ListParams = { page, limit: pageSize, ...filterParams };
    const s = serializeSort(sort);
    if (s) out.sort = s;
    return out;
  }, [page, pageSize, filterParams, sort]);

  const hasActiveFilters = Object.keys(filterParams).length > 0;

  return {
    page,
    pageSize,
    pageSizeOptions,
    searchInput,
    search,
    filters,
    sort,
    hasActiveFilters,
    setPage,
    setPageSize,
    setSearch: setSearchInput,
    setFilter,
    setFilters,
    setSort,
    resetFilters,
    params,
    filterParams,
  };
}
