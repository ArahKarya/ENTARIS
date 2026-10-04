import { describe, expect, it } from 'vitest';
import { computePoLine, computePoTotals, paymentTermLabel, poDueDate, round2 } from './purchaseOrderCalc';

describe('round2 (half-up like decimal.js)', () => {
  it('rounds binary-float edge cases up', () => {
    expect(round2(33.335)).toBe(33.34);
    expect(round2(1.005)).toBe(1.01);
    expect(round2(2.675)).toBe(2.68);
    expect(round2(-1.005)).toBe(-1.01);
    expect(round2(NaN)).toBe(0);
  });
});

describe('computePoLine — mirrors server purchaseOrderCalc', () => {
  it('discount then PPN on the net, each step rounded', () => {
    // gross 33.335 → 33.34 ; net 30.0015 → 30.00 ; ppn 11% → 3.30
    expect(computePoLine({ quantity: 1, estimatedRate: 33.335, discount: 10, taxPct: 11 })).toEqual({
      gross: 33.34, net: 30, discountAmount: 3.34, taxAmount: 3.3, amount: 33.3,
    });
  });
  it('same numbers as the server test (3 × 12.345,67, 7,5% disc, 11% PPN)', () => {
    const l = computePoLine({ quantity: 3, estimatedRate: 12345.67, discount: 7.5, taxPct: 11 });
    // 37037.01 × 0.925 = 34259.23425 → 34259.23 ; ppn 3768.5153 → 3768.52
    expect(l.net).toBe(34259.23);
    expect(l.taxAmount).toBe(3768.52);
    expect(l.amount).toBe(38027.75);
  });
});

describe('computePoTotals', () => {
  it('multiple PPN rates + other costs', () => {
    const t = computePoTotals(
      [
        { quantity: 10, estimatedRate: 100000, discount: 5, taxPct: 11 },
        { quantity: 4, estimatedRate: 250000, taxPct: 12 },
        { quantity: 1, estimatedRate: 50000 },
      ],
      75000,
    );
    expect(t).toMatchObject({ subtotal: 2050000, discountTotal: 50000, taxTotal: 224500, otherCosts: 75000, grandTotal: 2299500 });
  });
  it('blank rows count as zero', () => {
    expect(computePoTotals([{ quantity: 0, estimatedRate: 0 }]).grandTotal).toBe(0);
  });
});

describe('payment terms', () => {
  it('labels presets and computes the due date', () => {
    expect(paymentTermLabel(0)).toBe('Tunai');
    expect(paymentTermLabel(30)).toBe('30 hari');
    expect(paymentTermLabel(null)).toBe('—');
    expect(poDueDate('2026-10-04T00:00:00.000Z', 30)).toBe('2026-11-03');
    expect(poDueDate('2026-10-04', null)).toBeNull();
  });
});
