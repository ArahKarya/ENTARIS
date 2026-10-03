/**
 * Query building for the goods receipt (STT/BPB) list, GET /api/goods-receipts.
 *
 * DocumentStatus is Draft/Submitted/Cancelled; billing state is derived from
 * the purchase-invoice link. The `status` filter accepts:
 *   Uninvoiced    → posted, not billed yet, own stock (needs a PI)
 *   Invoiced      → posted and already folded into a purchase invoice
 *   CustomerOwned → posted customer-owned goods (titipan; never invoiced)
 *   Cancelled, Draft
 *   Submitted     → posted and not billed, titipan included (older callers)
 *
 * Legacy backfill STTs are hidden unless `includeLegacy=true`.
 */
import { Prisma } from '@prisma/client';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

export const GOODS_RECEIPT_SORT_FIELDS = ['date', 'sttNumber', 'supplier'] as const;
export type GoodsReceiptSortField = (typeof GOODS_RECEIPT_SORT_FIELDS)[number];
export const DEFAULT_GOODS_RECEIPT_SORT: SortSpec<GoodsReceiptSortField> = { field: 'date', dir: 'desc' };

export const GOODS_RECEIPT_STATUS_FILTERS = [
  'Uninvoiced',
  'Invoiced',
  'CustomerOwned',
  'Cancelled',
  'Draft',
  'Submitted',
] as const;
export type GoodsReceiptStatusFilter = (typeof GOODS_RECEIPT_STATUS_FILTERS)[number];

const STATUS_WHERE: Record<GoodsReceiptStatusFilter, Prisma.GoodsReceiptWhereInput> = {
  Uninvoiced: { status: 'Submitted', invoiceId: null, isCustomerOwned: false },
  Invoiced: { status: 'Submitted', invoiceId: { not: null } },
  CustomerOwned: { status: 'Submitted', isCustomerOwned: true },
  Cancelled: { status: 'Cancelled' },
  Draft: { status: 'Draft' },
  Submitted: { status: 'Submitted', invoiceId: null },
};

export type GoodsReceiptWhereResult =
  | { ok: true; where: Prisma.GoodsReceiptWhereInput }
  | { ok: false; error: string };

export function buildGoodsReceiptWhere(query: Record<string, unknown>): GoodsReceiptWhereResult {
  let where: Prisma.GoodsReceiptWhereInput = {};

  const status = firstString(query.status);
  if (status) {
    if (!(GOODS_RECEIPT_STATUS_FILTERS as readonly string[]).includes(status)) {
      return { ok: false, error: 'Status STT tidak dikenal.' };
    }
    where = { ...STATUS_WHERE[status as GoodsReceiptStatusFilter] };
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
      { sttNumber: { contains: search, mode: 'insensitive' } },
      { supplier: { name: { contains: search, mode: 'insensitive' } } },
      { nomorMobil: { contains: search, mode: 'insensitive' } },
      { purchaseOrder: { poNumber: { contains: search, mode: 'insensitive' } } },
    ];
  }

  // Legacy backfill STTs clutter the list; real STTs only unless asked.
  if (firstString(query.includeLegacy) !== 'true') where.isLegacyBackfill = false;

  return { ok: true, where };
}

export function goodsReceiptOrderBy(
  sort: SortSpec<GoodsReceiptSortField>,
): Prisma.GoodsReceiptOrderByWithRelationInput[] {
  const { field, dir } = sort;
  const primary: Prisma.GoodsReceiptOrderByWithRelationInput =
    field === 'supplier' ? { supplier: { name: dir } } : { [field]: dir };
  // Stable tie-breaker so rows never jump between pages.
  return field === 'sttNumber' ? [primary] : [primary, { sttNumber: dir }];
}
