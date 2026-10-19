import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  DEFAULT_PRODUCTION_RUN_SORT,
  buildProductionRunWhere,
  productionRunOrderBy,
  summarizeProductionRuns,
} from '../productionRunList';

describe('buildProductionRunWhere', () => {
  it('combines status, machine, local-day dates and search over items', () => {
    const r = buildProductionRunWhere({ status: 'active', machineId: 'm1', startDate: '2026-10-04', search: 'PK' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const contains = { contains: 'PK', mode: 'insensitive' };
    expect(r.where).toEqual({
      isCancelled: false,
      machineId: 'm1',
      date: { gte: new Date('2026-10-03T17:00:00.000Z') },
      OR: [
        { runNumber: contains },
        { referenceNumber: contains },
        { notes: contains },
        { items: { some: { item: { OR: [{ name: contains }, { code: contains }] } } } },
      ],
    });
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildProductionRunWhere({ status: 'Cancelled' }).ok).toBe(false);
    expect(buildProductionRunWhere({ endDate: '2026-02-30x' }).ok).toBe(false);
  });
});

describe('productionRunOrderBy', () => {
  it('breaks ties on run number and keeps runs without yield last', () => {
    expect(productionRunOrderBy(DEFAULT_PRODUCTION_RUN_SORT)).toEqual([{ date: 'desc' }, { runNumber: 'desc' }]);
    expect(productionRunOrderBy({ field: 'yieldPct', dir: 'asc' })).toEqual([
      { yieldPct: { sort: 'asc', nulls: 'last' } },
      { runNumber: 'asc' },
    ]);
    expect(productionRunOrderBy({ field: 'runNumber', dir: 'asc' })).toEqual([{ runNumber: 'asc' }]);
  });
});

describe('summarizeProductionRuns', () => {
  it('sums lines of active runs and input-weights the run yields', () => {
    const line = (lineType: string, isByProduct: boolean, qty: string) => ({
      lineType,
      isByProduct,
      _sum: { quantity: new Prisma.Decimal(qty) },
    });
    expect(
      summarizeProductionRuns(
        [
          { isCancelled: false, _count: { _all: 3 } },
          { isCancelled: true, _count: { _all: 1 } },
        ],
        [line('Input', false, '1000'), line('Output', false, '625'), line('ByProduct', true, '200'), line('Output', true, '50')],
        [
          { yieldPct: new Prisma.Decimal('60'), inputQty: new Prisma.Decimal('600') },
          { yieldPct: '65', inputQty: '400' },
          { yieldPct: null, inputQty: '50' },
        ],
        ['Kg', 'Kg'],
      ),
    ).toEqual({
      count: 4,
      activeCount: 3,
      cancelledCount: 1,
      inputQty: 1000,
      outputQty: 875,
      byproductQty: 250,
      yieldPct: 62,
      unit: 'Kg',
    });
  });

  it('returns a null yield without input', () => {
    const empty = summarizeProductionRuns([], [], [], ['Kg', 'Ton']);
    expect(empty.yieldPct).toBeNull();
    expect(empty.unit).toBeNull();
  });
});
