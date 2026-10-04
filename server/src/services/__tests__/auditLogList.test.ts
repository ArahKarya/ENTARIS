import { describe, it, expect } from 'vitest';
import { buildAuditLogWhere, buildAuditOrderBy, summarizeAuditActions } from '../auditLogList';

describe('buildAuditLogWhere', () => {
  it('is empty without filters (legacy)', () => {
    expect(buildAuditLogWhere({})).toEqual({ ok: true, where: {} });
  });

  it('keeps legacy user/action/entityType semantics', () => {
    expect(buildAuditLogWhere({ userId: 'u1', action: 'UPDATE', entityType: 'User' })).toEqual({
      ok: true,
      where: { userId: 'u1', action: 'UPDATE', entityType: { contains: 'User', mode: 'insensitive' } },
    });
  });

  it('searches entity id', () => {
    expect(buildAuditLogWhere({ search: 'abc' })).toEqual({
      ok: true,
      where: { entityId: { contains: 'abc', mode: 'insensitive' } },
    });
  });

  it('uses business-day boundaries for dates', () => {
    const r = buildAuditLogWhere({ startDate: '2026-10-01', endDate: '2026-10-02' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const range = r.where.createdAt as { gte: Date; lt: Date };
    expect(range.gte.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(range.lt.toISOString()).toBe('2026-10-02T17:00:00.000Z');
  });

  it('rejects malformed dates', () => {
    expect(buildAuditLogWhere({ startDate: '01/10/2026' }).ok).toBe(false);
  });
});

describe('buildAuditOrderBy', () => {
  it('keeps legacy ordering without sort', () => {
    expect(buildAuditOrderBy(undefined)).toEqual([{ createdAt: 'desc' }]);
  });

  it('adds tie-breakers to explicit sorts', () => {
    expect(buildAuditOrderBy('createdAt')).toEqual([{ createdAt: 'asc' }, { id: 'asc' }]);
    expect(buildAuditOrderBy('-action')).toEqual([{ action: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }]);
  });
});

describe('summarizeAuditActions', () => {
  it('totals per action', () => {
    expect(
      summarizeAuditActions([
        { action: 'CREATE', _count: { _all: 3 } },
        { action: 'LOGIN', _count: { _all: 2 } },
      ]),
    ).toEqual({ total: 5, byAction: { CREATE: 3, LOGIN: 2 } });
  });
});
