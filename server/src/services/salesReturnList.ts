/**
 * Query building for the sales return list (GET /api/sales-returns).
 * Pure helpers so filter/sort parsing is unit-tested without a database.
 */
import { Prisma } from '@prisma/client';
import { firstString, parseDateParam, type SortSpec, localDayRange } from '../utils/listQuery';

/** SalesReturn.status is a plain string; these are the values the services write. */
export const SALES_RETURN_STATUSES = ['Draft', 'Submitted', 'Cancelled'] as const;

export const SALES_RETURN_SORT_FIELDS = ['date', 'returnNumber', 'customer', 'totalReturn'] as const;
export type SalesReturnSortField = (typeof SALES_RETURN_SORT_FIELDS)[number];
export const DEFAULT_SALES_RETURN_SORT: SortSpec<SalesReturnSortField> = { field: 'date', dir: 'desc' };

const STATUSES = new Set<string>(SALES_RETURN_STATUSES);

export type SalesReturnWhereResult =
  | { ok: true; where: Prisma.SalesReturnWhereInput }
  | { ok: false; error: string };

/**
 * Filters: status, partyId, salesInvoiceId, startDate/endDate (YYYY-MM-DD),
 * search (return number / customer name / invoice number).
 */
export function buildSalesReturnWhere(query: Record<string, unknown>): SalesReturnWhereResult {
  const where: Prisma.SalesReturnWhereInput = {};

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status retur tidak dikenal.' };
    where.status = status;
  }

  const partyId = firstString(query.partyId);
  if (partyId) where.partyId = partyId;

  const salesInvoiceId = firstString(query.salesInvoiceId);
  if (salesInvoiceId) where.salesInvoiceId = salesInvoiceId;

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
      { returnNumber: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
      { salesInvoice: { invoiceNumber: { contains: search, mode: 'insensitive' } } },
    ];
  }

  return { ok: true, where };
}

export function salesReturnOrderBy(
  sort: SortSpec<SalesReturnSortField>,
): Prisma.SalesReturnOrderByWithRelationInput[] {
  const { field, dir } = sort;
  const primary: Prisma.SalesReturnOrderByWithRelationInput =
    field === 'customer' ? { customer: { name: dir } } : { [field]: dir };
  // Stable tie-breaker so rows never jump between pages.
  return field === 'returnNumber' ? [primary] : [primary, { returnNumber: dir }];
}
