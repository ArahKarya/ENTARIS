/**
 * Query building + aggregation for the sales invoice list
 * (GET /api/sales/invoices and GET /api/sales/invoices/summary).
 * Both endpoints share `buildSalesInvoiceWhere`, so the KPI cards always
 * describe exactly the rows the list shows.
 */
import { InvoiceStatus, Prisma } from '@prisma/client';
import { firstString, parseDateParam, type SortSpec } from '../utils/listQuery';

export const SALES_INVOICE_SORT_FIELDS = [
  'date',
  'dueDate',
  'invoiceNumber',
  'customer',
  'grandTotal',
  'outstanding',
] as const;
export type SalesInvoiceSortField = (typeof SALES_INVOICE_SORT_FIELDS)[number];
export const DEFAULT_SALES_INVOICE_SORT: SortSpec<SalesInvoiceSortField> = { field: 'date', dir: 'desc' };

const STATUSES = new Set<string>(Object.values(InvoiceStatus));

export type WhereResult =
  | { ok: true; where: Prisma.SalesInvoiceWhereInput }
  | { ok: false; error: string };

export function buildSalesInvoiceWhere(query: Record<string, unknown>): WhereResult {
  const where: Prisma.SalesInvoiceWhereInput = {};

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status faktur tidak dikenal.' };
    where.status = status as InvoiceStatus;
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
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  return { ok: true, where };
}

export function salesInvoiceOrderBy(
  sort: SortSpec<SalesInvoiceSortField>,
): Prisma.SalesInvoiceOrderByWithRelationInput[] {
  const { field, dir } = sort;
  const primary: Prisma.SalesInvoiceOrderByWithRelationInput =
    field === 'customer'
      ? { customer: { name: dir } }
      : field === 'dueDate'
        ? { dueDate: { sort: dir, nulls: 'last' } }
        : { [field]: dir };
  // Stable tie-breaker so rows never jump between pages.
  return field === 'invoiceNumber' ? [primary] : [primary, { invoiceNumber: dir }];
}

/** Same rule as the row indicator: past due date and still owing. */
export function overdueWhere(now: Date): Prisma.SalesInvoiceWhereInput {
  return { dueDate: { lt: now }, outstanding: { gt: 0 } };
}

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export interface StatusGroupRow {
  status: string;
  _count: { _all: number };
  _sum: { grandTotal: DecimalLike; outstanding: DecimalLike };
}

export interface OverdueAggregate {
  _count: { _all: number };
  _sum: { outstanding: DecimalLike };
}

export interface SalesInvoiceSummary {
  /** Every invoice matching the filters, cancelled ones included. */
  count: number;
  /** Invoice value, excluding cancelled invoices. */
  grandTotal: number;
  /** Receivable still open (cancelled invoices carry 0). */
  outstanding: number;
  paidCount: number;
  cancelledCount: number;
  overdueCount: number;
  overdueOutstanding: number;
  byStatus: Record<string, { count: number; grandTotal: number; outstanding: number }>;
}

function dec(value: DecimalLike): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0);
}

const money = (d: Prisma.Decimal) => d.toDecimalPlaces(2).toNumber();

export function summarizeSalesInvoices(
  groups: readonly StatusGroupRow[],
  overdue: OverdueAggregate,
): SalesInvoiceSummary {
  let grandTotal = new Prisma.Decimal(0);
  let outstanding = new Prisma.Decimal(0);
  let count = 0;
  const byStatus: SalesInvoiceSummary['byStatus'] = {};

  for (const g of groups) {
    const n = g._count._all;
    const gt = dec(g._sum.grandTotal);
    const os = dec(g._sum.outstanding);
    count += n;
    if (g.status !== InvoiceStatus.Cancelled) grandTotal = grandTotal.plus(gt);
    outstanding = outstanding.plus(os);
    byStatus[g.status] = { count: n, grandTotal: money(gt), outstanding: money(os) };
  }

  return {
    count,
    grandTotal: money(grandTotal),
    outstanding: money(outstanding),
    paidCount: byStatus[InvoiceStatus.Paid]?.count ?? 0,
    cancelledCount: byStatus[InvoiceStatus.Cancelled]?.count ?? 0,
    overdueCount: overdue._count._all,
    overdueOutstanding: money(dec(overdue._sum.outstanding)),
    byStatus,
  };
}
