/**
 * Query building for the purchase order list, GET /api/purchase-orders.
 *
 * Filters: status (DocumentStatus), partyId, startDate/endDate (YYYY-MM-DD,
 * business-time-zone calendar days), search (PO number / supplier name).
 * receipt (unreceived|partial|full|closed) — derived from items' qtyReceived
 * vs quantity, always on open (Submitted, not closed) POs except "closed";
 * open=1 → Submitted and not short-closed (STT modal PO picker).
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

export const PURCHASE_ORDER_RECEIPT_FILTERS = ['unreceived', 'partial', 'full', 'closed'] as const;
export type PurchaseOrderReceiptFilter = (typeof PURCHASE_ORDER_RECEIPT_FILTERS)[number];

/** Column reference to purchase_order_items.quantity (prisma.purchaseOrderItem.fields.quantity). */
export interface PurchaseOrderFieldRefs {
  itemQuantity: Prisma.FieldRef<'PurchaseOrderItem', 'Decimal'>;
}

const OPEN_PO: Prisma.PurchaseOrderWhereInput = { status: 'Submitted', closedAt: null };

function receiptWhere(
  filter: PurchaseOrderReceiptFilter,
  refs: PurchaseOrderFieldRefs,
): Prisma.PurchaseOrderWhereInput {
  switch (filter) {
    case 'closed':
      return { status: 'Submitted', closedAt: { not: null } };
    case 'unreceived':
      return { ...OPEN_PO, items: { every: { qtyReceived: { lte: 0 } } } };
    case 'full':
      return {
        ...OPEN_PO,
        AND: [
          { items: { some: {} } },
          { items: { every: { qtyReceived: { gte: refs.itemQuantity } } } },
        ],
      };
    case 'partial':
      return {
        ...OPEN_PO,
        AND: [
          { items: { some: { qtyReceived: { gt: 0 } } } },
          { items: { some: { qtyReceived: { lt: refs.itemQuantity } } } },
        ],
      };
  }
}

export function buildPurchaseOrderWhere(
  query: Record<string, unknown>,
  refs?: PurchaseOrderFieldRefs,
): PurchaseOrderWhereResult {
  const where: Prisma.PurchaseOrderWhereInput = {};
  const and: Prisma.PurchaseOrderWhereInput[] = [];

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

  const receipt = firstString(query.receipt);
  if (receipt) {
    if (!(PURCHASE_ORDER_RECEIPT_FILTERS as readonly string[]).includes(receipt)) {
      return { ok: false, error: 'Filter penerimaan PO tidak dikenal.' };
    }
    if (!refs && receipt !== 'unreceived' && receipt !== 'closed') {
      return { ok: false, error: 'Filter penerimaan PO tidak tersedia.' };
    }
    and.push(receiptWhere(receipt as PurchaseOrderReceiptFilter, refs as PurchaseOrderFieldRefs));
  }

  const open = firstString(query.open);
  if (open === '1' || open === 'true') and.push(OPEN_PO);

  if (and.length > 0) where.AND = and;
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
