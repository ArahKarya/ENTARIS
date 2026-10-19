/**
 * Query building + aggregation for the purchase invoice list
 * (GET /api/purchase/invoices and GET /api/purchase/invoices/summary).
 * Both endpoints share `buildPurchaseInvoiceWhere`, so the KPI cards always
 * describe exactly the rows the list shows.
 */
import { InvoiceStatus, Prisma } from '@prisma/client';
import { firstString, parseDateParam, type SortSpec, localDayRange } from '../utils/listQuery';

export const PURCHASE_INVOICE_SORT_FIELDS = [
  'date',
  'dueDate',
  'invoiceNumber',
  'supplier',
  'grandTotal',
  'outstanding',
] as const;
export type PurchaseInvoiceSortField = (typeof PURCHASE_INVOICE_SORT_FIELDS)[number];
export const DEFAULT_PURCHASE_INVOICE_SORT: SortSpec<PurchaseInvoiceSortField> = { field: 'date', dir: 'desc' };

const STATUSES = new Set<string>(Object.values(InvoiceStatus));

export type PurchaseInvoiceWhereResult =
  | { ok: true; where: Prisma.PurchaseInvoiceWhereInput }
  | { ok: false; error: string };

export function buildPurchaseInvoiceWhere(query: Record<string, unknown>): PurchaseInvoiceWhereResult {
  const where: Prisma.PurchaseInvoiceWhereInput = {};

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status invoice tidak dikenal.' };
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
    where.date = { ...localDayRange(startDate, endDate) };
  }

  const search = firstString(query.search);
  if (search) {
    where.OR = [
      { invoiceNumber: { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  return { ok: true, where };
}

export function purchaseInvoiceOrderBy(
  sort: SortSpec<PurchaseInvoiceSortField>,
): Prisma.PurchaseInvoiceOrderByWithRelationInput[] {
  const { field, dir } = sort;
  const primary: Prisma.PurchaseInvoiceOrderByWithRelationInput =
    field === 'supplier'
      ? { supplier: { name: dir } }
      : field === 'dueDate'
        ? { dueDate: { sort: dir, nulls: 'last' } }
        : { [field]: dir };
  // Stable tie-breaker so rows never jump between pages.
  return field === 'invoiceNumber' ? [primary] : [primary, { invoiceNumber: dir }];
}

/** Same rule as the row indicator: past due date and still owing. */
export function purchaseOverdueWhere(now: Date): Prisma.PurchaseInvoiceWhereInput {
  return { dueDate: { lt: now }, outstanding: { gt: 0 } };
}

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export interface PurchaseStatusGroupRow {
  status: string;
  _count: { _all: number };
  _sum: { grandTotal: DecimalLike; outstanding: DecimalLike };
}

export interface PurchaseOverdueAggregate {
  _count: { _all: number };
  _sum: { outstanding: DecimalLike };
}

export interface PurchaseInvoiceSummary {
  /** Every invoice matching the filters, cancelled ones included. */
  count: number;
  /** Invoice value, excluding cancelled invoices. */
  grandTotal: number;
  /** Payable still open (cancelled invoices carry 0). */
  outstanding: number;
  paidCount: number;
  cancelledCount: number;
  overdueCount: number;
  overdueOutstanding: number;
  byStatus: Record<string, { count: number; grandTotal: number; outstanding: number }>;
}

const dec = (value: DecimalLike) => new Prisma.Decimal(value ?? 0);
const money = (d: Prisma.Decimal) => d.toDecimalPlaces(2).toNumber();

export function summarizePurchaseInvoices(
  groups: readonly PurchaseStatusGroupRow[],
  overdue: PurchaseOverdueAggregate,
): PurchaseInvoiceSummary {
  let grandTotal = new Prisma.Decimal(0);
  let outstanding = new Prisma.Decimal(0);
  let count = 0;
  const byStatus: PurchaseInvoiceSummary['byStatus'] = {};

  for (const g of groups) {
    const n = g._count._all;
    const gt = dec(g._sum.grandTotal);
    const os = dec(g._sum.outstanding);
    count += n;
    if (g.status !== InvoiceStatus.Cancelled) grandTotal = grandTotal.plus(gt);
    // Cancelling an invoice zeroes its outstanding, so every status can be summed.
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
