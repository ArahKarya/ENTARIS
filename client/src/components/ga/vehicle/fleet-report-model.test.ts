import { describe, expect, it } from 'vitest';
import { monthLabel, resolveReportPeriod } from './fleet-report-model';

const TODAY = new Date(2026, 9, 4);

describe('resolveReportPeriod', () => {
  it('defaults to the last 12 months (whole months)', () => {
    expect(resolveReportPeriod({}, TODAY)).toMatchObject({ preset: 'last12', startDate: '2025-11-01', endDate: '2026-10-31' });
  });
  it('resolves presets', () => {
    expect(resolveReportPeriod({ period: 'ytd' }, TODAY)).toMatchObject({ startDate: '2026-01-01', endDate: '2026-10-04' });
    expect(resolveReportPeriod({ period: 'lastYear' }, TODAY)).toMatchObject({ startDate: '2025-01-01', endDate: '2025-12-31' });
    expect(resolveReportPeriod({ period: 'thisQuarter' }, TODAY)).toMatchObject({ startDate: '2026-10-01' });
  });
  it('accepts a valid custom range (swapped if reversed) and falls back otherwise', () => {
    expect(resolveReportPeriod({ period: 'custom', startDate: '2026-06-30', endDate: '2026-01-01' }, TODAY)).toMatchObject({
      preset: 'custom', startDate: '2026-01-01', endDate: '2026-06-30',
    });
    expect(resolveReportPeriod({ period: 'custom', startDate: 'x' }, TODAY).preset).toBe('last12');
    expect(resolveReportPeriod({ period: 'nope' }, TODAY).preset).toBe('last12');
  });
});

describe('monthLabel', () => {
  it('formats a month key', () => expect(monthLabel('2026-10')).toBe('Okt 26'));
});
