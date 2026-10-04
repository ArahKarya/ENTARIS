import { describe, it, expect } from 'vitest';
import type { Prisma } from '@prisma/client';
import {
  buildStockTransferWhere,
  DEFAULT_STOCK_TRANSFER_SORT,
  STOCK_TRANSFER_SORT_FIELDS,
  stockTransferOrderBy,
} from '../stockTransferList';
import { parseSort } from '../../utils/listQuery';

describe('buildStockTransferWhere', () => {
  it('returns an empty filter for an empty query (legacy callers)', () => {
    expect(buildStockTransferWhere({})).toEqual({ ok: true, where: {} });
  });

  it('keeps the legacy status filter and adds a local-day date range', () => {
    expect(buildStockTransferWhere({ status: 'Cancelled' })).toEqual({ ok: true, where: { status: 'Cancelled' } });
    const r = buildStockTransferWhere({ startDate: '2026-10-03' });
    expect(r.ok && r.where.date).toEqual({ gte: new Date('2026-10-02T17:00:00.000Z') });
  });

  it('matches a warehouse as source or destination', () => {
    const r = buildStockTransferWhere({ warehouseId: 'w1' });
    expect(r.ok && r.where.OR).toEqual([{ fromWarehouseId: 'w1' }, { toWarehouseId: 'w1' }]);
  });

  it('searches number, delivery fields and warehouse names; combines with warehouse via AND', () => {
    const r = buildStockTransferWhere({ search: 'joko', warehouseId: 'w1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const and = r.where.AND as Prisma.StockTransferWhereInput[];
    expect(and).toHaveLength(2);
    const c = { contains: 'joko', mode: 'insensitive' };
    expect(and[1].OR).toEqual([
      { transferNumber: c },
      { notes: c },
      { nomorMobil: c },
      { driverName: c },
      { recipientName: c },
      { fromWarehouse: { name: c } },
      { toWarehouse: { name: c } },
    ]);
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildStockTransferWhere({ status: 'Paid' }).ok).toBe(false);
    expect(buildStockTransferWhere({ startDate: '2026-13-01' }).ok).toBe(false);
  });
});

describe('stockTransferOrderBy', () => {
  it('defaults to newest date with the transfer number as tie-breaker', () => {
    expect(stockTransferOrderBy(DEFAULT_STOCK_TRANSFER_SORT)).toEqual([
      { date: 'desc' },
      { transferNumber: 'desc' },
    ]);
    expect(stockTransferOrderBy({ field: 'transferNumber', dir: 'asc' })).toEqual([{ transferNumber: 'asc' }]);
  });

  it('ignores sort fields outside the whitelist', () => {
    expect(parseSort('fromWarehouse', STOCK_TRANSFER_SORT_FIELDS, DEFAULT_STOCK_TRANSFER_SORT)).toEqual(
      DEFAULT_STOCK_TRANSFER_SORT,
    );
  });
});
