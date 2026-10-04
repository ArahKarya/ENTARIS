import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import {
  buildGaItemFilter,
  buildGaMovementWhere,
  DEFAULT_GA_ITEM_SORT,
  filterGaItems,
  gaMovementOrderBy,
  gaStockState,
  sortGaItems,
  summarizeGaItems,
  toGaItemRow,
  type GaItemSource,
} from '../gaInventoryList';

const src = (over: Partial<GaItemSource> = {}): GaItemSource => ({
  id: 'i1',
  sku: 'ATK-001',
  name: 'Kertas A4',
  uom: 'rim',
  minStock: new Prisma.Decimal('10'),
  imagePath: null,
  isActive: true,
  category: { code: 'ATK', name: 'Alat Tulis', type: 'CONSUMABLE' },
  stocks: [],
  ...over,
});

const stock = (quantity: string, locationId = 'L1') => ({ quantity: new Prisma.Decimal(quantity), locationId });

describe('gaStockState', () => {
  it('flags out at or below zero, low under the minimum, ok otherwise', () => {
    expect(gaStockState(new Decimal(0), new Decimal(5))).toBe('out');
    expect(gaStockState(new Decimal(-1), new Decimal(0))).toBe('out');
    expect(gaStockState(new Decimal(0), new Decimal(0))).toBe('out');
    expect(gaStockState(new Decimal(4), new Decimal(5))).toBe('low');
    expect(gaStockState(new Decimal(5), new Decimal(5))).toBe('ok');
    expect(gaStockState(new Decimal(1), new Decimal(0))).toBe('ok');
  });
});

describe('toGaItemRow', () => {
  it('keeps the legacy row keys and order', () => {
    const { row, stockState } = toGaItemRow(src({ stocks: [stock('3'), stock('4.5', 'L2')] }));
    expect(Object.keys(row)).toEqual([
      'id',
      'sku',
      'name',
      'uom',
      'minStock',
      'imagePath',
      'isActive',
      'category',
      'totalStock',
      'lowStock',
    ]);
    expect(row.totalStock).toBe(7.5);
    expect(row.lowStock).toBe(true);
    expect(stockState).toBe('low');
  });

  it('adds locationStock only when a location is requested', () => {
    const it1 = src({ stocks: [stock('3', 'L1'), stock('8', 'L2')] });
    expect(toGaItemRow(it1).row).not.toHaveProperty('locationStock');
    expect(toGaItemRow(it1, 'L2').row.locationStock).toBe(8);
    expect(toGaItemRow(it1, 'L9').row.locationStock).toBe(0);
  });
});

describe('buildGaItemFilter', () => {
  it('keeps the legacy where shape for a single filter', () => {
    const r = buildGaItemFilter({ categoryId: 'c1' });
    expect(r).toMatchObject({ ok: true, where: { categoryId: 'c1' } });
    expect(buildGaItemFilter({})).toMatchObject({ ok: true, where: {} });
  });

  it('accepts search or the legacy q param', () => {
    const viaSearch = buildGaItemFilter({ search: 'kertas' });
    const viaQ = buildGaItemFilter({ q: 'kertas' });
    expect(viaSearch.ok && viaSearch.where).toEqual(viaQ.ok && viaQ.where);
    expect(JSON.stringify(viaSearch)).toContain('kertas');
  });

  it('combines filters and exposes location + stock state', () => {
    const r = buildGaItemFilter({ categoryId: 'c1', locationId: 'L1', isActive: 'false', stockStatus: 'low' });
    if (!r.ok) throw new Error('expected ok');
    expect(r.where).toEqual({
      AND: [{ categoryId: 'c1' }, { isActive: false }, { stocks: { some: { locationId: 'L1' } } }],
    });
    expect(r.locationId).toBe('L1');
    expect(r.stockStatus).toBe('low');
  });

  it('rejects unknown stock states and active flags', () => {
    expect(buildGaItemFilter({ stockStatus: 'empty' }).ok).toBe(false);
    expect(buildGaItemFilter({ isActive: 'yes' }).ok).toBe(false);
  });
});

describe('sort, filter and summarize items', () => {
  const items = [
    toGaItemRow(src({ id: 'a', sku: 'A-1', name: 'Zeta', stocks: [stock('20')] })),
    toGaItemRow(src({ id: 'b', sku: 'A-2', name: 'alpha', stocks: [stock('2')] })),
    toGaItemRow(src({ id: 'c', sku: 'B-1', name: 'Beta', stocks: [], isActive: false })),
  ];

  it('keeps database order for the default SKU sort and reverses it for desc', () => {
    expect(sortGaItems(items, DEFAULT_GA_ITEM_SORT).map((i) => i.row.id)).toEqual(['a', 'b', 'c']);
    expect(sortGaItems(items, { field: 'sku', dir: 'desc' }).map((i) => i.row.id)).toEqual(['c', 'b', 'a']);
  });

  it('sorts by name (case-insensitive) and by stock', () => {
    expect(sortGaItems(items, { field: 'name', dir: 'asc' }).map((i) => i.row.id)).toEqual(['b', 'c', 'a']);
    expect(sortGaItems(items, { field: 'totalStock', dir: 'desc' }).map((i) => i.row.id)).toEqual(['a', 'b', 'c']);
  });

  it('filters on stock state and counts KPIs', () => {
    expect(filterGaItems(items, 'out').map((i) => i.row.id)).toEqual(['c']);
    expect(filterGaItems(items).length).toBe(3);
    expect(summarizeGaItems(items)).toEqual({ count: 3, activeCount: 2, okCount: 1, lowCount: 1, outCount: 1 });
  });
});

describe('buildGaMovementWhere', () => {
  it('builds type, location, date and search filters', () => {
    const r = buildGaMovementWhere({
      type: 'OUT',
      locationId: 'L1',
      startDate: '2026-10-01',
      endDate: '2026-10-04',
      search: 'lampu',
    });
    if (!r.ok) throw new Error('expected ok');
    const and = (r.where as { AND: Prisma.GaInventoryMovementWhereInput[] }).AND;
    expect(and[0]).toEqual({ type: 'OUT' });
    expect(and[1]).toEqual({ OR: [{ fromLocationId: 'L1' }, { toLocationId: 'L1' }] });
    // Business-day range: [Oct 1 00:00 WIB, Oct 5 00:00 WIB).
    expect(and[2]).toEqual({
      createdAt: { gte: new Date('2026-10-01T00:00:00.000+07:00'), lt: new Date('2026-10-05T00:00:00.000+07:00') },
    });
    expect(JSON.stringify(and[3])).toContain('lampu');
  });

  it('returns an empty where without filters and rejects bad input', () => {
    expect(buildGaMovementWhere({})).toEqual({ ok: true, where: {} });
    expect(buildGaMovementWhere({ type: 'SCRAP' }).ok).toBe(false);
    expect(buildGaMovementWhere({ startDate: '04-10-2026' }).ok).toBe(false);
  });

  it('orders by date by default and by quantity on request', () => {
    expect(gaMovementOrderBy({ field: 'createdAt', dir: 'desc' })[0]).toEqual({ createdAt: 'desc' });
    expect(gaMovementOrderBy({ field: 'quantity', dir: 'asc' })[0]).toEqual({ quantity: 'asc' });
  });
});
