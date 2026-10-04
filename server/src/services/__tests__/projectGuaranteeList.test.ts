import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildProjectGuaranteeWhere,
  businessToday,
  DEFAULT_PROJECT_GUARANTEE_SORT,
  deriveDueState,
  dueBoundaries,
  guaranteeFigures,
  pageGuarantees,
  sortGuarantees,
  summarizeProjectGuarantees,
  toGuaranteeLightRow,
  type GuaranteeLightRow,
  type GuaranteeLightSource,
} from '../projectGuaranteeList';

const WIB = '+07:00';
// 2026-10-04 10:00 WIB
const NOW = new Date('2026-10-04T03:00:00.000Z');
const bounds = dueBoundaries(NOW, WIB);

const settle = (ret: string | number, forfeit: string | number, isCancelled = false) => ({
  returnAmount: new Prisma.Decimal(ret),
  forfeitAmount: new Prisma.Decimal(forfeit),
  isCancelled,
});

const src = (over: Partial<GuaranteeLightSource> = {}): GuaranteeLightSource => ({
  id: 'g1',
  guaranteeNumber: 'UJ-202610-0001',
  date: new Date('2026-10-01T00:00:00.000Z'),
  expectedReturnDate: null,
  status: 'Disetor',
  amount: new Prisma.Decimal('1000'),
  projectName: 'Proyek A',
  party: { name: 'PT A' },
  settlements: [],
  ...over,
});

const rows: GuaranteeLightRow[] = [
  // overdue
  toGuaranteeLightRow(
    src({ id: 'a', guaranteeNumber: 'UJ-01', date: new Date('2026-03-10'), amount: '25000', expectedReturnDate: new Date('2026-06-30'), party: { name: 'budi' } }),
    bounds,
  ),
  // due soon, partly settled
  toGuaranteeLightRow(
    src({
      id: 'b',
      guaranteeNumber: 'UJ-02',
      date: new Date('2026-05-02'),
      amount: '50000',
      expectedReturnDate: new Date('2026-10-20'),
      party: { name: 'Andi' },
      settlements: [settle('10000', '5000'), settle('1000', '0', true)],
    }),
    bounds,
  ),
  // settled
  toGuaranteeLightRow(
    src({
      id: 'c',
      guaranteeNumber: 'UJ-03',
      date: new Date('2026-05-02'),
      amount: '10000',
      status: 'Selesai',
      expectedReturnDate: new Date('2026-08-01'),
      party: { name: 'Citra' },
      settlements: [settle('10000', '0')],
    }),
    bounds,
  ),
  // cancelled, no due date
  toGuaranteeLightRow(
    src({ id: 'd', guaranteeNumber: 'UJ-04', date: new Date('2026-09-01'), amount: '3000', status: 'Dibatalkan', party: { name: 'Dewi' } }),
    bounds,
  ),
  // open, far due date
  toGuaranteeLightRow(
    src({ id: 'e', guaranteeNumber: 'UJ-05', date: new Date('2026-09-20'), amount: '7500', expectedReturnDate: new Date('2026-12-31'), party: { name: 'Eka' } }),
    bounds,
  ),
];

describe('businessToday / dueBoundaries', () => {
  it('uses the business calendar day, not the UTC day', () => {
    // 2026-10-04 23:30 UTC is already 2026-10-05 06:30 WIB.
    expect(businessToday(new Date('2026-10-04T23:30:00.000Z'), WIB)).toBe('2026-10-05');
    expect(businessToday(NOW, WIB)).toBe('2026-10-04');
    expect(businessToday(new Date('2026-10-04T02:00:00.000Z'), '-05:00')).toBe('2026-10-03');
  });

  it('starts today at local midnight and ends the due-soon window after day +30', () => {
    expect(bounds.todayStart.toISOString()).toBe('2026-10-03T17:00:00.000Z');
    expect(bounds.soonEnd.toISOString()).toBe('2026-11-03T17:00:00.000Z');
  });
});

