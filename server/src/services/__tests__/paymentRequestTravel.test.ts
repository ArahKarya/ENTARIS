import { describe, expect, it } from 'vitest';
import { checkLineRate, tripDays, validateTravel } from '../paymentRequestTravel';

describe('tripDays', () => {
  it('counts calendar days inclusively', () => {
    expect(tripDays('2026-10-10', '2026-10-10')).toBe(1);
    expect(tripDays('2026-10-10', '2026-10-13')).toBe(4);
    expect(tripDays('2026-10-30', '2026-11-02')).toBe(4);
  });
  it('is null for missing or inverted dates', () => {
    expect(tripDays(null, '2026-10-10')).toBeNull();
    expect(tripDays('2026-10-11', '2026-10-10')).toBeNull();
  });
});

describe('validateTravel', () => {
  const full = { travelDestination: 'Surabaya', travelStartDate: '2026-10-10', travelEndDate: '2026-10-12' };
  it('ignores non-TRAVEL kinds', () => {
    expect(validateTravel('REIMBURSEMENT', { travelStartDate: '2026-10-12', travelEndDate: '2026-10-10' }, true).ok).toBe(true);
  });
  it('return date may not precede departure — on save and on submit', () => {
    const bad = { ...full, travelStartDate: '2026-10-12', travelEndDate: '2026-10-10' };
    expect(validateTravel('TRAVEL', bad, false)).toMatchObject({ ok: false, error: expect.stringMatching(/sebelum/) });
    expect(validateTravel('TRAVEL', bad, true).ok).toBe(false);
  });
  it('a half-filled draft saves, but submit needs destination and both dates', () => {
    expect(validateTravel('TRAVEL', {}, false).ok).toBe(true);
    expect(validateTravel('TRAVEL', { travelStartDate: '2026-10-10' }, false).ok).toBe(true);
    expect(validateTravel('TRAVEL', { ...full, travelDestination: ' ' }, true).ok).toBe(false);
    expect(validateTravel('TRAVEL', { travelDestination: 'Surabaya', travelStartDate: '2026-10-10' }, true).ok).toBe(false);
    expect(validateTravel('TRAVEL', full, true).ok).toBe(true);
  });
  it('a same-day trip is valid', () => {
    expect(validateTravel('TRAVEL', { ...full, travelEndDate: '2026-10-10' }, true).ok).toBe(true);
  });
});

describe('checkLineRate', () => {
  it('passes without a rate, and when quantity × unit equals the amount', () => {
    expect(checkLineRate({ amount: 100 }, 'L').ok).toBe(true);
    expect(checkLineRate({ amount: 450000, quantity: 3, unitAmount: 150000 }, 'L').ok).toBe(true);
  });
  it('rejects a mismatch or a half-filled rate', () => {
    expect(checkLineRate({ amount: 400000, quantity: 3, unitAmount: 150000 }, 'L').ok).toBe(false);
    expect(checkLineRate({ amount: 400000, quantity: 3 }, 'L').ok).toBe(false);
  });
});
