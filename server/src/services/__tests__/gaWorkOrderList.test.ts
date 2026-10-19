import { describe, it, expect } from 'vitest';
import {
  WO_DEFAULT_ORDER,
  buildWorkOrderWhere,
  currentMonthRange,
  workOrderOrderBy,
  workOrderSummaryWheres,
} from '../gaWorkOrderList';

const NOW = new Date('2026-10-04T05:00:00.000Z');
const ACTIVE = { status: { in: ['OPEN', 'ASSIGNED', 'IN_PROGRESS'] } };

describe('buildWorkOrderWhere', () => {
  it('returns an empty where without filters', () => {
    expect(buildWorkOrderWhere({})).toEqual({ ok: true, where: {} });
  });

  it('maps enum filters, asset and the ACTIVE pseudo status', () => {
    const r = buildWorkOrderWhere({ status: 'ACTIVE', priority: 'HIGH', type: 'CORRECTIVE', assetId: 'a1' });
    expect(r.ok && r.where).toEqual({
      AND: [ACTIVE, { priority: 'HIGH' }, { type: 'CORRECTIVE' }, { assetId: 'a1' }],
    });
  });

  it('rejects unknown enum values', () => {
    expect(buildWorkOrderWhere({ status: 'NOPE' }).ok).toBe(false);
    expect(buildWorkOrderWhere({ priority: 'X' }).ok).toBe(false);
    expect(buildWorkOrderWhere({ type: 'X' }).ok).toBe(false);
    expect(buildWorkOrderWhere({ due: 'later' }).ok).toBe(false);
    expect(buildWorkOrderWhere({ startDate: '04-10-2026' }).ok).toBe(false);
  });

  it('mine=true uses the current user and wins over assignedToId', () => {
    const r = buildWorkOrderWhere({ mine: 'true', assignedToId: 'other' }, { userId: 'me' });
    expect(r.ok && r.where).toEqual({ AND: [{ assignedToId: 'me' }] });
    const r2 = buildWorkOrderWhere({ assignedToId: 'other' }, { userId: 'me' });
    expect(r2.ok && r2.where).toEqual({ AND: [{ assignedToId: 'other' }] });
  });

  it('due filters only count active work orders', () => {
    const overdue = buildWorkOrderWhere({ due: 'overdue' }, { now: NOW });
    expect(overdue.ok && overdue.where).toEqual({ AND: [{ ...ACTIVE, dueAt: { lt: NOW } }] });
    const soon = buildWorkOrderWhere({ due: 'dueSoon' }, { now: NOW });
    expect(soon.ok && soon.where).toEqual({
      AND: [{ ...ACTIVE, dueAt: { gte: NOW, lt: new Date('2026-10-11T05:00:00.000Z') } }],
    });
  });

  it('filters the report date by business-day range (WIB by default)', () => {
    const r = buildWorkOrderWhere({ startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(r.ok && r.where).toEqual({
      AND: [
        {
          reportedAt: {
            gte: new Date('2026-10-01T00:00:00.000+07:00'),
            lt: new Date('2026-11-01T00:00:00.000+07:00'),
          },
        },
      ],
    });
  });

  it('searches code, title, component and asset', () => {
    const r = buildWorkOrderWhere({ search: ' genset ' });
    const contains = { contains: 'genset', mode: 'insensitive' };
    expect(r.ok && r.where).toEqual({
      AND: [
        {
          OR: [
            { code: contains },
            { title: contains },
            { component: contains },
            { asset: { code: contains } },
            { asset: { name: contains } },
          ],
        },
      ],
    });
  });
});

describe('workOrderOrderBy', () => {
  it('keeps the legacy order without a sort', () => {
    expect(workOrderOrderBy(null)).toBe(WO_DEFAULT_ORDER);
  });

  it('adds the code as tie-breaker and puts missing due dates last', () => {
    expect(workOrderOrderBy({ field: 'code', dir: 'asc' })).toEqual([{ code: 'asc' }]);
    expect(workOrderOrderBy({ field: 'priority', dir: 'desc' })).toEqual([{ priority: 'desc' }, { code: 'desc' }]);
    expect(workOrderOrderBy({ field: 'dueAt', dir: 'asc' })).toEqual([
      { dueAt: { sort: 'asc', nulls: 'last' } },
      { code: 'desc' },
    ]);
  });
});

describe('currentMonthRange', () => {
  it('uses the business month, not the UTC month', () => {
    // 2026-09-30 20:00 UTC is already 1 October in WIB.
    expect(currentMonthRange(new Date('2026-09-30T20:00:00.000Z'), '+07:00')).toEqual({
      gte: new Date('2026-10-01T00:00:00.000+07:00'),
      lt: new Date('2026-11-01T00:00:00.000+07:00'),
    });
  });

  it('rolls December into the next year', () => {
    expect(currentMonthRange(new Date('2026-12-15T00:00:00.000Z'), '+07:00')).toEqual({
      gte: new Date('2026-12-01T00:00:00.000+07:00'),
      lt: new Date('2027-01-01T00:00:00.000+07:00'),
    });
  });
});

describe('workOrderSummaryWheres', () => {
  it('narrows the list filter for each KPI', () => {
    const base = { assetId: 'a1' };
    const w = workOrderSummaryWheres(base, NOW);
    expect(w.active).toEqual({ AND: [base, ACTIVE] });
    expect(w.overdue).toEqual({ AND: [base, ACTIVE, { dueAt: { lt: NOW } }] });
    expect(w.doneThisMonth.AND[1]).toEqual({ status: { in: ['DONE', 'CLOSED'] } });
  });
});