describe('deriveDueState', () => {
  it('flags open guarantees due before today as overdue', () => {
    expect(deriveDueState('Disetor', new Date('2026-10-03T00:00:00.000Z'), bounds)).toBe('overdue');
  });

  it('treats a guarantee due today (stored at UTC midnight) as due soon, not overdue', () => {
    expect(deriveDueState('Disetor', new Date('2026-10-04T00:00:00.000Z'), bounds)).toBe('dueSoon');
  });

  it('includes day +30 and excludes day +31 from due soon', () => {
    expect(deriveDueState('Disetor', new Date('2026-11-03T00:00:00.000Z'), bounds)).toBe('dueSoon');
    expect(deriveDueState('Disetor', new Date('2026-11-04T00:00:00.000Z'), bounds)).toBeNull();
  });

  it('ignores settled, cancelled and undated guarantees', () => {
    const past = new Date('2026-01-01');
    expect(deriveDueState('Selesai', past, bounds)).toBeNull();
    expect(deriveDueState('Dibatalkan', past, bounds)).toBeNull();
    expect(deriveDueState('Disetor', null, bounds)).toBeNull();
  });
});

describe('guaranteeFigures', () => {
  it('sums only active settlements without float drift', () => {
    expect(guaranteeFigures('0.3', 'Disetor', [settle('0.1', '0.1'), settle('5', '0', true)])).toEqual({
      totalReturned: 0.1,
      totalForfeited: 0.1,
      outstanding: 0.1,
    });
  });

  it('reports zero outstanding for a cancelled guarantee', () => {
    expect(guaranteeFigures('1000', 'Dibatalkan', [])).toEqual({ totalReturned: 0, totalForfeited: 0, outstanding: 0 });
  });
});

