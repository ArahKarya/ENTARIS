/** Inquiry list and summary share `buildInquiryWhere`, so KPI cards match the list rows. */
import { InquiryChannel, InquiryStatus, Prisma } from '@prisma/client';
import { firstString, parseDateParam, type SortSpec, localDayRange } from '../utils/listQuery';

export const INQUIRY_SORT_FIELDS = ['date', 'inquiryNumber', 'prospectName'] as const;
export type InquirySortField = (typeof INQUIRY_SORT_FIELDS)[number];
export const DEFAULT_INQUIRY_SORT: SortSpec<InquirySortField> = { field: 'date', dir: 'desc' };

const STATUSES = new Set<string>(Object.values(InquiryStatus));
const CHANNELS = new Set<string>(Object.values(InquiryChannel));

export type InquiryWhereResult =
  | { ok: true; where: Prisma.InquiryWhereInput }
  | { ok: false; error: string };

/**
 * Filters: status, channel, partyId, startDate/endDate (YYYY-MM-DD, on `date`),
 * search (inquiry number, prospect name or linked customer name).
 */
export function buildInquiryWhere(query: Record<string, unknown>): InquiryWhereResult {
  const where: Prisma.InquiryWhereInput = {};

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status inquiry tidak dikenal.' };
    where.status = status as InquiryStatus;
  }

  const channel = firstString(query.channel);
  if (channel) {
    if (!CHANNELS.has(channel)) return { ok: false, error: 'Channel inquiry tidak dikenal.' };
    where.channel = channel as InquiryChannel;
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
      { inquiryNumber: { contains: search, mode: 'insensitive' } },
      { prospectName: { contains: search, mode: 'insensitive' } },
      { party: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  return { ok: true, where };
}

export function inquiryOrderBy(sort: SortSpec<InquirySortField>): Prisma.InquiryOrderByWithRelationInput[] {
  const { field, dir } = sort;
  const primary: Prisma.InquiryOrderByWithRelationInput = { [field]: dir };
  // Stable tie-breaker so rows never jump between pages.
  return field === 'inquiryNumber' ? [primary] : [primary, { inquiryNumber: dir }];
}

export interface InquiryStatusGroupRow {
  status: string;
  _count: { _all: number };
}

export interface InquirySummary {
  count: number;
  newCount: number;
  inProgressCount: number;
  convertedCount: number;
  lostCount: number;
  closedCount: number;
  /** Converted ÷ all matching inquiries, 0..1 (4 decimals). 0 when empty. */
  conversionRate: number;
  byStatus: Record<string, number>;
}

export function summarizeInquiries(groups: readonly InquiryStatusGroupRow[]): InquirySummary {
  const byStatus: Record<string, number> = {};
  let count = 0;
  for (const g of groups) {
    byStatus[g.status] = (byStatus[g.status] ?? 0) + g._count._all;
    count += g._count._all;
  }
  const convertedCount = byStatus[InquiryStatus.Dikonversi] ?? 0;
  return {
    count,
    newCount: byStatus[InquiryStatus.Baru] ?? 0,
    inProgressCount: byStatus[InquiryStatus.Diproses] ?? 0,
    convertedCount,
    lostCount: byStatus[InquiryStatus.Hilang] ?? 0,
    closedCount: byStatus[InquiryStatus.Ditutup] ?? 0,
    conversionRate: count > 0 ? Math.round((convertedCount / count) * 10_000) / 10_000 : 0,
    byStatus,
  };
}
