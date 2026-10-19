import { describe, it, expect } from 'vitest';
import { DEFAULT_SERVICE_ITEM_SORT, buildServiceItemWhere, serviceItemOrderBy } from '../serviceItemList';

describe('buildServiceItemWhere', () => {
  it('maps isActive and search', () => {
    const r = buildServiceItemWhere({ isActive: 'false', search: 'maklon' });
    expect(r.ok && r.where).toEqual({
      isActive: false,
      OR: [
        { code: { contains: 'maklon', mode: 'insensitive' } },
        { name: { contains: 'maklon', mode: 'insensitive' } },
      ],
    });
  });

  it('rejects an invalid isActive', () => {
    expect(buildServiceItemWhere({ isActive: '1' }).ok).toBe(false);
  });
});

describe('serviceItemOrderBy', () => {
  it('sorts by code by default and breaks ties on code', () => {
    expect(serviceItemOrderBy(DEFAULT_SERVICE_ITEM_SORT)).toEqual([{ code: 'asc' }]);
    expect(serviceItemOrderBy({ field: 'name', dir: 'desc' })).toEqual([{ name: 'desc' }, { code: 'asc' }]);
    expect(serviceItemOrderBy({ field: 'defaultRate', dir: 'asc' })).toEqual([
      { defaultRate: { sort: 'asc', nulls: 'last' } },
      { code: 'asc' },
    ]);
  });
});
