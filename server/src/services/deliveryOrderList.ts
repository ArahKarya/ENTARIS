/**
 * Delivery order list. "Invoiced" is derived (Submitted + invoiceId set), so the `status` filter
 * accepts Submitted (not invoiced yet), Invoiced, Cancelled and Draft.
 */
import { Prisma } from '@prisma/client';
import { firstString, parseDateParam, type SortSpec, localDayRange } from '../utils/listQuery';

export const DELIVERY_ORDER_SORT_FIELDS = ['date', 'doNumber', 'customer'] as const;
export type DeliveryOrderSortField = (typeof DELIVERY_ORDER_SORT_FIELDS)[number];
export const DEFAULT_DELIVERY_ORDER_SORT: SortSpec<DeliveryOrderSortField> = { field: 'date', dir: 'desc' };

export const DELIVERY_ORDER_STATUS_FILTERS = ['Submitted', 'Invoiced', 'Cancelled', 'Draft'] as const;

const STATUS_WHERE: Record<(typeof DELIVERY_ORDER_STATUS_FILTERS)[number], Prisma.DeliveryOrderWhereInput> = {
  Submitted: { status: 'Submitted', invoiceId: null },
  Invoiced: { status: 'Submitted', invoiceId: { not: null } },
  Cancelled: { status: 'Cancelled' },
  Draft: { status: 'Draft' },
};

export type DeliveryOrderWhereResult =
  | { ok: true; where: Prisma.DeliveryOrderWhereInput }
  | { ok: false; error: string };

export function buildDeliveryOrderWhere(query: Record<string, unknown>): DeliveryOrderWhereResult {
  let where: Prisma.DeliveryOrderWhereInput = {};

  const status = firstString(query.status);
  if (status) {
    if (!(DELIVERY_ORDER_STATUS_FILTERS as readonly string[]).includes(status)) {
      return { ok: false, error: 'Status surat jalan tidak dikenal.' };
    }
    where = { ...STATUS_WHERE[status as keyof typeof STATUS_WHERE] };
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
      { doNumber: { contains: search, mode: 'insensitive' } },
      { customer: { name: { contains: search, mode: 'insensitive' } } },
      { nomorMobil: { contains: search, mode: 'insensitive' } },
      // Cari lewat No. SO atau No. PO pelanggan dari Pesanan asal.
      { salesOrder: { soNumber: { contains: search, mode: 'insensitive' } } },
      { salesOrder: { customerRefNo: { contains: search, mode: 'insensitive' } } },
    ];
  }

  return { ok: true, where };
}

export function deliveryOrderOrderBy(
  sort: SortSpec<DeliveryOrderSortField>,
): Prisma.DeliveryOrderOrderByWithRelationInput[] {
  const { field, dir } = sort;
  const primary: Prisma.DeliveryOrderOrderByWithRelationInput =
    field === 'customer' ? { customer: { name: dir } } : { [field]: dir };
  // Stable tie-breaker so rows never jump between pages.
  return field === 'doNumber' ? [primary] : [primary, { doNumber: dir }];
}
