/**
 * Query building for the purchase order list, GET /api/purchase-orders.
 *
 * Filters: status (DocumentStatus), partyId, startDate/endDate (YYYY-MM-DD,
 * business-time-zone calendar days), search (PO number / supplier name).
 * Sort: whitelisted field, always with the PO number as tie-breaker.
 */
import { DocumentStatus, Prisma } from '@prisma/client';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

export const PURCHASE_ORDER_SORT_FIELDS = [
  'date',
  'poNumber',
  'supplier',
  'expectedDeliveryDate',
  'totalEstimated',
] as const;
export type PurchaseOrderSortField = (typeof PURCHASE_ORDER_SORT_FIELDS)[number];
export const DEFAULT_PURCHASE_ORDER_SORT: SortSpec<PurchaseOrderSortField> = { field: 'date', dir: 'desc' };

const STATUSES = new Set<string>(Object.values(DocumentStatus));

export type PurchaseOrderWhereResult =
  | { ok: true; where: Prisma.PurchaseOrderWhereInput }
  | { ok: false; error: string };

export function buildPurchaseOrderWhere(query: Record<string, unknown>): PurchaseOrderWhereResult {
  const where: Prisma.PurchaseOrderWhereInput = {};

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status PO tidak dikenal.' };
    where.status = status as DocumentStatus;
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
      { poNumber: { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  return { ok: true, where };
}

export function purchaseOrderOrderBy(
  sort: SortSpec<PurchaseOrderSortField>,
): Prisma.PurchaseOrderOrderByWithRelationInput[] {
  const { field, dir } = sort;
  const primary: Prisma.PurchaseOrderOrderByWithRelationInput =
    field === 'supplier'
      ? { supplier: { name: dir } }
      : field === 'expectedDeliveryDate'
        ? { expectedDeliveryDate: { sort: dir, nulls: 'last' } }
        : { [field]: dir };
  // Stable tie-breaker so rows never jump between pages.
  return field === 'poNumber' ? [primary] : [primary, { poNumber: dir }];
}
