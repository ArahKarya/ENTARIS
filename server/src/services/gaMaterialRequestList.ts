/**
 * GA material request list. Without `page` it returns the bare array (status/workOrderId/mine,
 * newest first); with `page` it returns `{ data, total, page, limit }`. /summary uses the same filters.
 */
import { Prisma } from '@prisma/client';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

export const MR_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'FULFILLED', 'PAID', 'CANCELLED'] as const;
export type MrStatus = (typeof MR_STATUSES)[number];

export const MR_SORT_FIELDS = ['code', 'requestedAt', 'status'] as const;
export type MrSortField = (typeof MR_SORT_FIELDS)[number];
export const DEFAULT_MR_SORT: SortSpec<MrSortField> = { field: 'requestedAt', dir: 'desc' };

export type MrWhereResult = { ok: true; where: Prisma.GaMaterialRequestWhereInput } | { ok: false; error: string };

const isStatus = (v: string): v is MrStatus => (MR_STATUSES as readonly string[]).includes(v);

/**
 * Filters for the paged list:
 *   status               DRAFT … CANCELLED (ignored with `ignoreStatus`, for per-status counts)
 *   workOrderId/assetId  exact match
 *   mine=true            requested by the current user
 *   startDate/endDate    request date (YYYY-MM-DD, business time zone)
 *   search               code, machine/target, asset, work order code or item name
 */
export function buildMaterialRequestWhere(
  query: Record<string, unknown>,
  ctx: { userId?: string; ignoreStatus?: boolean } = {},
): MrWhereResult {
  const and: Prisma.GaMaterialRequestWhereInput[] = [];

  const status = firstString(query.status);
  if (status && !ctx.ignoreStatus) {
    if (!isStatus(status)) return { ok: false, error: 'Status permintaan barang tidak dikenal.' };
    and.push({ status });
  }

  const workOrderId = firstString(query.workOrderId);
  if (workOrderId) and.push({ workOrderId });

  const assetId = firstString(query.assetId);
  if (assetId) and.push({ assetId });

  if (firstString(query.mine) === 'true' && ctx.userId) and.push({ requestedById: ctx.userId });

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  if (startDate || endDate) and.push({ requestedAt: { ...localDayRange(startDate, endDate) } });

  const search = firstString(query.search);
  if (search) {
    const contains = { contains: search, mode: 'insensitive' as const };
    and.push({
      OR: [
        { code: contains },
        { machineTarget: contains },
        { asset: { code: contains } },
        { asset: { name: contains } },
        { workOrder: { code: contains } },
        { items: { some: { itemName: contains } } },
      ],
    });
  }

  return { ok: true, where: and.length ? { AND: and } : {} };
}

/** Requested sort plus the code as a stable tie-breaker. */
export function materialRequestOrderBy(
  sort: SortSpec<MrSortField>,
): Prisma.GaMaterialRequestOrderByWithRelationInput[] {
  const { field, dir } = sort;
  if (field === 'code') return [{ code: dir }];
  return [{ [field]: dir }, { code: dir }];
}

/** `{ DRAFT: 0, … }` from a groupBy result, every status present. */
export function countByStatus(groups: ReadonlyArray<{ status: string; _count: { _all: number } }>): Record<MrStatus, number> {
  const out = Object.fromEntries(MR_STATUSES.map((s) => [s, 0])) as Record<MrStatus, number>;
  for (const g of groups) if (isStatus(g.status)) out[g.status] = g._count._all;
  return out;
}
