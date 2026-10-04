import { describe, it, expect } from 'vitest';
import { businessDay, businessToday, daysOverdue, isPurchaseOrderOverdue } from '../purchaseOrderOverdue';

const OFF = '+07:00';
const po = (over: Partial<Parameters<typeof isPurchaseOrderOverdue>[0]> = {}) => ({
  status: 'Submitted',
  closedAt: null,
  expectedDeliveryDate: '2026-10-01T00:00:00.000Z',
  items: [{ quantity: 10, qtyReceived: 4 }],
  ...over,
});

describe('business day helpers', () => {
  it('maps instants to the WIB calendar day', () => {
    expect(businessDay('2026-10-03T16:59:00.000Z', OFF)).toBe('2026-10-03');
    expect(businessDay('2026-10-03T17:00:00.000Z', OFF)).toBe('2026-10-04');
    expect(businessToday(new Date('2026-10-03T18:00:00.000Z'), OFF)).toBe('2026-10-04');
  });
  it('counts whole days overdue, never negative', () => {
    expect(daysOverdue('2026-10-01T00:00:00.000Z', '2026-10-04', OFF)).toBe(3);
    // stored at local midnight (2026-09-30T17:00Z) is still 1 Oct WIB
    expect(daysOverdue('2026-09-30T17:00:00.000Z', '2026-10-04', OFF)).toBe(3);
    expect(daysOverdue('2026-10-10T00:00:00.000Z', '2026-10-04', OFF)).toBe(0);
  });
});

describe('isPurchaseOrderOverdue', () => {
  it('flags an open, partially received PO past its expected day', () => {
    expect(isPurchaseOrderOverdue(po(), '2026-10-04', OFF)).toBe(true);
  });
  it('is not overdue on the expected day itself', () => {
    expect(isPurchaseOrderOverdue(po(), '2026-10-01', OFF)).toBe(false);
  });
  it('ignores closed, draft, cancelled, undated and fully received POs', () => {
    expect(isPurchaseOrderOverdue(po({ closedAt: '2026-10-02T00:00:00Z' }), '2026-10-04', OFF)).toBe(false);
    expect(isPurchaseOrderOverdue(po({ status: 'Draft' }), '2026-10-04', OFF)).toBe(false);
    expect(isPurchaseOrderOverdue(po({ status: 'Cancelled' }), '2026-10-04', OFF)).toBe(false);
    expect(isPurchaseOrderOverdue(po({ expectedDeliveryDate: null }), '2026-10-04', OFF)).toBe(false);
    expect(
      isPurchaseOrderOverdue(po({ items: [{ quantity: '10.000', qtyReceived: '10.000' }] }), '2026-10-04', OFF),
    ).toBe(false);
  });
});
