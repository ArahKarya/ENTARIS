/**
 * Pure pagination math shared by <Pagination> and useListState.
 * Pages are 1-based everywhere in the UI, the URL and the API.
 */

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 25;

/** At least 1 page so "Halaman 1 dari 1" is shown for empty lists. */
export function getPageCount(total: number, pageSize: number): number {
  if (!Number.isFinite(total) || total <= 0 || pageSize <= 0) return 1;
  return Math.ceil(total / pageSize);
}

export function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) return 1;
  return Math.min(Math.max(1, Math.trunc(page)), Math.max(1, pageCount));
}

/** 1-based inclusive range of rows shown; {0, 0} when empty. */
export function getRowRange(page: number, pageSize: number, total: number): { from: number; to: number } {
  if (total <= 0) return { from: 0, to: 0 };
  const p = clampPage(page, getPageCount(total, pageSize));
  return { from: (p - 1) * pageSize + 1, to: Math.min(p * pageSize, total) };
}

export type PageItem = number | 'ellipsis-start' | 'ellipsis-end';

/**
 * Page buttons with first/last always visible and `siblings` pages around the
 * current one: [1, 'ellipsis-start', 4, 5, 6, 'ellipsis-end', 12].
 * The list length is stable (2 * siblings + 5) once pageCount is large enough,
 * so the control does not jump while paging.
 */
export function getPageItems(page: number, pageCount: number, siblings = 1): PageItem[] {
  const total = Math.max(1, pageCount);
  const current = clampPage(page, total);
  const slots = 2 * siblings + 5;
  if (total <= slots) return Array.from({ length: total }, (_, i) => i + 1);

  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
  const leftSibling = Math.max(current - siblings, 1);
  const rightSibling = Math.min(current + siblings, total);
  const showLeftDots = leftSibling > 3;
  const showRightDots = rightSibling < total - 2;
  const edgeCount = 3 + 2 * siblings;

  if (!showLeftDots) return [...range(1, edgeCount), 'ellipsis-end', total];
  if (!showRightDots) return [1, 'ellipsis-start', ...range(total - edgeCount + 1, total)];
  return [1, 'ellipsis-start', ...range(leftSibling, rightSibling), 'ellipsis-end', total];
}

/** Accepts only the offered sizes; anything else falls back to the default. */
export function normalizePageSize(
  value: number,
  options: readonly number[] = PAGE_SIZE_OPTIONS,
  fallback: number = DEFAULT_PAGE_SIZE,
): number {
  return options.includes(value) ? value : fallback;
}
