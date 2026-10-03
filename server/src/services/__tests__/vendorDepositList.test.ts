import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildVendorDepositWhere,
  DEFAULT_VENDOR_DEPOSIT_SORT,
  filterVendorByUsage,
  pageVendorDeposits,
  sortVendorDeposits,
  summarizeVendorDeposits,
  toVendorLightRow,
  VENDOR_DEPOSIT_SORT_FIELDS,
  type VendorDepositLightRow,
  type VendorDepositLightSource,
} from '../vendorDepositList';

const src = (
  over: Partial<VendorDepositLightSource> & { applied?: Array<string | number> } = {},
): VendorDepositLightSource => {
  const { applied = [], ...rest } = over;
  return {
    id: 'd1',
    paymentNumber: 'PAY-202610-0001',
    date: new Date('2026-10-01T00:00:00.000Z'),
    status: 'Submitted',
    amount: new Prisma.Decimal('1000'),
    refundedAmount: new Prisma.Decimal('0'),
    party: { name: 'KUD A' },
    depositApplications: applied.map((a) => ({ appliedAmount: new Prisma.Decimal(a) })),
    ...rest,
  };
};

const rows: VendorDepositLightRow[] = [
  toVendorLightRow(src({ id: 'a', paymentNumber: 'PAY-01', date: new Date('2026-09-01'), amount: '1000', party: { name: 'Budi Tani' } })),
  toVendorLightRow(
    src({ id: 'b', paymentNumber: 'PAY-02', date: new Date('2026-09-05'), amount: '5000', applied: ['2000'], party: { name: 'andalas' } }),
  ),
  toVendorLightRow(
    src({ id: 'c', paymentNumber: 'PAY-03', date: new Date('2026-09-05'), amount: '3000', applied: ['1000', '2000'], party: { name: 'CV Citra' } }),
  ),
  toVendorLightRow(src({ id: 'd', paymentNumber: 'PAY-04', date: new Date('2026-09-10'), amount: '750', status: 'Cancelled', party: { name: 'Dewi' } })),
  toVendorLightRow(
    src({ id: 'e', paymentNumber: 'PAY-05', date: new Date('2026-09-12'), amount: '1000', refundedAmount: '400', party: null }),
  ),
];

describe('toVendorLightRow', () => {
  it('derives figures from purchase-invoice applications and cash refunds', () => {
    const r = toVendorLightRow(src({ amount: '5000', refundedAmount: '500', applied: ['2000'] }));
    expect(r).toMatchObject({ amount: 5000, totalApplied: 2000, totalRefunded: 500, remaining: 2500, state: 'PartiallyUsed' });
  });

  it('keeps the badge rules: cancelled wins, refund-only stays Active, dust counts as used', () => {
    expect(rows.find((r) => r.id === 'd')?.state).toBe('Cancelled');
    expect(rows.find((r) => r.id === 'e')?.state).toBe('Active');
    expect(toVendorLightRow(src({ amount: '1000', applied: ['999.995'] })).state).toBe('FullyUsed');
  });

  it('tolerates a deposit without a party', () => {
    expect(rows.find((r) => r.id === 'e')?.supplierName).toBe('');
  });
});

