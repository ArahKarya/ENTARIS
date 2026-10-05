import { describe, expect, it } from 'vitest';
import {
  asOfForPreset,
  detectAsOfPreset,
  detectRangePreset,
  isIsoDate,
  isRangeValid,
  normalizeAsOf,
  normalizeRange,
  periodLabel,
  rangeForPreset,
} from './period';

const TODAY = new Date(2026, 9, 5); // 5 Okt 2026

describe('period presets', () => {
  it('resolves range presets to full calendar periods', () => {
    expect(rangeForPreset('month', TODAY)).toEqual({ startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(rangeForPreset('lastMonth', TODAY)).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(rangeForPreset('quarter', TODAY)).toEqual({ startDate: '2026-10-01', endDate: '2026-12-31' });
    expect(rangeForPreset('year', TODAY)).toEqual({ startDate: '2026-01-01', endDate: '2026-12-31' });
  });

  it('handles January for lastMonth', () => {
    expect(rangeForPreset('lastMonth', new Date(2026, 0, 15))).toEqual({ startDate: '2025-12-01', endDate: '2025-12-31' });
  });

  it('resolves as-of presets', () => {
    expect(asOfForPreset('today', TODAY)).toBe('2026-10-05');
    expect(asOfForPreset('lastMonthEnd', TODAY)).toBe('2026-09-30');
    expect(asOfForPreset('lastQuarterEnd', TODAY)).toBe('2026-09-30');
    expect(asOfForPreset('lastYearEnd', TODAY)).toBe('2025-12-31');
  });

  it('detects the active preset or custom', () => {
    expect(detectRangePreset({ startDate: '2026-10-01', endDate: '2026-10-31' }, TODAY)).toBe('month');
    expect(detectRangePreset({ startDate: '2026-10-01', endDate: '2026-10-15' }, TODAY)).toBe('custom');
    expect(detectAsOfPreset('2026-09-30', TODAY)).toBe('lastMonthEnd');
    expect(detectAsOfPreset('2026-09-29', TODAY)).toBe('custom');
  });
});

describe('validation', () => {
  it('accepts only real yyyy-MM-dd dates', () => {
    expect(isIsoDate('2026-02-28')).toBe(true);
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('28/02/2026')).toBe(false);
    expect(isIsoDate('')).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it('validates range order', () => {
    expect(isRangeValid({ startDate: '2026-10-01', endDate: '2026-10-01' })).toBe(true);
    expect(isRangeValid({ startDate: '2026-10-02', endDate: '2026-10-01' })).toBe(false);
    expect(isRangeValid({ startDate: '', endDate: '2026-10-01' })).toBe(false);
  });

  it('falls back on invalid URL values', () => {
    const fallback = { startDate: '2026-10-01', endDate: '2026-10-31' };
    expect(normalizeRange('2026-09-01', '2026-09-30', fallback)).toEqual({ startDate: '2026-09-01', endDate: '2026-09-30' });
    expect(normalizeRange('2026-09-30', '2026-09-01', fallback)).toEqual(fallback);
    expect(normalizeRange(null, undefined, fallback)).toEqual(fallback);
    expect(normalizeAsOf('nope', '2026-10-05')).toBe('2026-10-05');
    expect(normalizeAsOf('2026-09-30', '2026-10-05')).toBe('2026-09-30');
  });

  it('labels periods', () => {
    expect(periodLabel({ startDate: '2026-10-01', endDate: '2026-10-31' })).toBe('Periode 1–31 Okt 2026');
    expect(periodLabel('2026-10-05')).toBe('Per 05 Okt 2026');
  });
});
