/**
 * In-memory paging/sorting for small lists whose endpoint returns every row
 * (preventive schedules, vehicle requests), driven by the same useListState
 * URL state as the server-paged lists so the table behaves identically.
 */
import type { ListSort } from '@/hooks/useListState';

export type Comparators<T> = Record<string, (a: T, b: T) => number>;

export function sortRows<T>(rows: readonly T[], sort: ListSort | null, comparators: Comparators<T>): T[] {
  const cmp = sort ? comparators[sort.id] : undefined;
  if (!sort || !cmp) return [...rows];
  const dir = sort.desc ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index }))
    .sort((a, b) => cmp(a.row, b.row) * dir || a.index - b.index)
    .map((x) => x.row);
}

export function pageRows<T>(rows: readonly T[], page: number, pageSize: number): T[] {
  const start = (Math.max(1, page) - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}

/** Compare nullable values; nulls last regardless of direction is handled by the caller's sort. */
export function compareNullable<V extends string | number>(a: V | null | undefined, b: V | null | undefined): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), 'id');
}

export const includesText = (haystack: Array<string | null | undefined>, needle: string): boolean => {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return haystack.some((h) => (h ?? '').toLowerCase().includes(q));
};