describe('buildVendorDepositWhere', () => {
  it('always scopes to vendor deposits', () => {
    expect(buildVendorDepositWhere({})).toEqual({ ok: true, where: { paymentType: 'VendorDeposit' }, usage: null });
  });

  it('maps usage states to non-cancelled documents plus an in-memory filter', () => {
    expect(buildVendorDepositWhere({ status: 'FullyUsed' })).toEqual({
      ok: true,
      where: { paymentType: 'VendorDeposit', status: { not: 'Cancelled' } },
      usage: 'FullyUsed',
    });
  });

  it('passes document statuses straight to the query', () => {
    const r = buildVendorDepositWhere({ status: 'Cancelled' });
    expect(r.ok && r.where.status).toBe('Cancelled');
    expect(r.ok && r.usage).toBeNull();
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildVendorDepositWhere({ status: 'Bogus' })).toEqual({ ok: false, error: 'Status uang muka tidak dikenal.' });
    expect(buildVendorDepositWhere({ startDate: '2026-02-30x' }).ok).toBe(false);
    expect(buildVendorDepositWhere({ endDate: '1/10/2026' }).ok).toBe(false);
  });

  it('builds party, business-day date range and search filters', () => {
    const r = buildVendorDepositWhere({
      partyId: ' s1 ',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      search: ' tani ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where).toEqual({
      paymentType: 'VendorDeposit',
      partyId: 's1',
      date: { gte: new Date('2026-08-31T17:00:00.000Z'), lt: new Date('2026-09-30T17:00:00.000Z') },
      OR: [
        { paymentNumber: { contains: 'tani', mode: 'insensitive' } },
        { party: { name: { contains: 'tani', mode: 'insensitive' } } },
      ],
    });
  });

  it('supports an open-ended range', () => {
    const r = buildVendorDepositWhere({ endDate: '2026-09-30' });
    expect(r.ok && r.where.date).toEqual({ lt: new Date('2026-09-30T17:00:00.000Z') });
  });
});

describe('filterVendorByUsage / sortVendorDeposits / pageVendorDeposits', () => {
  it('filters by derived usage state', () => {
    expect(filterVendorByUsage(rows, 'Active').map((r) => r.id)).toEqual(['a', 'e']);
    expect(filterVendorByUsage(rows, 'PartiallyUsed').map((r) => r.id)).toEqual(['b']);
    expect(filterVendorByUsage(rows, 'FullyUsed').map((r) => r.id)).toEqual(['c']);
    expect(filterVendorByUsage(rows, null)).toHaveLength(5);
  });

  it('whitelists the sortable fields', () => {
    expect(VENDOR_DEPOSIT_SORT_FIELDS).toEqual(['date', 'paymentNumber', 'supplier', 'amount', 'totalApplied', 'remaining']);
  });

  it('sorts by date desc by default with a stable document-number tie-breaker', () => {
    expect(sortVendorDeposits(rows, DEFAULT_VENDOR_DEPOSIT_SORT).map((r) => r.id)).toEqual(['e', 'd', 'c', 'b', 'a']);
    expect(sortVendorDeposits(rows, { field: 'date', dir: 'asc' }).map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('sorts by computed amounts and supplier name (case-insensitive)', () => {
    expect(sortVendorDeposits(rows, { field: 'remaining', dir: 'desc' }).map((r) => r.id)).toEqual(['b', 'a', 'd', 'e', 'c']);
    expect(sortVendorDeposits(rows, { field: 'supplier', dir: 'asc' }).map((r) => r.id)).toEqual(['e', 'b', 'a', 'c', 'd']);
    expect(sortVendorDeposits(rows, { field: 'totalApplied', dir: 'desc' }).map((r) => r.id)).toEqual(['c', 'b', 'e', 'd', 'a']);
  });

  it('does not mutate its input', () => {
    const before = rows.map((r) => r.id);
    sortVendorDeposits(rows, { field: 'amount', dir: 'asc' });
    expect(rows.map((r) => r.id)).toEqual(before);
  });

  it('slices one page and reports the filtered total', () => {
    const sort = DEFAULT_VENDOR_DEPOSIT_SORT;
    expect(pageVendorDeposits(rows, { usage: null, sort, skip: 0, limit: 2 })).toEqual({ ids: ['e', 'd'], total: 5 });
    expect(pageVendorDeposits(rows, { usage: null, sort, skip: 4, limit: 2 })).toEqual({ ids: ['a'], total: 5 });
    expect(pageVendorDeposits(rows, { usage: 'Active', sort, skip: 0, limit: 25 })).toEqual({ ids: ['e', 'a'], total: 2 });
    expect(pageVendorDeposits(rows, { usage: null, sort, skip: 50, limit: 25 })).toEqual({ ids: [], total: 5 });
  });
});

describe('summarizeVendorDeposits', () => {
  it('excludes cancelled deposits from the sums and counts usable balances', () => {
    expect(summarizeVendorDeposits(rows)).toEqual({
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
    expect(summarizeVendorDeposits([])).toEqual({
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
