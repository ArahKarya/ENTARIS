/**
 * Query building for the fixed asset register, GET /api/fixed-assets.
 *
 * The endpoint historically returned a bare array with every asset (optional
 * exact `status` / `category` filters, newest first). That legacy mode is kept
 * byte-for-byte; the paged mode — `{ data, total, page, limit }` with search,
 * acquisition-date range and a whitelisted sort — applies only when `page` is
 * sent (same convention as services/serviceItemList).
 *
 * Read-only: nothing here touches depreciation schedules or GL entries.
 */
import { Prisma } from '@prisma/client';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

/** Stored statuses (plain strings, see prisma/schema.prisma + POST /:id/dispose). */
export const FIXED_ASSET_STATUSES = ['Active', 'Disposed'] as const;

export const FIXED_ASSET_SORT_FIELDS = [
  'createdAt',
  'assetNumber',
  'name',
  'category',
  'acquisitionDate',
  'acquisitionCost',
  'accumulatedDepreciation',
  'bookValue',
] as const;
export type FixedAssetSortField = (typeof FIXED_ASSET_SORT_FIELDS)[number];
/** Same order as the legacy list (newest record first). */
export const DEFAULT_FIXED_ASSET_SORT: SortSpec<FixedAssetSortField> = { field: 'createdAt', dir: 'desc' };

const STATUSES = new Set<string>(FIXED_ASSET_STATUSES);

export type FixedAssetWhereResult =
  | { ok: true; where: Prisma.FixedAssetWhereInput }
  | { ok: false; error: string };

/**
 * Filters for the paged register:
 *   status               Active | Disposed
 *   category             exact category name
 *   startDate/endDate    acquisition date (YYYY-MM-DD, business time zone)
 *   search               asset number, name or category (case-insensitive)
 */
export function buildFixedAssetWhere(query: Record<string, unknown>): FixedAssetWhereResult {
  const and: Prisma.FixedAssetWhereInput[] = [];

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status aset tidak dikenal.' };
    and.push({ status });
  }

  const category = firstString(query.category);
  if (category) and.push({ category });

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) {
    return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  }
  if (startDate || endDate) {
    and.push({ acquisitionDate: { ...localDayRange(startDate, endDate) } });
  }

  const search = firstString(query.search);
  if (search) {
    and.push({
      OR: [
        { assetNumber: { contains: search, mode: 'insensitive' } },
        { name: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  return { ok: true, where: and.length ? { AND: and } : {} };
}

/** Primary sort plus the asset number as a stable tie-breaker (rows never jump pages). */
export function fixedAssetOrderBy(
  sort: SortSpec<FixedAssetSortField>,
): Prisma.FixedAssetOrderByWithRelationInput[] {
  const { field, dir } = sort;
  if (field === 'assetNumber') return [{ assetNumber: dir }];
  return [{ [field]: dir }, { assetNumber: dir }];
}
