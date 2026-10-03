/**
 * Filter + sort parsing for the Surat Jalan Sementara (SJS) list,
 * GET /api/temporary-delivery-notes (raw SQL query in the route).
 *
 * Dates: `startDate`/`endDate` (list kit). The older `dateFrom`/`dateTo`
 * names are still accepted.
 */
import { firstString, parseDateParam, type SortDir, type SortSpec } from '../utils/listQuery';

export const TDN_STATUSES = ['Open', 'Linked', 'Cancelled'] as const;
export const TDN_SORT_FIELDS = ['date', 'number', 'customer'] as const;
export type TdnSortField = (typeof TDN_SORT_FIELDS)[number];
export const DEFAULT_TDN_SORT: SortSpec<TdnSortField> = { field: 'date', dir: 'desc' };

/** Normalised filters; '' means "no filter" (the SQL compares against ''). */
export interface TdnFilters {
  status: string;
  partyId: string;
  startDate: string;
  endDate: string;
  search: string;
}

export type TdnFilterResult = { ok: true; filters: TdnFilters } | { ok: false; error: string };

export function parseTdnFilters(query: Record<string, unknown>): TdnFilterResult {
  const status = firstString(query.status) ?? '';
  if (status && !(TDN_STATUSES as readonly string[]).includes(status)) {
    return { ok: false, error: 'Status surat jalan sementara tidak dikenal.' };
  }
  const startDate = parseDateParam(query.startDate ?? query.dateFrom);
  const endDate = parseDateParam(query.endDate ?? query.dateTo);
  if (startDate === null || endDate === null) {
    return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  }
  return {
    ok: true,
    filters: {
      status,
      partyId: firstString(query.partyId) ?? '',
      startDate: startDate ?? '',
      endDate: endDate ?? '',
      search: firstString(query.search) ?? '',
    },
  };
}

const SORT_COLUMN: Record<TdnSortField, string> = {
  date: 't.date',
  number: 't.number',
  customer: 'p.name',
};

/**
 * ORDER BY body for the whitelisted sort (safe to pass to Prisma.raw: only
 * fixed column names and ASC/DESC can come out of here).
 */
export function tdnOrderBySql(sort: SortSpec<TdnSortField>): string {
  const dir: 'ASC' | 'DESC' = (sort.dir satisfies SortDir) === 'asc' ? 'ASC' : 'DESC';
  const column = SORT_COLUMN[sort.field] ?? SORT_COLUMN.date;
  // Stable tie-breaker so rows never jump between pages.
  return sort.field === 'number' ? `${column} ${dir}` : `${column} ${dir}, t.number ${dir}`;
}
