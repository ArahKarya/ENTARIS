/**
 * Query building for the stock transfer list (GET /api/stock-transfers).
 * Read-only: submit/cancel rules live in services/stockTransfer.ts.
 */
import { DocumentStatus, Prisma } from '@prisma/client';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

export const STOCK_TRANSFER_SORT_FIELDS = ['date', 'transferNumber'] as const;
export type StockTransferSortField = (typeof STOCK_TRANSFER_SORT_FIELDS)[number];
export const DEFAULT_STOCK_TRANSFER_SORT: SortSpec<StockTransferSortField> = { field: 'date', dir: 'desc' };

const STATUSES = new Set<string>(Object.values(DocumentStatus));

export type StockTransferWhereResult =
  | { ok: true; where: Prisma.StockTransferWhereInput }
  | { ok: false; error: string };

export function buildStockTransferWhere(query: Record<string, unknown>): StockTransferWhereResult {
  const where: Prisma.StockTransferWhereInput = {};
  const and: Prisma.StockTransferWhereInput[] = [];

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status transfer tidak dikenal.' };
    where.status = status as DocumentStatus;
  }

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) {
    return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  }
  if (startDate || endDate) {
    where.date = { ...localDayRange(startDate, endDate) };
  }

  // A warehouse matches as source or destination.
  const warehouseId = firstString(query.warehouseId);
  if (warehouseId) {
    and.push({ OR: [{ fromWarehouseId: warehouseId }, { toWarehouseId: warehouseId }] });
  }

  const search = firstString(query.search);
  if (search) {
    const contains = { contains: search, mode: 'insensitive' as const };
    and.push({
      OR: [
        { transferNumber: contains },
        { notes: contains },
        { nomorMobil: contains },
        { driverName: contains },
        { recipientName: contains },
        { fromWarehouse: { name: contains } },
        { toWarehouse: { name: contains } },
      ],
    });
  }

  if (and.length === 1) Object.assign(where, and[0]);
  else if (and.length > 1) where.AND = and;

  return { ok: true, where };
}

export function stockTransferOrderBy(
  sort: SortSpec<StockTransferSortField>,
): Prisma.StockTransferOrderByWithRelationInput[] {
  const { field, dir } = sort;
  const primary: Prisma.StockTransferOrderByWithRelationInput = { [field]: dir };
  // Stable tie-breaker so rows never jump between pages.
  return field === 'transferNumber' ? [primary] : [primary, { transferNumber: dir }];
}