describe('buildProjectGuaranteeWhere', () => {
  it('returns an empty where without filters', () => {
    expect(buildProjectGuaranteeWhere({}, NOW)).toEqual({ ok: true, where: {} });
  });

  it('rejects unknown status, due state and guarantee type', () => {
    expect(buildProjectGuaranteeWhere({ status: 'Paid' }, NOW).ok).toBe(false);
    expect(buildProjectGuaranteeWhere({ due: 'later' }, NOW).ok).toBe(false);
    expect(buildProjectGuaranteeWhere({ guaranteeType: 'Tender' }, NOW).ok).toBe(false);
  });

  it('rejects malformed dates', () => {
    expect(buildProjectGuaranteeWhere({ startDate: '2026-13-01' }, NOW)).toEqual({
      ok: false,
      error: 'Format tanggal harus YYYY-MM-DD.',
    });
    expect(buildProjectGuaranteeWhere({ endDate: '04/10/2026' }, NOW).ok).toBe(false);
  });

  it('combines status, type, party, deposit date range and search', () => {
    const r = buildProjectGuaranteeWhere(
      {
        status: 'Disetor',
        guaranteeType: 'Pelaksanaan',
        partyId: 'p1',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        search: ' gudang ',
      },
      NOW,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const and = r.where.AND as Prisma.ProjectGuaranteeWhereInput[];
    expect(and).toContainEqual({ status: 'Disetor' });
    expect(and).toContainEqual({ guaranteeType: 'Pelaksanaan' });
    expect(and).toContainEqual({ partyId: 'p1' });
    const date = and.find((c) => 'date' in c)?.date as { gte: Date; lt: Date };
    expect(date.gte).toBeInstanceOf(Date);
    expect(date.lt.getTime() - date.gte.getTime()).toBe(31 * 24 * 60 * 60 * 1000);
    const search = and.find((c) => 'OR' in c)?.OR as Prisma.ProjectGuaranteeWhereInput[];
    expect(search).toHaveLength(4);
    expect(search[0]).toEqual({ guaranteeNumber: { contains: 'gudang', mode: 'insensitive' } });
  });

  it('maps due states to open guarantees with matching expected return dates', () => {
    const overdue = buildProjectGuaranteeWhere({ due: 'overdue' }, NOW);
    const soon = buildProjectGuaranteeWhere({ due: 'dueSoon' }, NOW);
    expect(overdue.ok && overdue.where.AND).toEqual([
      { status: 'Disetor', expectedReturnDate: { lt: dueBoundaries(NOW).todayStart } },
    ]);
    expect(soon.ok && soon.where.AND).toEqual([
      {
        status: 'Disetor',
        expectedReturnDate: { gte: dueBoundaries(NOW).todayStart, lt: dueBoundaries(NOW).soonEnd },
      },
    ]);
  });

  it('keeps an explicit status alongside the due filter (AND, never overwritten)', () => {
    const r = buildProjectGuaranteeWhere({ status: 'Selesai', due: 'overdue' }, NOW);
    expect(r.ok && (r.where.AND as unknown[]).length).toBe(2);
  });
});

describe('toGuaranteeLightRow', () => {
  it('derives figures and due state', () => {
    expect(rows[1]).toMatchObject({ outstanding: 35000, totalReturned: 10000, totalForfeited: 5000, dueState: 'dueSoon', partyName: 'Andi' });
    expect(rows[0].dueState).toBe('overdue');
    expect(rows[3]).toMatchObject({ outstanding: 0, dueState: null, partyName: 'Dewi' });
  });
});

describe('sortGuarantees / pageGuarantees', () => {
  const ids = (list: GuaranteeLightRow[]) => list.map((r) => r.id);

  it('defaults to date desc with the document number as a stable tie-breaker', () => {
    expect(ids(sortGuarantees(rows, DEFAULT_PROJECT_GUARANTEE_SORT))).toEqual(['e', 'd', 'c', 'b', 'a']);
  });

  it('sorts by party name case-insensitively', () => {
    expect(ids(sortGuarantees(rows, { field: 'party', dir: 'asc' }))).toEqual(['b', 'a', 'c', 'd', 'e']);
  });

  it('sorts by outstanding', () => {
    expect(ids(sortGuarantees(rows, { field: 'outstanding', dir: 'desc' }))).toEqual(['b', 'a', 'e', 'd', 'c']);
  });

  it('keeps rows without an expected return date last in both directions', () => {
    expect(ids(sortGuarantees(rows, { field: 'expectedReturnDate', dir: 'asc' }))).toEqual(['a', 'c', 'b', 'e', 'd']);
    expect(ids(sortGuarantees(rows, { field: 'expectedReturnDate', dir: 'desc' }))).toEqual(['e', 'b', 'c', 'a', 'd']);
  });

  it('slices a page and reports the full total', () => {
    expect(pageGuarantees(rows, { sort: DEFAULT_PROJECT_GUARANTEE_SORT, skip: 2, limit: 2 })).toEqual({
      ids: ['c', 'b'],
      total: 5,
    });
    expect(pageGuarantees(rows, { sort: DEFAULT_PROJECT_GUARANTEE_SORT, skip: 10, limit: 2 })).toEqual({ ids: [], total: 5 });
  });

  it('does not mutate the input', () => {
    const before = ids(rows);
    sortGuarantees(rows, { field: 'amount', dir: 'asc' });
    expect(ids(rows)).toEqual(before);
  });
});

describe('summarizeProjectGuarantees', () => {
  it('matches the legacy totals (cancelled excluded) and adds due-date KPIs', () => {
    expect(summarizeProjectGuarantees(rows)).toEqual({
      count: 5,
      cancelledCount: 1,
      activeCount: 3,
      settledCount: 1,
      totalDeposited: 92500,
      totalReturned: 20000,
      totalForfeited: 5000,
      totalOutstanding: 67500,
      overdueCount: 1,
      overdueOutstanding: 25000,
      dueSoonCount: 1,
      dueSoonOutstanding: 35000,
    });
  });

  it('returns zeros for an empty list', () => {
    expect(summarizeProjectGuarantees([])).toMatchObject({ count: 0, totalOutstanding: 0, overdueCount: 0 });
  });
});
