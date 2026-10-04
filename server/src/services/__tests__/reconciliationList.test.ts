import { describe, it, expect } from 'vitest';
import {
  buildReconciliationWhere,
  DEFAULT_RECONCILIATION_SORT,
  RECONCILIATION_SORT_FIELDS,
  reconciliationOrderBy,
} from '../reconciliationList';
import { parseSort } from '../../utils/listQuery';

describe('buildReconciliationWhere', () => {
  it('returns an empty filter for an empty query (legacy callers)', () => {
    expect(buildReconciliationWhere({})).toEqual({ ok: true, where: {} });
  });

  it('maps account, status, local-day statement date range and search', () => {
    const r = buildReconciliationWhere({
      accountId: 'acc-1',
      status: 'Draft',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      search: ' BCA ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where.accountId).toBe('acc-1');
    expect(r.where.status).toBe('Draft');
    // WIB (+07:00) calendar days, half-open.
    expect(r.where.statementDate).toEqual({
      gte: new Date('2026-09-30T17:00:00.000Z'),
      lt: new Date('2026-10-31T17:00:00.000Z'),
    });
    expect(r.where.OR).toEqual([
      { account: { name: { contains: 'BCA', mode: 'insensitive' } } },
      { account: { accountNumber: { contains: 'BCA', mode: 'insensitive' } } },
      { notes: { contains: 'BCA', mode: 'insensitive' } },
    ]);
  });

  it('accepts an open-ended date range', () => {
    const r = buildReconciliationWhere({ endDate: '2026-10-31' });
    expect(r).toEqual({ ok: true, where: { statementDate: { lt: new Date('2026-10-31T17:00:00.000Z') } } });
  });

  it('rejects an unknown status and malformed dates', () => {
    expect(buildReconciliationWhere({ status: 'Posted' })).toEqual({
      ok: false,
      error: 'Status rekonsiliasi tidak dikenal.',
    });
    expect(buildReconciliationWhere({ startDate: '01-10-2026' }).ok).toBe(false);
  });
});

describe('reconciliationOrderBy', () => {
  it('defaults to statement date descending (previous order) with stable tie-breakers', () => {
    expect(reconciliationOrderBy(DEFAULT_RECONCILIATION_SORT)).toEqual([
      { statementDate: 'desc' },
      { createdAt: 'desc' },
      { id: 'desc' },
    ]);
  });

  it('sorts by account name through the relation', () => {
    const sort = parseSort('account', RECONCILIATION_SORT_FIELDS, DEFAULT_RECONCILIATION_SORT);
    expect(reconciliationOrderBy(sort)[0]).toEqual({ account: { name: 'asc' } });
  });

  it('falls back to the default for unknown fields', () => {
    const sort = parseSort('-difference', RECONCILIATION_SORT_FIELDS, DEFAULT_RECONCILIATION_SORT);
    expect(sort).toEqual(DEFAULT_RECONCILIATION_SORT);
  });

  it('sorts amounts with the statement date as tie-breaker', () => {
    expect(reconciliationOrderBy({ field: 'statementBalance', dir: 'asc' })).toEqual([
      { statementBalance: 'asc' },
      { statementDate: 'desc' },
      { createdAt: 'desc' },
      { id: 'asc' },
    ]);
  });
});
