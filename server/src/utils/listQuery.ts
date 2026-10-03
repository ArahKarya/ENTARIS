/**
 * Shared parsing for paginated list endpoints.
 *
 * Contract (unchanged, reused by every list endpoint):
 *   GET /api/<resource>?page=1&limit=25&search=…&sort=-date&<filters>
 *   → { data: T[], total: number, page: number, limit: number }
 *
 * `sort` is a single field name, prefixed with "-" for descending
 * (e.g. `sort=-date`). Fields are whitelisted per endpoint.
 */

export type SortDir = 'asc' | 'desc';

export interface ListPaging {
  page: number;
  limit: number;
  skip: number;
}

export interface SortSpec<F extends string> {
  field: F;
  dir: SortDir;
}

/** Express may hand us string | string[] | ParsedQs; keep the first string. */
export function firstString(value: unknown): string | undefined {
  if (Array.isArray(value)) return firstString(value[0]);
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function positiveInt(value: unknown): number | undefined {
  const s = firstString(value);
  if (s === undefined) return undefined;
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function parseListPaging(
  query: Record<string, unknown>,
  options: { defaultLimit: number; maxLimit: number },
): ListPaging {
  const page = positiveInt(query.page) ?? 1;
  const limit = Math.min(positiveInt(query.limit) ?? options.defaultLimit, options.maxLimit);
  return { page, limit, skip: (page - 1) * limit };
}

export function parseSort<F extends string>(
  value: unknown,
  allowed: readonly F[],
  fallback: SortSpec<F>,
): SortSpec<F> {
  const raw = firstString(value);
  if (!raw) return fallback;
  const desc = raw.startsWith('-');
  const field = (desc ? raw.slice(1) : raw) as F;
  return allowed.includes(field) ? { field, dir: desc ? 'desc' : 'asc' } : fallback;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `YYYY-MM-DD` → string; undefined when absent; null when malformed. */
export function parseDateParam(value: unknown): string | undefined | null {
  const s = firstString(value);
  if (s === undefined) return undefined;
  if (!ISO_DATE.test(s)) return null;
  return Number.isNaN(new Date(`${s}T00:00:00.000Z`).getTime()) ? null : s;
}
