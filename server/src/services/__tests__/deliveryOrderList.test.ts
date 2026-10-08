import { describe, it, expect } from 'vitest';
import { buildDeliveryOrderWhere, DEFAULT_DELIVERY_ORDER_SORT, deliveryOrderOrderBy } from '../deliveryOrderList';

describe('buildDeliveryOrderWhere', () => {
  it('maps the derived status filter values', () => {
    const where = (status: string) => {
      const r = buildDeliveryOrderWhere({ status });
      if (!r.ok) throw new Error(r.error);
      return r.where;
    };
    expect(where('Submitted')).toEqual({ status: 'Submitted', invoiceId: null });
    expect(where('Invoiced')).toEqual({ status: 'Submitted', invoiceId: { not: null } });
    expect(where('Cancelled')).toEqual({ status: 'Cancelled' });
    expect(where('Draft')).toEqual({ status: 'Draft' });
  });

  it('combines party, dates and search (DO number, customer, no. mobil, SO number, customer PO ref)', () => {
    const r = buildDeliveryOrderWhere({ partyId: 'c1', startDate: '2026-02-01', endDate: '2026-02-28', search: 'BE 1' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where).toEqual({
      partyId: 'c1',
      date: { gte: new Date('2026-01-31T17:00:00.000Z'), lt: new Date('2026-02-28T17:00:00.000Z') },
      OR: [
        { doNumber: { contains: 'BE 1', mode: 'insensitive' } },
        { customer: { name: { contains: 'BE 1', mode: 'insensitive' } } },
        { nomorMobil: { contains: 'BE 1', mode: 'insensitive' } },
        { salesOrder: { soNumber: { contains: 'BE 1', mode: 'insensitive' } } },
        { salesOrder: { customerRefNo: { contains: 'BE 1', mode: 'insensitive' } } },
      ],
    });
  });

  it('does not share state between calls', () => {
    const a = buildDeliveryOrderWhere({ status: 'Submitted', partyId: 'x' });
    const b = buildDeliveryOrderWhere({ status: 'Submitted' });
    expect(a.ok && b.ok && b.where).toEqual({ status: 'Submitted', invoiceId: null });
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildDeliveryOrderWhere({ status: 'Paid' }).ok).toBe(false);
    expect(buildDeliveryOrderWhere({ endDate: '2026-13-45' }).ok).toBe(false);
  });
});

describe('deliveryOrderOrderBy', () => {
  it('defaults to newest date then DO number', () => {
    expect(deliveryOrderOrderBy(DEFAULT_DELIVERY_ORDER_SORT)).toEqual([{ date: 'desc' }, { doNumber: 'desc' }]);
  });

  it('sorts by customer name or DO number', () => {
    expect(deliveryOrderOrderBy({ field: 'customer', dir: 'asc' })).toEqual([
      { customer: { name: 'asc' } },
      { doNumber: 'asc' },
    ]);
    expect(deliveryOrderOrderBy({ field: 'doNumber', dir: 'asc' })).toEqual([{ doNumber: 'asc' }]);
  });
});
