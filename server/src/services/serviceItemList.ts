/**
 * Query building for the service item (layanan/jasa) list, GET /api/service-items.
 *
 * The endpoint historically returned `{ data }` with every row (pickers in the
 * sales/quotation modals rely on it). The paged mode — `{ data, total, page,
 * limit }` with whitelisted sort — applies only when `page` is sent.
 */
import { Prisma } from '@prisma/client';
import { firstString, type SortSpec } from '../utils/listQuery';

export const SERVICE_ITEM_SORT_FIELDS = ['code', 'name', 'defaultRate'] as const;
export type ServiceItemSortField = (typeof SERVICE_ITEM_SORT_FIELDS)[number];
export const DEFAULT_SERVICE_ITEM_SORT: SortSpec<ServiceItemSortField> = { field: 'code', dir: 'asc' };

export type ServiceItemWhereResult =
  | { ok: true; where: Prisma.ServiceItemWhereInput }
  | { ok: false; error: string };

export function buildServiceItemWhere(query: Record<string, unknown>): ServiceItemWhereResult {
  const where: Prisma.ServiceItemWhereInput = {};

  const isActive = firstString(query.isActive);
  if (isActive !== undefined) {
    if (isActive !== 'true' && isActive !== 'false') {
      return { ok: false, error: 'Filter isActive harus true atau false.' };
    }
    where.isActive = isActive === 'true';
  }

  const search = firstString(query.search);
  if (search) {
    where.OR = [
      { code: { contains: search, mode: 'insensitive' } },
      { name: { contains: search, mode: 'insensitive' } },
    ];
  }

  return { ok: true, where };
}

export function serviceItemOrderBy(
  sort: SortSpec<ServiceItemSortField>,
): Prisma.ServiceItemOrderByWithRelationInput[] {
  const { field, dir } = sort;
  if (field === 'code') return [{ code: dir }];
  const primary: Prisma.ServiceItemOrderByWithRelationInput =
    field === 'defaultRate' ? { defaultRate: { sort: dir, nulls: 'last' } } : { [field]: dir };
  return [primary, { code: 'asc' }];
}
