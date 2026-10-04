import { describe, it, expect } from 'vitest';
import { buildPaymentRequestWhere, paymentRequestOrderBy, summarizePaymentRequests } from '../paymentRequestList';

const scope = { requesterId: 'u1' };

describe('buildPaymentRequestWhere', () => {
  it('keeps the scope alone when no filter is set', () => {
    expect(buildPaymentRequestWhere({}, scope)).toEqual({ ok: true, where: scope });
  });

  it('ANDs status, type, local-day date range and search onto the scope', () => {
    const out = buildPaymentRequestWhere(
      { status: 'APPROVED', typeId: 't1', startDate: '2026-10-01', endDate: '2026-10-31', search: 'taksi' },
      scope,
    );
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const and = (out.where as { AND: Record<string, unknown>[] }).AND;
    expect(and[0]).toEqual(scope);
    expect(and).toContainEqual({ status: 'APPROVED' });
    expect(and).toContainEqual({ typeId: 't1' });
    expect(and).toContainEqual({
      createdAt: { gte: new Date('2026-10-01T00:00:00.000+07:00'), lt: new Date('2026-11-01T00:00:00.000+07:00') },
    });
    expect(JSON.stringify(and)).toContain('requester');
  });

  it('rejects unknown status and malformed / inverted dates', () => {
    expect(buildPaymentRequestWhere({ status: 'Paid' }, scope).ok).toBe(false);
    expect(buildPaymentRequestWhere({ startDate: '01-10-2026' }, scope).ok).toBe(false);
    expect(buildPaymentRequestWhere({ startDate: '2026-10-31', endDate: '2026-10-01' }, scope).ok).toBe(false);
  });
});

describe('sort & summary', () => {
  it('sorts by requester name and keeps a stable tiebreak', () => {
    expect(paymentRequestOrderBy({ field: 'requester', dir: 'asc' })).toEqual([{ requester: { fullName: 'asc' } }, { number: 'desc' }]);
  });

  it('summarizes per status; rejected/cancelled excluded from the total amount', () => {
    const s = summarizePaymentRequests([
      { status: 'PAID', _count: { _all: 2 }, _sum: { totalAmount: '300000' } },
      { status: 'CANCELLED', _count: { _all: 1 }, _sum: { totalAmount: '50000' } },
      { status: 'DRAFT', _count: { _all: 1 }, _sum: { totalAmount: null } },
    ]);
    expect(s.count).toBe(4);
    expect(s.totalAmount).toBe(300000);
    expect(s.byStatus.CANCELLED).toEqual({ count: 1, amount: 50000 });
  });
});
