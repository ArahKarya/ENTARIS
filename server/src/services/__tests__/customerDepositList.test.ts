import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildCustomerDepositWhere,
  DEFAULT_CUSTOMER_DEPOSIT_SORT,
  depositFigures,
  deriveDepositState,
  filterByUsage,
  pageDeposits,
  sortDeposits,
  summarizeCustomerDeposits,
  toLightRow,
  type DepositLightRow,
  type DepositLightSource,
} from '../customerDepositList';

const src = (
  over: Partial<DepositLightSource> & { applied?: Array<string | number> } = {},
): DepositLightSource => {
  const { applied = [], ...rest } = over;
  return {
    id: 'd1',
    paymentNumber: 'PAY-202610-0001',
    date: new Date('2026-10-01T00:00:00.000Z'),
    status: 'Submitted',
    amount: new Prisma.Decimal('1000'),
    refundedAmount: new Prisma.Decimal('0'),
    party: { name: 'Toko A' },
    customerDepositApplications: applied.map((a) => ({ appliedAmount: new Prisma.Decimal(a) })),
    ...rest,
  };
};

const rows: DepositLightRow[] = [
  toLightRow(src({ id: 'a', paymentNumber: 'PAY-01', date: new Date('2026-09-01'), amount: '1000', party: { name: 'Budi' } })),
  toLightRow(
    src({ id: 'b', paymentNumber: 'PAY-02', date: new Date('2026-09-05'), amount: '5000', applied: ['2000'], party: { name: 'andi' } }),
  ),
  toLightRow(src({ id: 'c', paymentNumber: 'PAY-03', date: new Date('2026-09-05'), amount: '3000', applied: ['3000'], party: { name: 'Citra' } })),
  toLightRow(src({ id: 'd', paymentNumber: 'PAY-04', date: new Date('2026-09-10'), amount: '750', status: 'Cancelled', party: { name: 'Dewi' } })),
  toLightRow(
    src({ id: 'e', paymentNumber: 'PAY-05', date: new Date('2026-09-12'), amount: '1000', refundedAmount: '400', party: { name: 'Eka' } }),
  ),
];

describe('depositFigures', () => {
  it('computes remaining = amount − applied − refunded without float drift', () => {
    expect(depositFigures('0.3', '0.1', [{ appliedAmount: '0.1' }, { appliedAmount: '0.1' }])).toEqual({
      totalApplied: 0.2,
      totalRefunded: 0.1,
      remaining: 0,
    });
  });

  it('treats a missing refund as zero', () => {
    expect(depositFigures(new Prisma.Decimal('500'), null, [])).toEqual({ totalApplied: 0, totalRefunded: 0, remaining: 500 });
  });
});

describe('deriveDepositState', () => {
  it('follows the list badge rules', () => {
    expect(deriveDepositState('Cancelled', 0, 1000)).toBe('Cancelled');
    expect(deriveDepositState('Submitted', 1000, 0)).toBe('FullyUsed');
    expect(deriveDepositState('Submitted', 0, 0.005)).toBe('FullyUsed');
    expect(deriveDepositState('Submitted', 200, 800)).toBe('PartiallyUsed');
    expect(deriveDepositState('Submitted', 0, 1000)).toBe('Active');
    // A partial cash refund alone leaves the deposit Active (nothing applied yet).
    expect(rows.find((r) => r.id === 'e')?.state).toBe('Active');
  });
});

