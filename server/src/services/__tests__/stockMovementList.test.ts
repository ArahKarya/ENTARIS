import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_STOCK_MOVEMENT_SORT,
  buildStockMovementWhere,
  stockMovementOrderBy,
  summarizeStockMovements,
} from '../stockMovementList';

describe('buildStockMovementWhere', () => {
  it('combines item, warehouse, type, status, local-day dates and search', () => {
    const r = buildStockMovementWhere({
      itemId: 'i1',
      warehouseId: 'w1',
      movementType: 'In',
      status: 'cancelled',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      search: 'SM-1',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where).toEqual({
      itemId: 'i1',
      warehouseId: 'w1',
      movementType: 'In',
      isCancelled: true,
      date: { gte: new Date('2026-09-30T17:00:00.000Z'), lt: new Date('2026-10-31T17:00:00.000Z') },
      OR: [
        { movementNumber: { contains: 'SM-1', mode: 'insensitive' } },
        { referenceNumber: { contains: 'SM-1', mode: 'insensitive' } },
        { notes: { contains: 'SM-1', mode: 'insensitive' } },
        { item: { name: { contains: 'SM-1', mode: 'insensitive' } } },
        { item: { code: { contains: 'SM-1', mode: 'insensitive' } } },
      ],
    });
  });

  it('maps status active to non-cancelled', () => {
    const r = buildStockMovementWhere({ status: 'active' });
    expect(r.ok && r.where).toEqual({ isCancelled: false });
  });

  it('rejects unknown types, statuses and malformed dates', () => {
    expect(buildStockMovementWhere({ movementType: 'Masuk' }).ok).toBe(false);
    expect(buildStockMovementWhere({ status: 'Cancelled' }).ok).toBe(false);
    expect(buildStockMovementWhere({ startDate: '01-10-2026' }).ok).toBe(false);
  });
});

describe('stockMovementOrderBy', () => {
  it('uses movement number as tie-breaker', () => {
    expect(stockMovementOrderBy(DEFAULT_STOCK_MOVEMENT_SORT)).toEqual([{ date: 'desc' }, { movementNumber: 'desc' }]);
    expect(stockMovementOrderBy({ field: 'item', dir: 'asc' })).toEqual([{ item: { name: 'asc' } }, { movementNumber: 'asc' }]);
    expect(stockMovementOrderBy({ field: 'movementNumber', dir: 'asc' })).toEqual([{ movementNumber: 'asc' }]);
  });
});

describe('summarizeStockMovements', () => {
  const g = (movementType: any, isCancelled: boolean, count: number, qty: string, value: string) => ({
    movementType,
    isCancelled,
    _count: { _all: count },
    _sum: { quantity: new Prisma.Decimal(qty), totalValue: new Prisma.Decimal(value) },
  });

  it('splits inbound / outbound and excludes cancelled from totals', () => {
    expect(
      summarizeStockMovements([
        g('In', false, 2, '100', '1000.10'),
        g('TransferIn', false, 1, '5', '50'),
        g('AdjustmentOut', false, 1, '2.5', '25.25'),
        g('Out', false, 3, '30', '300'),
        g('In', true, 4, '999', '9999'),
      ]),
    ).toEqual({
      count: 11,
      cancelledCount: 4,
      inCount: 3,
      inQty: 105,
      inValue: 1050.1,
      outCount: 4,
      outQty: 32.5,
      outValue: 325.25,
    });
  });
});
