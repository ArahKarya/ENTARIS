import { describe, it, expect } from 'vitest';
import { DEFAULT_TDN_SORT, parseTdnFilters, TDN_SORT_FIELDS, tdnOrderBySql } from '../temporaryDeliveryNoteList';
import { parseSort } from '../../utils/listQuery';

describe('parseTdnFilters', () => {
  it('normalises absent filters to empty strings', () => {
    expect(parseTdnFilters({})).toEqual({
      ok: true,
      filters: { status: '', partyId: '', startDate: '', endDate: '', search: '' },
    });
  });

  it('reads startDate/endDate and still accepts dateFrom/dateTo', () => {
    const a = parseTdnFilters({ status: 'Open', partyId: 'p', startDate: '2026-03-01', endDate: '2026-03-31', search: ' sjs ' });
    expect(a).toEqual({
      ok: true,
      filters: { status: 'Open', partyId: 'p', startDate: '2026-03-01', endDate: '2026-03-31', search: 'sjs' },
    });
    const b = parseTdnFilters({ dateFrom: '2026-03-01', dateTo: '2026-03-02' });
    expect(b.ok && b.filters.startDate).toBe('2026-03-01');
    expect(b.ok && b.filters.endDate).toBe('2026-03-02');
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(parseTdnFilters({ status: 'Invoiced' }).ok).toBe(false);
    expect(parseTdnFilters({ startDate: "2026-01-01'; DROP TABLE x;--" }).ok).toBe(false);
  });
});

describe('tdnOrderBySql', () => {
  it('builds the default and whitelisted orderings', () => {
    expect(tdnOrderBySql(DEFAULT_TDN_SORT)).toBe('t.date DESC, t.number DESC');
    expect(tdnOrderBySql({ field: 'customer', dir: 'asc' })).toBe('p.name ASC, t.number ASC');
    expect(tdnOrderBySql({ field: 'number', dir: 'asc' })).toBe('t.number ASC');
  });

  it('never lets an arbitrary sort value through', () => {
    const sort = parseSort('-t.id; DROP TABLE parties', TDN_SORT_FIELDS, DEFAULT_TDN_SORT);
    expect(tdnOrderBySql(sort)).toBe('t.date DESC, t.number DESC');
  });
});
