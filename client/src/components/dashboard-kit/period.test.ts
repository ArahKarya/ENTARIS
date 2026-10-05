import { describe, expect, it } from 'vitest';
import { deltaPct, previousPeriod } from './period';

const today = new Date(2026, 9, 15); // 15 Okt 2026

describe('previousPeriod', () => {
  it('compares month-to-date with the same elapsed days of last month', () => {
    const p = previousPeriod({ preset: 'thisMonth', startDate: '2026-10-01', endDate: '2026-10-31' }, today);
    expect(p).toEqual({ startDate: '2026-09-01', endDate: '2026-09-15' });
  });
  it('compares a completed month with the full previous month', () => {
    const p = previousPeriod({ preset: 'lastMonth', startDate: '2026-09-01', endDate: '2026-09-30' }, today);
    expect(p).toEqual({ startDate: '2026-08-01', endDate: '2026-08-30' });
  });
  it('compares YTD with the same dates last year', () => {
    const p = previousPeriod({ preset: 'ytd', startDate: '2026-01-01', endDate: '2026-10-15' }, today);
    expect(p?.startDate).toBe('2025-01-01');
    expect(p?.endDate).toBe('2025-10-15');
  });
  it('uses the contiguous window before a custom range', () => {
    const p = previousPeriod({ preset: 'custom', startDate: '2026-09-11', endDate: '2026-09-20' }, today);
    expect(p).toEqual({ startDate: '2026-09-01', endDate: '2026-09-10' });
  });
  it('returns null for all periods and future ranges', () => {
    expect(previousPeriod({ preset: 'all', startDate: '2020-01-01', endDate: '2027-12-31' }, today)).toBeNull();
    expect(previousPeriod({ preset: 'custom', startDate: '2027-01-01', endDate: '2027-01-31' }, today)).toBeNull();
  });
});

describe('deltaPct', () => {
  it('formats up/down/flat and skips zero baselines', () => {
    expect(deltaPct(150, 100)).toEqual({ text: '+50%', direction: 'up' });
    expect(deltaPct(50, 100)).toEqual({ text: '-50%', direction: 'down' });
    expect(deltaPct(100, 100)).toEqual({ text: '0%', direction: 'flat' });
    expect(deltaPct(10, 0)).toBeNull();
  });
});
