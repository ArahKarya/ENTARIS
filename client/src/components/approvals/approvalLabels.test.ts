import { describe, expect, it } from 'vitest';
import { approvalLabels } from './approval-utils';

const ctx = {
  party: { id: 'p-250', name: 'Supplier ke-250' },
  supplier: { name: 'Supplier ke-250' },
  items: { 'i-1': { name: 'Gabah Kering Panen', unit: 'kg' } },
};

describe('approvalLabels', () => {
  it('uses the names the context endpoint resolved', () => {
    const l = approvalLabels(ctx, false);
    expect(l.partyName('p-250')).toBe('Supplier ke-250');
    expect(l.itemName('i-1')).toBe('Gabah Kering Panen');
    expect(l.itemUnit('i-1')).toBe('kg');
  });

  it('shows an ellipsis while the context is loading', () => {
    const l = approvalLabels(undefined, true);
    expect(l.partyName('p-250')).toBe('…');
    expect(l.itemName('i-1')).toBe('…');
    expect(l.itemUnit('i-1')).toBe('');
  });

  it('falls back to a short id when a record is missing', () => {
    const l = approvalLabels({ items: {} }, false);
    expect(l.partyName('abcdef0123456789')).toBe('(pihak abcdef01)');
    expect(l.itemName('fedcba9876543210')).toBe('(item fedcba98)');
  });
});
