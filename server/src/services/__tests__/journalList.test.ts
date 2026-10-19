import { describe, it, expect } from 'vitest';
import { buildJournalWhere, DEFAULT_JOURNAL_SORT, JOURNAL_SORT_FIELDS, journalOrderBy } from '../journalList';
import { parseListPaging, parseSort } from '../../utils/listQuery';

describe('buildJournalWhere', () => {
  it('returns an empty filter for an empty query', () => {
    expect(buildJournalWhere({})).toEqual({ ok: true, where: {} });
  });

  it('builds status, account, date and search filters', () => {
    const r = buildJournalWhere({
      status: 'Submitted',
      accountId: 'acc-1',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      search: '  kasbon ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where.status).toBe('Submitted');
    expect(r.where.items).toEqual({ some: { accountId: 'acc-1' } });
    // Business-local (WIB) calendar days: [Oct 1 00:00 WIB, Nov 1 00:00 WIB).
    expect(r.where.date).toEqual({
      gte: new Date('2026-09-30T17:00:00.000Z'),
      lt: new Date('2026-10-31T17:00:00.000Z'),
    });
    expect(r.where.OR).toHaveLength(5);
    expect(r.where.OR?.[0]).toEqual({ entryNumber: { contains: 'kasbon', mode: 'insensitive' } });
  });

  it('includes entries stored at local midnight and at UTC midnight of the end date', () => {
    const r = buildJournalWhere({ endDate: '2026-10-04' });
    if (!r.ok) throw new Error('expected ok');
    const { lt } = r.where.date as { lt: Date };
    expect(new Date('2026-10-03T17:00:00.000Z') < lt).toBe(true); // Oct 4 00:00 WIB
    expect(new Date('2026-10-04T00:00:00.000Z') < lt).toBe(true); // Oct 4 00:00 UTC
    expect(new Date('2026-10-04T17:00:00.000Z') < lt).toBe(false); // Oct 5 00:00 WIB
  });

  it('keeps the legacy hideCancelled flag; an explicit status wins', () => {
    const legacy = buildJournalWhere({ hideCancelled: 'true' });
    expect(legacy.ok && legacy.where.status).toEqual({ not: 'Cancelled' });
    const both = buildJournalWhere({ hideCancelled: 'true', status: 'Cancelled' });
    expect(both.ok && both.where.status).toBe('Cancelled');
    const off = buildJournalWhere({ hideCancelled: 'false' });
    expect(off.ok && off.where.status).toBeUndefined();
  });

  it('rejects unknown status and malformed dates', () => {
    expect(buildJournalWhere({ status: 'Posted' })).toEqual({ ok: false, error: 'Status jurnal tidak dikenal.' });
    expect(buildJournalWhere({ startDate: '01-10-2026' })).toMatchObject({ ok: false });
    expect(buildJournalWhere({ endDate: '2026-13-45' })).toMatchObject({ ok: false });
  });

  it('ignores blank params', () => {
    expect(buildJournalWhere({ search: '   ', status: '', accountId: '' })).toEqual({ ok: true, where: {} });
  });
});

describe('journal sort', () => {
  it('defaults to newest first with a unique tie-breaker', () => {
    const sort = parseSort(undefined, JOURNAL_SORT_FIELDS, DEFAULT_JOURNAL_SORT);
    expect(journalOrderBy(sort)).toEqual([{ date: 'desc' }, { entryNumber: 'desc' }]);
  });

  it('accepts whitelisted fields and falls back otherwise', () => {
    expect(journalOrderBy(parseSort('date', JOURNAL_SORT_FIELDS, DEFAULT_JOURNAL_SORT))).toEqual([
      { date: 'asc' },
      { entryNumber: 'asc' },
    ]);
    expect(journalOrderBy(parseSort('-entryNumber', JOURNAL_SORT_FIELDS, DEFAULT_JOURNAL_SORT))).toEqual([
      { entryNumber: 'desc' },
    ]);
    expect(journalOrderBy(parseSort('narration; DROP', JOURNAL_SORT_FIELDS, DEFAULT_JOURNAL_SORT))).toEqual([
      { date: 'desc' },
      { entryNumber: 'desc' },
    ]);
  });

  it('keeps the original paging defaults (50 per page, max 200)', () => {
    expect(parseListPaging({}, { defaultLimit: 50, maxLimit: 200 })).toEqual({ page: 1, limit: 50, skip: 0 });
    expect(parseListPaging({ page: '3', limit: '500' }, { defaultLimit: 50, maxLimit: 200 })).toEqual({
      page: 3,
      limit: 200,
      skip: 400,
    });
  });
});
