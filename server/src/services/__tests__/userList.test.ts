import { describe, it, expect } from 'vitest';
import { buildUserOrderBy, buildUserWhere, summarizeUsers } from '../userList';

describe('buildUserWhere', () => {
  it('is empty without filters (legacy)', () => {
    expect(buildUserWhere({})).toEqual({ ok: true, where: {} });
  });

  it('searches name, email and username like the legacy route', () => {
    const r = buildUserWhere({ search: 'adm' });
    expect(r).toEqual({
      ok: true,
      where: {
        OR: [
          { fullName: { contains: 'adm', mode: 'insensitive' } },
          { email: { contains: 'adm', mode: 'insensitive' } },
          { username: { contains: 'adm', mode: 'insensitive' } },
        ],
      },
    });
  });

  it('ignores blank search', () => {
    expect(buildUserWhere({ search: '   ' })).toEqual({ ok: true, where: {} });
  });

  it('filters by role and status', () => {
    expect(buildUserWhere({ role: 'Admin', status: 'inactive' })).toEqual({
      ok: true,
      where: { role: 'Admin', isActive: false },
    });
    expect(buildUserWhere({ status: 'active' })).toEqual({ ok: true, where: { isActive: true } });
  });

  it('rejects unknown status', () => {
    expect(buildUserWhere({ status: 'locked' }).ok).toBe(false);
  });
});

describe('buildUserOrderBy', () => {
  it('keeps legacy ordering without sort', () => {
    expect(buildUserOrderBy(undefined)).toEqual([{ createdAt: 'desc' }]);
  });

  it('applies whitelisted sort with id tie-breaker', () => {
    expect(buildUserOrderBy('fullName')).toEqual([{ fullName: 'asc' }, { id: 'asc' }]);
    expect(buildUserOrderBy('-lastLoginAt')).toEqual([{ lastLoginAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }]);
  });

  it('falls back to newest first for unknown fields', () => {
    expect(buildUserOrderBy('passwordHash')).toEqual([{ createdAt: 'desc' }, { id: 'desc' }]);
  });
});

describe('summarizeUsers', () => {
  it('counts active, inactive and telegram links', () => {
    expect(
      summarizeUsers([
        { isActive: true, telegramChatId: '1' },
        { isActive: false, telegramChatId: null },
        { isActive: true, telegramChatId: null },
      ]),
    ).toEqual({ total: 3, active: 2, inactive: 1, telegramLinked: 1 });
  });
});
