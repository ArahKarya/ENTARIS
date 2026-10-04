import { describe, it, expect } from 'vitest';
import { formatMovementQty, gaStockState, movementNeeds, movementRoute } from './ga-inventory-model';

describe('ga inventory model', () => {
  it('derives the stock state like the server', () => {
    expect(gaStockState({ totalStock: 0, lowStock: false })).toBe('out');
    expect(gaStockState({ totalStock: 2, lowStock: true })).toBe('low');
    expect(gaStockState({ totalStock: 9, lowStock: false })).toBe('ok');
  });

  it('knows which locations each movement type needs', () => {
    expect(movementNeeds('IN')).toEqual({ from: false, to: true });
    expect(movementNeeds('OUT')).toEqual({ from: true, to: false });
    expect(movementNeeds('TRANSFER')).toEqual({ from: true, to: true });
    expect(movementNeeds('ADJUSTMENT')).toEqual({ from: false, to: true });
  });

  it('signs adjustment quantities and formats routes', () => {
    expect(formatMovementQty({ type: 'ADJUSTMENT', quantity: -2 })).toBe('−2');
    expect(formatMovementQty({ type: 'ADJUSTMENT', quantity: 3 })).toBe('+3');
    expect(formatMovementQty({ type: 'OUT', quantity: 4 })).toBe('4');
    expect(movementRoute({ fromLocation: { code: 'A', name: 'Gudang A' }, toLocation: { code: 'B' } })).toBe('Gudang A → B');
    expect(movementRoute({ toLocation: { code: 'B', name: 'Gudang B' } })).toBe('→ Gudang B');
    expect(movementRoute({})).toBe('-');
  });
});
