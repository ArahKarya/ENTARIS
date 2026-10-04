import { describe, it, expect } from 'vitest';
import { buildMaterialRequestWhere, countByStatus, materialRequestOrderBy } from '../gaMaterialRequestList';

describe('buildMaterialRequestWhere', () => {
  it('returns an empty where without filters', () => {
    expect(buildMaterialRequestWhere({})).toEqual({ ok: true, where: {} });
  });

  it('maps status (incl. PAID), work order, asset and mine', () => {
    const r = buildMaterialRequestWhere({ status: 'PAID', workOrderId: 'w1', assetId: 'a1', mine: 'true' }, { userId: 'me' });
    expect(r.ok && r.where).toEqual({
      AND: [{ status: 'PAID' }, { workOrderId: 'w1' }, { assetId: 'a1' }, { requestedById: 'me' }],
    });
  });

  it('ignores the status for per-status counts', () => {
    const r = buildMaterialRequestWhere({ status: 'PAID' }, { ignoreStatus: true });
    expect(r).toEqual({ ok: true, where: {} });
  });

  it('rejects unknown status and malformed dates', () => {
    expect(buildMaterialRequestWhere({ status: 'DONE' }).ok).toBe(false);
    expect(buildMaterialRequestWhere({ endDate: '2026/10/01' }).ok).toBe(false);
  });

  it('filters the request date by business-day range', () => {
    const r = buildMaterialRequestWhere({ startDate: '2026-10-04', endDate: '2026-10-04' });
    expect(r.ok && r.where).toEqual({
      AND: [
        {
          requestedAt: {
            gte: new Date('2026-10-04T00:00:00.000+07:00'),
            lt: new Date('2026-10-05T00:00:00.000+07:00'),
          },
        },
      ],
    });
  });

  it('searches code, target, asset, work order and item names', () => {
    const r = buildMaterialRequestWhere({ search: 'bearing' });
    const contains = { contains: 'bearing', mode: 'insensitive' };
    expect(r.ok && r.where).toEqual({
      AND: [
        {
          OR: [
            { code: contains },
            { machineTarget: contains },
            { asset: { code: contains } },
            { asset: { name: contains } },
            { workOrder: { code: contains } },
            { items: { some: { itemName: contains } } },
          ],
        },
      ],
    });
  });
});

describe('materialRequestOrderBy', () => {
  it('uses the code as tie-breaker', () => {
    expect(materialRequestOrderBy({ field: 'code', dir: 'asc' })).toEqual([{ code: 'asc' }]);
    expect(materialRequestOrderBy({ field: 'requestedAt', dir: 'desc' })).toEqual([
      { requestedAt: 'desc' },
      { code: 'desc' },
    ]);
  });
});

describe('countByStatus', () => {
  it('fills every status and ignores unknown ones', () => {
    const out = countByStatus([
      { status: 'PAID', _count: { _all: 2 } },
      { status: 'WEIRD', _count: { _all: 9 } },
    ]);
    expect(out).toEqual({ DRAFT: 0, SUBMITTED: 0, APPROVED: 0, REJECTED: 0, FULFILLED: 0, PAID: 2, CANCELLED: 0 });
  });
});
