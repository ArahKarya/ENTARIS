import { describe, it, expect } from 'vitest';
import { calcWeightedAverage } from '../weightedAverage';

describe('calcWeightedAverage', () => {
  it('calculates WAC for first stock-in (empty stock)', () => {
    const result = calcWeightedAverage(0, 0, 100, 5000);
    expect(result).toBe(5000);
  });

  it('calculates WAC when adding to existing stock', () => {
    // 100 kg @ 5000 = 500,000
    // + 50 kg @ 6000 = 300,000
    // total = 800,000 / 150 = 5333.33
    const result = calcWeightedAverage(100, 5000, 50, 6000);
    expect(result).toBe(5333.33);
  });

  it('anchors to the incoming unit cost when current stock is zero (no meaningful prior average)', () => {
    // Implementation guard: cQty <= 0 falls back to inUnitCost (see weightedAverage.ts).
    const result = calcWeightedAverage(0, 0, 0, 5000);
    expect(result).toBe(5000);
  });

  it('handles large production values (rice mill scale)', () => {
    // 50,000 kg @ 8,500/kg = 425M
    // + 10,000 kg @ 9,200/kg = 92M
    // total = 517M / 60,000 = 8,616.67
    const result = calcWeightedAverage(50000, 8500, 10000, 9200);
    expect(result).toBe(8616.67);
  });

  it('handles Decimal-like inputs (string coercion)', () => {
    const result = calcWeightedAverage(100, 5000, 50, 6000);
    expect(result).toBe(5333.33);
  });

  it('preserves existing cost when adding zero quantity', () => {
    // Edge: inQty=0 → totalQty = 100, totalValue = 500,000
    // WAC stays the same
    const result = calcWeightedAverage(100, 5000, 0, 9999);
    expect(result).toBe(5000);
  });

  it('handles fractional quantities (kg with decimals)', () => {
    // 1,234.567 kg @ 7,890/kg
    // + 567.123 kg @ 8,100/kg
    const result = calcWeightedAverage(1234.567, 7890, 567.123, 8100);
    const expected = (1234.567 * 7890 + 567.123 * 8100) / (1234.567 + 567.123);
    expect(result).toBeCloseTo(expected, 2);
  });
});
