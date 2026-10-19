import { describe, expect, it } from 'vitest';
import {
  attentionRows,
  conversionCost,
  countDelta,
  formatYield,
  isIsoDate,
  mainOutputQty,
  periodDays,
  pointDelta,
  previousPeriod,
  resolvePeriod,
  stockCoverage,
  topProductRows,
  yieldDomain,
  yieldTrendRows,
} from './dashboard-model';

const TODAY = new Date(2026, 9, 4); // 4 Okt 2026

describe('resolvePeriod', () => {
  it('defaults to this month up to today', () => {
    expect(resolvePeriod({}, TODAY)).toMatchObject({ preset: 'thisMonth', startDate: '2026-10-01', endDate: '2026-10-04', label: 'Bulan ini' });
    expect(resolvePeriod({ period: 'nonsense' }, TODAY).preset).toBe('thisMonth');
  });

  it('resolves each preset', () => {
    expect(resolvePeriod({ period: 'lastMonth' }, TODAY)).toMatchObject({ startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(resolvePeriod({ period: 'last30' }, TODAY)).toMatchObject({ startDate: '2026-09-05', endDate: '2026-10-04' });
    expect(resolvePeriod({ period: 'thisQuarter' }, TODAY)).toMatchObject({ startDate: '2026-10-01', endDate: '2026-10-04' });
    expect(resolvePeriod({ period: 'ytd' }, TODAY)).toMatchObject({ startDate: '2026-01-01', endDate: '2026-10-04' });
    expect(resolvePeriod({ period: 'lastMonth' }, new Date(2026, 0, 15))).toMatchObject({ startDate: '2025-12-01', endDate: '2025-12-31' });
  });

  it('uses a valid custom range (swapping reversed bounds) and falls back otherwise', () => {
    expect(resolvePeriod({ period: 'custom', startDate: '2026-03-01', endDate: '2026-03-31' }, TODAY)).toMatchObject({
      preset: 'custom',
      startDate: '2026-03-01',
      endDate: '2026-03-31',
      label: 'Rentang khusus',
      rangeLabel: '1–31 Mar 2026',
    });
    expect(resolvePeriod({ period: 'custom', startDate: '2026-03-31', endDate: '2026-03-01' }, TODAY)).toMatchObject({
      startDate: '2026-03-01',
      endDate: '2026-03-31',
    });
    expect(resolvePeriod({ period: 'custom', startDate: '2026-02-30', endDate: '2026-03-01' }, TODAY).preset).toBe('thisMonth');
    expect(resolvePeriod({ period: 'custom', startDate: '2026-03-01' }, TODAY).preset).toBe('thisMonth');
  });
});

describe('period arithmetic', () => {
  it('validates calendar dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-2-3')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it('counts inclusive days and builds the previous period of equal length', () => {
    expect(periodDays({ startDate: '2026-10-01', endDate: '2026-10-04' })).toBe(4);
    expect(previousPeriod({ startDate: '2026-10-01', endDate: '2026-10-04' })).toEqual({ startDate: '2026-09-27', endDate: '2026-09-30' });
    expect(previousPeriod({ startDate: '2026-09-01', endDate: '2026-09-30' })).toEqual({ startDate: '2026-08-02', endDate: '2026-08-31' });
  });
});

describe('deltas and formatting', () => {
  it('describes count and point changes', () => {
    expect(countDelta(12, 9)).toMatchObject({ value: '+3', direction: 'up' });
    expect(countDelta(5, 9)).toMatchObject({ value: '-4', direction: 'down' });
    expect(countDelta(5, 5)).toMatchObject({ value: '0', direction: 'flat' });
    expect(countDelta(5, undefined)).toBeUndefined();
    expect(countDelta(0, 0)).toBeUndefined();
    expect(pointDelta(62.46, 60)).toMatchObject({ value: '+2,5 poin', direction: 'up' });
    expect(pointDelta(null, 60)).toBeUndefined();
  });

  it('formats a percent yield', () => {
    expect(formatYield(62.5)).toBe('62,5%');
    expect(formatYield(null)).toBe('—');
  });
});

describe('attention list', () => {
  const it_ = (id: string) => ({ id, code: id, name: id, unit: 'kg', currentStock: 0, minimumStock: 10 });

  it('lists out-of-stock first, dedupes and caps', () => {
    const rows = attentionRows([it_('a'), it_('b')], [it_('b'), it_('c'), it_('d')], 3);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
  });

  it('computes stock coverage against the minimum', () => {
    expect(stockCoverage(5, 10)).toBe(0.5);
    expect(stockCoverage('-2', '10')).toBe(0);
    expect(stockCoverage(5, 0)).toBeNull();
  });
});

describe('production helpers', () => {
  it('derives main output and conversion cost', () => {
    expect(mainOutputQty({ outputQty: 700, byproductQty: 150 })).toBe(550);
    expect(mainOutputQty({ outputQty: 10, byproductQty: 20 })).toBe(0);
    expect(conversionCost({ totalCostInputSide: 1000.004, totalCostOutputSide: 250, avgLoadedHppPerKg: 0, runsWithHppCount: 2 })).toBe(1250);
    expect(conversionCost({ totalCostInputSide: 0, totalCostOutputSide: 0, avgLoadedHppPerKg: 0, runsWithHppCount: 0 })).toBeNull();
    expect(conversionCost(undefined)).toBeNull();
  });

  it('labels yield trend points', () => {
    expect(yieldTrendRows([{ date: '2026-10-03', avgYield: 61, count: 2 }])).toEqual([
      { date: '2026-10-03', avgYield: 61, count: 2, label: '03/10' },
    ]);
  });

  it('pads and snaps the yield axis', () => {
    expect(yieldDomain([62, 62.4], 62.2)).toEqual([60, 70]);
    expect(yieldDomain([41, 78])).toEqual([35, 80]);
    expect(yieldDomain([99])).toEqual([90, 100]);
    expect(yieldDomain([1])).toEqual([0, 10]);
    expect(yieldDomain([])).toEqual([0, 100]);
  });

  it('joins top outputs with their average HPP', () => {
    const rows = topProductRows(
      [
        { id: 'a', name: 'Beras', unit: 'kg', quantity: 800 },
        { id: 'b', name: 'Menir', unit: 'kg', quantity: 200 },
      ],
      [{ itemId: 'a', avgComputedHpp: 11250 }],
    );
    expect(rows[0]).toMatchObject({ avgHpp: 11250, share: 1 });
    expect(rows[1]).toMatchObject({ avgHpp: null, share: 0.25 });
  });
});
