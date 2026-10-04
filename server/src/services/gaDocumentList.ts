/**
 * Query building and expiry state for the GA document list
 * (GET /api/ga/documents?page=… and GET /api/ga/documents/summary).
 *
 * Expiry state (`expiryState`) — documents still in force only:
 *   expired   status EXPIRED, or ACTIVE with an expiry date before today
 *   expiring  ACTIVE, expiry date today … today + 30 days ("segera kedaluwarsa")
 *   valid     ACTIVE, no expiry date or later than that window ("berlaku")
 *   null      REVOKED / ARCHIVED (no longer tracked)
 * "Today" is the calendar day in the business time zone (listQuery), so a
 * document stored at UTC midnight of its expiry date stays valid that day.
 *
 * Read-only: nothing here writes documents or files.
 */
import { Prisma } from '@prisma/client';
import { businessUtcOffset, firstString, localDayRange, type SortSpec } from '../utils/listQuery';

export const GA_DOCUMENT_STATUSES = ['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED'] as const;
export type GaDocumentStatus = (typeof GA_DOCUMENT_STATUSES)[number];

export const GA_EXPIRY_STATES = ['expired', 'expiring', 'valid'] as const;
export type GaExpiryState = (typeof GA_EXPIRY_STATES)[number];
/** "Segera kedaluwarsa": expires today or within this many days. */
export const EXPIRING_SOON_DAYS = 30;

export const GA_DOCUMENT_SORT_FIELDS = ['expiryDate', 'code', 'title', 'effectiveDate'] as const;
export type GaDocumentSortField = (typeof GA_DOCUMENT_SORT_FIELDS)[number];
/** Legacy order of the document list (soonest expiry first). */
export const DEFAULT_GA_DOCUMENT_SORT: SortSpec<GaDocumentSortField> = { field: 'expiryDate', dir: 'asc' };

const STATUSES = new Set<string>(GA_DOCUMENT_STATUSES);
const EXPIRY = new Set<string>(GA_EXPIRY_STATES);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Calendar date (YYYY-MM-DD) of an instant in the business time zone. */
export function businessDate(instant: Date, offset: string = businessUtcOffset()): string {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  return new Date(instant.getTime() + sign * (h * 60 + m) * 60 * 1000).toISOString().slice(0, 10);
}

export interface ExpiryWindow {
  /** Start of today: an expiry date before this has passed. */
  gte: Date;
  /** Start of the day after today + 30: expiry dates before this are "expiring". */
  lt: Date;
}

/** [today 00:00, (today + 30 days) + 1 day 00:00) in the business time zone. */
export function expiryWindow(now: Date, offset: string = businessUtcOffset()): ExpiryWindow {
  const today = businessDate(now, offset);
  const lastDay = new Date(new Date(`${today}T00:00:00.000Z`).getTime() + EXPIRING_SOON_DAYS * DAY_MS)
    .toISOString()
    .slice(0, 10);
  const range = localDayRange(today, lastDay, offset);
  return { gte: range.gte as Date, lt: range.lt as Date };
}

export function deriveExpiryState(
  status: string,
  expiryDate: Date | null | undefined,
  window: ExpiryWindow,
): GaExpiryState | null {
  if (status === 'EXPIRED') return 'expired';
  if (status !== 'ACTIVE') return null;
  if (!expiryDate) return 'valid';
  const t = expiryDate.getTime();
  if (t < window.gte.getTime()) return 'expired';
  if (t < window.lt.getTime()) return 'expiring';
  return 'valid';
}

/** Same rule as deriveExpiryState, as a Prisma filter. */
export function expiryWhere(state: GaExpiryState, window: ExpiryWindow): Prisma.GaDocumentWhereInput {
  switch (state) {
    case 'expired':
      return { OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', expiryDate: { lt: window.gte } }] };
    case 'expiring':
      return { status: 'ACTIVE', expiryDate: { ...window } };
    default:
      return { status: 'ACTIVE', OR: [{ expiryDate: null }, { expiryDate: { gte: window.lt } }] };
  }
}

export type GaDocumentWhereResult =
  | { ok: true; where: Prisma.GaDocumentWhereInput }
  | { ok: false; error: string };

/**
 * Filters for the paged list and the summary:
 *   typeId, assetId
 *   status   ACTIVE | EXPIRED | REVOKED | ARCHIVED
 *   expiry   expired | expiring | valid
 *   search   code, title, issued number, issuer or related asset (code/name)
 */
export function buildGaDocumentWhere(query: Record<string, unknown>, now: Date = new Date()): GaDocumentWhereResult {
  const and: Prisma.GaDocumentWhereInput[] = [];

  const typeId = firstString(query.typeId);
  if (typeId) and.push({ typeId });

  const assetId = firstString(query.assetId);
  if (assetId) and.push({ assetId });

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status dokumen tidak dikenal.' };
    and.push({ status: status as GaDocumentStatus });
  }

  const expiry = firstString(query.expiry);
  if (expiry) {
    if (!EXPIRY.has(expiry)) return { ok: false, error: 'Filter masa berlaku tidak dikenal.' };
    and.push(expiryWhere(expiry as GaExpiryState, expiryWindow(now)));
  }

  const search = firstString(query.search);
  if (search) {
    const contains = { contains: search, mode: 'insensitive' as const };
    and.push({
      OR: [
        { code: contains },
        { title: contains },
        { issuedNumber: contains },
        { issuedBy: contains },
        { asset: { code: contains } },
        { asset: { name: contains } },
      ],
    });
  }

  return { ok: true, where: and.length ? { AND: and } : {} };
}

/** Expiry dates without a value sort last in both directions; code breaks ties. */
export function gaDocumentOrderBy(sort: SortSpec<GaDocumentSortField>): Prisma.GaDocumentOrderByWithRelationInput[] {
  switch (sort.field) {
    case 'code':
      return [{ code: sort.dir }];
    case 'title':
      return [{ title: sort.dir }, { code: 'asc' }];
    case 'effectiveDate':
      return [{ effectiveDate: { sort: sort.dir, nulls: 'last' } }, { code: 'asc' }];
    default:
      return [{ expiryDate: { sort: sort.dir, nulls: 'last' } }, { code: 'asc' }];
  }
}

/** Whole days from now until the expiry instant (legacy `daysToExpiry`). */
export function daysToExpiry(expiryDate: Date | null, now: Date): number | null {
  return expiryDate ? Math.floor((expiryDate.getTime() - now.getTime()) / DAY_MS) : null;
}

export interface GaDocumentSummary {
  count: number;
  expiredCount: number;
  expiringCount: number;
  validCount: number;
}
