/**
 * Shared parsing for paginated list endpoints.
 *
 * Contract shared by every list endpoint:
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

const UTC_OFFSET = /^[+-]\d{2}:\d{2}$/;

/**
 * Business time zone for calendar-day filters, as a fixed UTC offset.
 * Defaults to WIB (+07:00); override with APP_UTC_OFFSET (e.g. "+08:00" WITA).
 * A fixed offset is enough for Indonesia (no daylight saving).
 */
export function businessUtcOffset(): string {
  const raw = process.env.APP_UTC_OFFSET?.trim();
  return raw && UTC_OFFSET.test(raw) ? raw : '+07:00';
}

/**
 * Turn validated `YYYY-MM-DD` start/end dates into a half-open instant range
 * [start 00:00, day-after-end 00:00) in the business time zone. Documents are
 * stored either at local midnight or at UTC midnight of their date; both fall
 * inside the correct local day, whereas UTC day boundaries drop the former.
 */
export function localDayRange(
  startDate: string | undefined,
  endDate: string | undefined,
  offset: string = businessUtcOffset(),
): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (startDate) range.gte = new Date(`${startDate}T00:00:00.000${offset}`);
  if (endDate) {
    const end = new Date(`${endDate}T00:00:00.000${offset}`);
    range.lt = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }
  return range;
}
