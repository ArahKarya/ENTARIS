import { describe, it, expect } from 'vitest';
import {
  NONE_GROUP_KEY,
  OTHER_GROUP_KEY,
  parseStockValueGroupBy,
  summarizeStockValue,
} from '../inventoryDashboard';

describe('parseStockValueGroupBy', () => {
  it('defaults to category and accepts the whitelisted values', () => {
    expect(parseStockValueGroupBy(undefined)).toBe('category');
    expect(parseStockValueGroupBy('')).toBe('category');
    expect(parseStockValueGroupBy('category')).toBe('category');
    expect(parseStockValueGroupBy('warehouse')).toBe('warehouse');
    expect(parseStockValueGroupBy(['warehouse', 'category'])).toBe('warehouse');
  });

  it('rejects unknown values', () => {
    expect(parseStockValueGroupBy('item')).toBeNull();
    expect(parseStockValueGroupBy('Category')).toBeNull();
  });
});

describe('summarizeStockValue', () => {
  it('groups qty × unit cost by key, sorted by value desc, with shares', () => {
    const res = summarizeStockValue(
      [
        { key: 'Beras', quantity: '100', unitCost: '12000' },
        { key: 'Beras', quantity: 50, unitCost: 10000 },
        { key: 'Gabah', quantity: 1000, unitCost: 5000 },
        { key: 'Kemasan', quantity: 0, unitCost: 2500 },
      ],
      'category',
    );
    expect(res.total).toBe(6_700_000);
    expect(res.groups.map((g) => g.key)).toEqual(['Gabah', 'Beras', 'Kemasan']);
    expect(res.groups[0]).toMatchObject({ value: 5_000_000, itemCount: 1, share: 0.7463 });
    expect(res.groups[1]).toMatchObject({ value: 1_700_000, itemCount: 2 });
    // Zero stock: counted as a group with no positions and no value.
    expect(res.groups[2]).toMatchObject({ value: 0, itemCount: 0, share: 0 });
  });

  it('labels missing keys per grouping and uses provided labels', () => {
    const byCat = summarizeStockValue([{ key: null, quantity: 1, unitCost: 10 }, { key: '  ', quantity: 1, unitCost: 5 }], 'category');
    expect(byCat.groups).toEqual([{ key: NONE_GROUP_KEY, label: 'Tanpa kategori', itemCount: 2, value: 15, share: 1 }]);

    const byWh = summarizeStockValue(
      [
        { key: 'wh-1', label: 'GD1 — Gudang Utama', quantity: 2, unitCost: 100 },
        { key: undefined, quantity: 1, unitCost: 1 },
      ],
      'warehouse',
    );
    expect(byWh.groups.map((g) => g.label)).toEqual(['GD1 — Gudang Utama', 'Tanpa gudang']);
  });

  it('folds the tail into "Lainnya" beyond the limit without changing the total', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ key: `K${i}`, quantity: 1, unitCost: (6 - i) * 10 }));
    const res = summarizeStockValue(rows, 'category', 4);
    expect(res.total).toBe(210);
    expect(res.groups.map((g) => g.key)).toEqual(['K0', 'K1', 'K2', OTHER_GROUP_KEY]);
    expect(res.groups[3]).toMatchObject({ label: 'Lainnya (3)', value: 60, itemCount: 3 });
    expect(res.groups.reduce((s, g) => s + g.value, 0)).toBe(210);
  });

  it('keeps negative stock in the value and yields zero shares when the total is not positive', () => {
    const res = summarizeStockValue([{ key: 'A', quantity: -5, unitCost: 100 }], 'category');
    expect(res.total).toBe(-500);
    expect(res.groups[0]).toMatchObject({ value: -500, itemCount: 0, share: 0 });
  });

  it('treats invalid numbers as zero and returns an empty breakdown for no rows', () => {
    expect(summarizeStockValue([{ key: 'A', quantity: 'abc', unitCost: 10 }], 'category').total).toBe(0);
    expect(summarizeStockValue([], 'warehouse')).toEqual({ groupBy: 'warehouse', total: 0, groups: [] });
  });
});
