/**
 * Query building + aggregation for the sales order list
 * (GET /api/sales-orders and GET /api/sales-orders/summary).
 * Both endpoints share `buildSalesOrderWhere`, so the KPI cards always
 * describe exactly the rows the list shows.
 */
import { Prisma, SalesOrderStatus } from '@prisma/client';
import { firstString, parseDateParam, type SortSpec } from '../utils/listQuery';

export const SALES_ORDER_SORT_FIELDS = ['date', 'soNumber', 'customer', 'expectedDelivery', 'grandTotal'] as const;
export type SalesOrderSortField = (typeof SALES_ORDER_SORT_FIELDS)[number];
export const DEFAULT_SALES_ORDER_SORT: SortSpec<SalesOrderSortField> = { field: 'date', dir: 'desc' };

const STATUSES = new Set<string>(Object.values(SalesOrderStatus));

export type SalesOrderWhereResult =
  | { ok: true; where: Prisma.SalesOrderWhereInput }
  | { ok: false; error: string };

export function buildSalesOrderWhere(query: Record<string, unknown>): SalesOrderWhereResult {
  const where: Prisma.SalesOrderWhereInput = {};

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status pesanan tidak dikenal.' };
    where.status = status as SalesOrderStatus;
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
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
    };
  }

  const search = firstString(query.search);
  if (search) {
    where.OR = [
      { soNumber: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
      { customerRefNo: { contains: search, mode: 'insensitive' } },
    ];
  }

  return { ok: true, where };
}

export function salesOrderOrderBy(
  sort: SortSpec<SalesOrderSortField>,
): Prisma.SalesOrderOrderByWithRelationInput[] {
  const { field, dir } = sort;
  const primary: Prisma.SalesOrderOrderByWithRelationInput =
    field === 'customer'
      ? { customer: { name: dir } }
      : field === 'expectedDelivery'
        ? { expectedDelivery: { sort: dir, nulls: 'last' } }
        : { [field]: dir };
  // Stable tie-breaker so rows never jump between pages.
  return field === 'soNumber' ? [primary] : [primary, { soNumber: dir }];
}

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export interface SalesOrderStatusGroup {
  status: string;
  _count: { _all: number };
  _sum: { grandTotal: DecimalLike };
}

export interface SalesOrderSummary {
  /** Every order matching the filters, cancelled ones included. */
  count: number;
  /** Orders that are not cancelled. */
  activeCount: number;
  /** Value of the non-cancelled orders. */
  activeValue: number;
  draftCount: number;
  /** Confirmed, nothing delivered yet. */
  submittedCount: number;
  partiallyDeliveredCount: number;
  fullyDeliveredCount: number;
  cancelledCount: number;
  byStatus: Record<string, { count: number; grandTotal: number }>;
}

const money = (d: Prisma.Decimal) => d.toDecimalPlaces(2).toNumber();

export function summarizeSalesOrders(groups: readonly SalesOrderStatusGroup[]): SalesOrderSummary {
  let count = 0;
  let activeCount = 0;
  let activeValue = new Prisma.Decimal(0);
  const byStatus: SalesOrderSummary['byStatus'] = {};

  for (const g of groups) {
    const n = g._count._all;
    const value = new Prisma.Decimal(g._sum.grandTotal ?? 0);
    count += n;
    if (g.status !== SalesOrderStatus.Cancelled) {
      activeCount += n;
      activeValue = activeValue.plus(value);
    }
    byStatus[g.status] = { count: n, grandTotal: money(value) };
  }

  const countOf = (s: SalesOrderStatus) => byStatus[s]?.count ?? 0;
  return {
    count,
    activeCount,
    activeValue: money(activeValue),
    draftCount: countOf(SalesOrderStatus.Draft),
    submittedCount: countOf(SalesOrderStatus.Submitted),
    partiallyDeliveredCount: countOf(SalesOrderStatus.PartiallyDelivered),
    fullyDeliveredCount: countOf(SalesOrderStatus.FullyDelivered),
    cancelledCount: countOf(SalesOrderStatus.Cancelled),
    byStatus,
  };
}
