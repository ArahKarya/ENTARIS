import { describe, expect, it } from 'vitest';
import { advanceAgeDays, tripDays } from './payment-request';
import { rateAmount, totalsByCategory } from './lines';
import { validateTravelValue } from './travel';

describe('tripDays', () => {
  it('is inclusive and null for unusable ranges', () => {
    expect(tripDays('2026-10-10', '2026-10-10')).toBe(1);
    expect(tripDays('2026-10-10', '2026-10-13T00:00:00.000Z')).toBe(4);
    expect(tripDays('2026-10-13', '2026-10-10')).toBeNull();
    expect(tripDays('', '2026-10-10')).toBeNull();
  });
});

describe('advanceAgeDays', () => {
  it('counts whole days since payment, never negative', () => {
    const now = new Date(2026, 9, 20);
    expect(advanceAgeDays('2026-10-06T00:00:00.000Z', now)).toBe(14);
    expect(advanceAgeDays('2026-10-25T00:00:00.000Z', now)).toBe(0);
    expect(advanceAgeDays(null, now)).toBe(0);
  });
});

describe('rate helpers', () => {
  it('uang saku = tarif × hari, only once both are filled', () => {
    expect(rateAmount(150000, 3)).toBe(450000);
    expect(rateAmount(150000, null)).toBeNull();
    expect(rateAmount(null, 3)).toBeNull();
    expect(rateAmount(33333.33, 3)).toBe(99999.99);
  });
  it('groups totals per category (uncategorised → Lain-lain)', () => {
    const t = totalsByCategory([
      { category: 'TRANSPORT', amount: 100 },
      { category: 'TRANSPORT', amount: 50 },
      { category: null, amount: 25 },
      { category: 'OTHER', amount: 5 },
    ]);
    expect(t.get('TRANSPORT')).toBe(150);
    expect(t.get('OTHER')).toBe(30);
  });
});

describe('validateTravelValue', () => {
  const ok = { destination: 'Surabaya', startDate: '2026-10-10', endDate: '2026-10-12', participants: '' };
  it('return date may not precede departure', () => {
    expect(validateTravelValue({ ...ok, endDate: '2026-10-09' }, false).endDate).toMatch(/sebelum/);
  });
  it('a draft may be incomplete; submit needs destination and dates', () => {
    expect(validateTravelValue({ ...ok, destination: '', startDate: '', endDate: '' }, false)).toEqual({});
    expect(Object.keys(validateTravelValue({ ...ok, destination: '', startDate: '', endDate: '' }, true)).sort()).toEqual(['destination', 'endDate', 'startDate']);
    expect(validateTravelValue(ok, true)).toEqual({});
  });
});
