import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ITEM_SORT,
  filterByStockStatus,
  itemDbWhere,
  itemStockStatus,
  parseItemListFilters,
  sortItems,
  summarizeItems,
  usesListMode,
} from '../inventoryItemList';

const item = (code: string, currentStock: number | string, minimumStock: number | string, extra: Record<string, unknown> = {}) => ({
  code,
  name: `Item ${code}`,
  category: null as string | null,
  isActive: true,
  currentStock,
  minimumStock,
  averageCost: 0,
  ...extra,
});

describe('itemStockStatus', () => {
  it('classifies out / low / ok', () => {
    expect(itemStockStatus(0, 10)).toBe('out');
    expect(itemStockStatus('-1', 0)).toBe('out');
    expect(itemStockStatus(5, 10)).toBe('low');
    expect(itemStockStatus(10, 10)).toBe('ok');
    expect(itemStockStatus(5, 0)).toBe('ok');
  });
});

describe('parseItemListFilters', () => {
  it('parses the filters', () => {
    const r = parseItemListFilters({ isActive: 'false', stockStatus: 'low', search: ' gkp ', warehouseId: 'w1', category: 'Beras' });
    expect(r).toEqual({ ok: true, filters: { isActive: false, stockStatus: 'low', search: 'gkp', warehouseId: 'w1', category: 'Beras' } });
  });

  it('rejects invalid isActive and stockStatus', () => {
    expect(parseItemListFilters({ isActive: 'yes' }).ok).toBe(false);
    expect(parseItemListFilters({ stockStatus: 'empty' }).ok).toBe(false);
  });

  it('builds the DB where', () => {
    expect(itemDbWhere({ isActive: true, category: 'Beras', search: 'x' })).toEqual({
      isActive: true,
      category: 'Beras',
      OR: [
        { name: { contains: 'x', mode: 'insensitive' } },
        { code: { contains: 'x', mode: 'insensitive' } },
      ],
    });
  });
});

describe('usesListMode', () => {
  it('is off for legacy picker calls and on for list-page params', () => {
    expect(usesListMode({ limit: '500', isActive: 'true', warehouseId: 'w' })).toBe(false);
    expect(usesListMode({ page: '1' })).toBe(false);
    expect(usesListMode({ sort: '-currentStock' })).toBe(true);
    expect(usesListMode({ stockStatus: 'low' })).toBe(true);
    expect(usesListMode({ category: 'Beras' })).toBe(true);
  });
});

describe('sortItems', () => {
  const rows = [item('B', 5, 0), item('A', 5, 0), item('C', 9, 0, { averageCost: 1 })];

  it('defaults to stock descending with code as tie-breaker', () => {
    expect(sortItems(rows, DEFAULT_ITEM_SORT).map((r) => r.code)).toEqual(['C', 'A', 'B']);
  });

  it('sorts by code / stock value ascending and does not mutate', () => {
    expect(sortItems(rows, { field: 'code', dir: 'asc' }).map((r) => r.code)).toEqual(['A', 'B', 'C']);
    expect(sortItems(rows, { field: 'stockValue', dir: 'asc' }).map((r) => r.code)).toEqual(['A', 'B', 'C']);
    expect(rows.map((r) => r.code)).toEqual(['B', 'A', 'C']);
  });
});

describe('filterByStockStatus + summarizeItems', () => {
  const rows = [
    item('A', 0, 10),
    item('B', 3, 10, { averageCost: '100' }),
    item('C', '20', '10', { averageCost: '2.5', isActive: false }),
  ];

  it('filters by stock status', () => {
    expect(filterByStockStatus(rows, 'low').map((r) => r.code)).toEqual(['B']);
    expect(filterByStockStatus(rows).length).toBe(3);
  });

  it('summarizes counts, value and distinct categories', () => {
    expect(summarizeItems(rows, ['Beras', null, 'Bahan Baku', 'Beras', ''])).toEqual({
      count: 3,
      activeCount: 2,
      lowCount: 1,
      outCount: 1,
      stockValue: 350,
      categories: ['Bahan Baku', 'Beras'],
    });
  });
});
