/**
 * Query building for the Pengajuan Pembayaran list
 * (GET /api/payment-requests?page=… and GET /api/payment-requests/summary).
 * The visibility scope (mine / approvals / payable / all) comes from
 * paymentRequestRules.scopeWhere; filters here only narrow it further, so the
 * list, the KPI cards and the Excel export always describe the same rows.
 */
import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';
import { PR_STATUSES } from './paymentRequestRules';

export const PAYMENT_REQUEST_SORT_FIELDS = ['createdAt', 'number', 'neededBy', 'totalAmount', 'requester', 'status'] as const;
export type PaymentRequestSortField = (typeof PAYMENT_REQUEST_SORT_FIELDS)[number];
export const DEFAULT_PAYMENT_REQUEST_SORT: SortSpec<PaymentRequestSortField> = { field: 'createdAt', dir: 'desc' };

const STATUSES = new Set<string>(PR_STATUSES);

export type PaymentRequestWhereResult =
  | { ok: true; where: Prisma.PaymentRequestWhereInput }
  | { ok: false; error: string };

/**
 * Filters:
 *   status              one of PR_STATUSES
 *   typeId              payment request type id
 *   startDate/endDate   YYYY-MM-DD on the request date (createdAt, business time zone)
 *   search              number, purpose, payee or requester name
 */
export function buildPaymentRequestWhere(
  query: Record<string, unknown>,
  scope: Prisma.PaymentRequestWhereInput,
): PaymentRequestWhereResult {
  const and: Prisma.PaymentRequestWhereInput[] = [scope];

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status pengajuan tidak dikenal.' };
    and.push({ status });
  }

  const typeId = firstString(query.typeId);
  if (typeId) and.push({ typeId });

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  if (startDate && endDate && startDate > endDate) {
    return { ok: false, error: 'Tanggal awal tidak boleh setelah tanggal akhir.' };
  }
  if (startDate || endDate) and.push({ createdAt: localDayRange(startDate, endDate) });

  const search = firstString(query.search);
  if (search) {
    const contains = { contains: search, mode: 'insensitive' as const };
    and.push({
      OR: [
        { number: contains },
        { purpose: contains },
        { payeeName: contains },
        { requester: { fullName: contains } },
      ],
    });
  }

  return { ok: true, where: and.length === 1 ? scope : { AND: and } };
}

export function paymentRequestOrderBy(
  sort: SortSpec<PaymentRequestSortField>,
): Prisma.PaymentRequestOrderByWithRelationInput[] {
  const dir = sort.dir;
  const primary: Prisma.PaymentRequestOrderByWithRelationInput =
    sort.field === 'requester'
      ? { requester: { fullName: dir } }
      : sort.field === 'neededBy'
        ? { neededBy: { sort: dir, nulls: 'last' } }
        : { [sort.field]: dir };
  return [primary, { number: 'desc' }];
}

export interface PaymentRequestSummary {
  count: number;
  totalAmount: number;
  byStatus: Record<string, { count: number; amount: number }>;
}

/** KPI counts/amounts per status for the rows matching the list filters. */
export function summarizePaymentRequests(
  groups: ReadonlyArray<{ status: string; _count: { _all: number }; _sum: { totalAmount: Decimal.Value | { toString(): string } | null } }>,
): PaymentRequestSummary {
  const byStatus: PaymentRequestSummary['byStatus'] = {};
  let count = 0;
  let total = new Decimal(0);
  for (const g of groups) {
    const amount = new Decimal(g._sum.totalAmount?.toString() ?? 0);
    byStatus[g.status] = { count: g._count._all, amount: amount.toNumber() };
    count += g._count._all;
    if (g.status !== 'CANCELLED' && g.status !== 'REJECTED') total = total.plus(amount);
  }
  return { count, totalAmount: total.toNumber(), byStatus };
}
