import { describe, expect, it } from 'vitest';
import { returnLineAmount, returnTotal } from '../salesReturnSubmit';

describe('sales return amount', () => {
  it('prices a line from the invoice rate less the line discount', () => {
    expect(returnLineAmount(50, 16_000, 0)).toBe(800_000);
    expect(returnLineAmount(3, 10_000, 12.5)).toBe(26_250);
  });

  it('adds line tax to the total', () => {
    expect(returnTotal([{ amount: 800_000, taxPct: 0 }, { amount: 100_000, taxPct: 11 }])).toBe(911_000);
  });

  it('rounds each line, then tax once, then the total (posting order)', () => {
    const lines = [
      { amount: returnLineAmount(1.333, 9_999, 7.5), taxPct: 11 },
      { amount: returnLineAmount(2.5, 3_333.33, 0), taxPct: 0 },
    ];
    expect(lines.map((l) => l.amount)).toEqual([12_329.02, 8_333.33]);
    expect(returnTotal(lines)).toBe(22_018.54);
  });

  it('is zero for qty-only returns of consigned goods', () => {
    expect(returnTotal([{ amount: returnLineAmount(10, 0, 0), taxPct: 0 }])).toBe(0);
  });
});