describe('buildCustomerDepositWhere', () => {
  it('always scopes to customer deposits', () => {
    const r = buildCustomerDepositWhere({});
    expect(r).toEqual({ ok: true, where: { paymentType: 'CustomerDeposit' }, usage: null });
  });

  it('maps usage states to non-cancelled documents plus an in-memory filter', () => {
    const r = buildCustomerDepositWhere({ status: 'PartiallyUsed' });
    expect(r).toEqual({
      ok: true,
      where: { paymentType: 'CustomerDeposit', status: { not: 'Cancelled' } },
      usage: 'PartiallyUsed',
    });
  });

  it('passes document statuses straight to the query', () => {
    const r = buildCustomerDepositWhere({ status: 'Cancelled' });
    expect(r.ok && r.where.status).toBe('Cancelled');
    expect(r.ok && r.usage).toBeNull();
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildCustomerDepositWhere({ status: 'Bogus' })).toEqual({ ok: false, error: 'Status uang muka tidak dikenal.' });
    expect(buildCustomerDepositWhere({ startDate: '2026-13-01' }).ok).toBe(false);
    expect(buildCustomerDepositWhere({ endDate: '01/10/2026' }).ok).toBe(false);
  });

  it('builds party, date range and search filters', () => {
    const r = buildCustomerDepositWhere({
      partyId: ' p1 ',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      search: ' beras ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where).toEqual({
      paymentType: 'CustomerDeposit',
      partyId: 'p1',
      date: { gte: new Date('2026-10-01'), lte: new Date('2026-10-31T23:59:59.999Z') },
      OR: [
        { paymentNumber: { contains: 'beras', mode: 'insensitive' } },
        { party: { name: { contains: 'beras', mode: 'insensitive' } } },
      ],
    });
  });
});

describe('filterByUsage / sortDeposits / pageDeposits', () => {
  it('filters by derived usage state', () => {
    expect(filterByUsage(rows, 'Active').map((r) => r.id)).toEqual(['a', 'e']);
    expect(filterByUsage(rows, 'FullyUsed').map((r) => r.id)).toEqual(['c']);
    expect(filterByUsage(rows, null)).toHaveLength(5);
  });

  it('sorts by date desc by default with a stable document-number tie-breaker', () => {
    expect(sortDeposits(rows, DEFAULT_CUSTOMER_DEPOSIT_SORT).map((r) => r.id)).toEqual(['e', 'd', 'c', 'b', 'a']);
    expect(sortDeposits(rows, { field: 'date', dir: 'asc' }).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('sorts by computed amounts and customer name (case-insensitive)', () => {
    expect(sortDeposits(rows, { field: 'remaining', dir: 'desc' }).map((r) => r.id)).toEqual(['b', 'a', 'd', 'e', 'c']);
    expect(sortDeposits(rows, { field: 'customer', dir: 'asc' }).map((r) => r.id)).toEqual(['b', 'a', 'c', 'd', 'e']);
    expect(sortDeposits(rows, { field: 'totalApplied', dir: 'desc' }).map((r) => r.id)).toEqual(['c', 'b', 'e', 'd', 'a']);
  });

  it('does not mutate its input', () => {
    const before = rows.map((r) => r.id);
    sortDeposits(rows, { field: 'amount', dir: 'asc' });
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it('slices one page and reports the filtered total', () => {
    const sort = DEFAULT_CUSTOMER_DEPOSIT_SORT;
    expect(pageDeposits(rows, { usage: null, sort, skip: 0, limit: 2 })).toEqual({ ids: ['e', 'd'], total: 5 });
    expect(pageDeposits(rows, { usage: null, sort, skip: 4, limit: 2 })).toEqual({ ids: ['a'], total: 5 });
    expect(pageDeposits(rows, { usage: 'Active', sort, skip: 0, limit: 25 })).toEqual({ ids: ['e', 'a'], total: 2 });
    expect(pageDeposits(rows, { usage: null, sort, skip: 50, limit: 25 })).toEqual({ ids: [], total: 5 });
  });
});

describe('summarizeCustomerDeposits', () => {
  it('excludes cancelled deposits from the sums and counts usable balances', () => {
    expect(summarizeCustomerDeposits(rows)).toEqual({
      count: 5,
      cancelledCount: 1,
      totalDeposit: 10000,
      totalApplied: 5000,
      totalRefunded: 400,
      totalRemaining: 4600,
      activeCount: 3,
      byState: { Active: 2, PartiallyUsed: 1, FullyUsed: 1, Cancelled: 1 },
    });
  });

  it('handles an empty result', () => {
    expect(summarizeCustomerDeposits([])).toEqual({
      count: 0,
      cancelledCount: 0,
      totalDeposit: 0,
      totalApplied: 0,
      totalRefunded: 0,
      totalRemaining: 0,
      activeCount: 0,
      byState: { Active: 0, PartiallyUsed: 0, FullyUsed: 0, Cancelled: 0 },
    });
  });
});
