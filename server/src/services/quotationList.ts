/**
 * Query building + aggregation for the quotation list
 * (GET /api/quotations and GET /api/quotations/summary).
 * Both endpoints share `buildQuotationWhere`, so the KPI cards always
 * describe exactly the rows the list shows.
 */
import { Prisma, QuotationStatus } from '@prisma/client';
import { firstString, parseDateParam, type SortSpec, localDayRange } from '../utils/listQuery';

export const QUOTATION_SORT_FIELDS = ['date', 'quotationNumber', 'customer', 'validUntil', 'grandTotal'] as const;
export type QuotationSortField = (typeof QUOTATION_SORT_FIELDS)[number];
export const DEFAULT_QUOTATION_SORT: SortSpec<QuotationSortField> = { field: 'date', dir: 'desc' };

/** A sent quotation expiring within this many days is flagged "segera kedaluwarsa". */
export const EXPIRING_SOON_DAYS = 3;

const STATUSES = new Set<string>(Object.values(QuotationStatus));

export type QuotationWhereResult =
  | { ok: true; where: Prisma.QuotationWhereInput }
  | { ok: false; error: string };

/**
 * Filters: status, partyId, startDate/endDate (YYYY-MM-DD, on `date`),
 * search (quotation number or customer name).
 */
export function buildQuotationWhere(query: Record<string, unknown>): QuotationWhereResult {
  const where: Prisma.QuotationWhereInput = {};

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status penawaran tidak dikenal.' };
    where.status = status as QuotationStatus;
  }

  const partyId = firstString(query.partyId);
  if (partyId) where.partyId = partyId;

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) {
    return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  }
  if (startDate || endDate) {
    where.date = {
      ...localDayRange(startDate, endDate),
    };
  }

  const search = firstString(query.search);
  if (search) {
    where.OR = [
      { quotationNumber: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  return { ok: true, where };
}

export function quotationOrderBy(sort: SortSpec<QuotationSortField>): Prisma.QuotationOrderByWithRelationInput[] {
  const { field, dir } = sort;
  const primary: Prisma.QuotationOrderByWithRelationInput =
    field === 'customer' ? { customer: { name: dir } } : { [field]: dir };
  // Stable tie-breaker so rows never jump between pages.
  return field === 'quotationNumber' ? [primary] : [primary, { quotationNumber: dir }];
}

/** Same rule as the row indicator: sent, not yet expired, valid ≤ 3 days more. */
export function expiringSoonWhere(now: Date): Prisma.QuotationWhereInput {
  const limit = new Date(now.getTime() + EXPIRING_SOON_DAYS * 86_400_000);
  return { status: QuotationStatus.Sent, validUntil: { gte: now, lte: limit } };
}

/** Accepted but not yet turned into a sales invoice. */
export const awaitingConversionWhere: Prisma.QuotationWhereInput = {
  status: QuotationStatus.Accepted,
  salesInvoiceId: null,
};

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export interface QuotationStatusGroupRow {
  status: string;
  _count: { _all: number };
  _sum: { grandTotal: DecimalLike };
}

export interface QuotationSummary {
  /** Every quotation matching the filters, cancelled ones included. */
  count: number;
  /** Quotation value, excluding cancelled quotations. */
  grandTotal: number;
  draftCount: number;
  sentCount: number;
  acceptedCount: number;
  /** Sent + Accepted + Rejected + Expired (left the draft stage, not cancelled). */
  issuedCount: number;
  /** Accepted ÷ issued, 0..1 (4 decimals). 0 when nothing was issued. */
  conversionRate: number;
  expiringSoonCount: number;
  awaitingConversionCount: number;
  byStatus: Record<string, { count: number; grandTotal: number }>;
}

const ISSUED: readonly string[] = [
  QuotationStatus.Sent,
  QuotationStatus.Accepted,
  QuotationStatus.Rejected,
  QuotationStatus.Expired,
];

const money = (d: Prisma.Decimal) => d.toDecimalPlaces(2).toNumber();

export function summarizeQuotations(
  groups: readonly QuotationStatusGroupRow[],
  extra: { expiringSoonCount: number; awaitingConversionCount: number },
): QuotationSummary {
  let grandTotal = new Prisma.Decimal(0);
  let count = 0;
  let issuedCount = 0;
  const byStatus: QuotationSummary['byStatus'] = {};

  for (const g of groups) {
    const n = g._count._all;
    const gt = new Prisma.Decimal(g._sum.grandTotal ?? 0);
    count += n;
    if (g.status !== QuotationStatus.Cancelled) grandTotal = grandTotal.plus(gt);
    if (ISSUED.includes(g.status)) issuedCount += n;
    byStatus[g.status] = { count: n, grandTotal: money(gt) };
  }

  const acceptedCount = byStatus[QuotationStatus.Accepted]?.count ?? 0;
  return {
    count,
    grandTotal: money(grandTotal),
    draftCount: byStatus[QuotationStatus.Draft]?.count ?? 0,
    sentCount: byStatus[QuotationStatus.Sent]?.count ?? 0,
    acceptedCount,
    issuedCount,
    conversionRate: issuedCount > 0 ? Math.round((acceptedCount / issuedCount) * 10_000) / 10_000 : 0,
    expiringSoonCount: extra.expiringSoonCount,
    awaitingConversionCount: extra.awaitingConversionCount,
    byStatus,
  };
}
