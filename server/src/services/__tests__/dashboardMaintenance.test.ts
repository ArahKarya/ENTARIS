import { describe, it, expect } from 'vitest';
import { computeMaintenanceDashboard, maintenanceBoundaries, type MaintenanceInput } from '../dashboardMaintenance';

const WIB = '+07:00';
// 2026-10-05 11:00 WIB
const NOW = new Date('2026-10-05T04:00:00.000Z');
const day = (iso: string) => new Date(`${iso}T00:00:00.000${WIB}`);
const ALL = { maintenance: true, vehicle: true, documents: true };
const empty: MaintenanceInput = { schedules: [], workOrders: [], taxes: [], insurances: [], documents: [] };
const run = (input: Partial<MaintenanceInput>, access = ALL) =>
  computeMaintenanceDashboard({ ...empty, ...input }, access, NOW, WIB);

describe('maintenanceBoundaries', () => {
  it('starts today at local midnight and spans 7 days', () => {
    const b = maintenanceBoundaries(NOW, WIB);
    expect(b.todayStart.toISOString()).toBe('2026-10-04T17:00:00.000Z');
    expect(b.weekEnd.getTime() - b.todayStart.getTime()).toBe(7 * 86400000);
  });
});

describe('computeMaintenanceDashboard', () => {
  it('counts overdue schedules by local day (due today is not overdue) and ignores inactive', () => {
    const r = run({
      schedules: [
        { id: 'a', assetId: 'x', assetName: 'Truk', nextDueAt: day('2026-10-04'), isActive: true },
        { id: 'b', assetId: 'x', assetName: 'Truk', nextDueAt: day('2026-10-05'), isActive: true },
        { id: 'c', assetId: 'x', assetName: 'Truk', nextDueAt: day('2026-10-01'), isActive: false },
        { id: 'd', assetId: 'x', assetName: 'Truk', nextDueAt: day('2026-10-20'), isActive: true },
      ],
    });
    expect(r.kpi.overdueSchedules).toBe(1);
    expect(r.kpi.overdue).toBe(1);
    expect(r.kpi.dueThisWeek).toBe(1);
    expect(r.upcoming.map((u) => [u.key, u.state])).toEqual([
      ['sch-a', 'overdue'], ['sch-b', 'today'], ['sch-d', 'scheduled'],
    ]);
    expect(r.upcoming[0].daysLeft).toBe(-1);
  });

  it('flags work orders past dueAt only while active (same rule as the GA summary)', () => {
    const r = run({
      workOrders: [
        { id: '1', code: 'WO-1', title: 'Oli', assetName: 'A', status: 'OPEN', dueAt: new Date('2026-10-05T03:00:00Z') },
        { id: '2', code: 'WO-2', title: 'Rem', assetName: 'A', status: 'DONE', dueAt: new Date('2026-09-01T00:00:00Z') },
        { id: '3', code: 'WO-3', title: 'Ban', assetName: 'A', status: 'IN_PROGRESS', dueAt: null },
        { id: '4', code: 'WO-4', title: 'Aki', assetName: 'A', status: 'ASSIGNED', dueAt: new Date('2026-10-06T03:00:00Z') },
      ],
    });
    expect(r.kpi.overdueWorkOrders).toBe(1);
    expect(r.upcoming.map((u) => u.key)).toEqual(['wo-1', 'wo-4']);
    expect(r.attention.find((a) => a.key === 'mt-wo')?.tone).toBe('danger');
  });

  it('separates expired from expiring within 30 days for taxes, insurance and documents', () => {
    const r = run({
      taxes: [
        { id: 't1', assetId: 'v', assetName: 'V', type: 'KIR', dueDate: day('2026-10-01'), status: 'ACTIVE' },
        { id: 't2', assetId: 'v', assetName: 'V', type: 'STNK_TAHUNAN', dueDate: day('2026-11-04'), status: 'ACTIVE' },
        { id: 't3', assetId: 'v', assetName: 'V', type: 'KIR', dueDate: day('2026-11-05'), status: 'ACTIVE' },
        { id: 't4', assetId: 'v', assetName: 'V', type: 'KIR', dueDate: day('2026-09-01'), status: 'PAID' },
      ],
      insurances: [{ id: 'i1', assetId: 'v', assetName: 'V', provider: 'Askrindo', endDate: day('2026-10-20'), status: 'ACTIVE' }],
      documents: [
        { id: 'd1', title: 'SIUP', assetName: null, expiryDate: day('2026-09-30'), status: 'ACTIVE' },
        { id: 'd2', title: 'NIB', assetName: null, expiryDate: day('2026-10-25'), status: 'ACTIVE' },
        { id: 'd3', title: 'Lama', assetName: null, expiryDate: day('2026-01-01'), status: 'ARCHIVED' },
        { id: 'd4', title: 'Tanpa tgl', assetName: null, expiryDate: null, status: 'ACTIVE' },
      ],
    });
    expect(r.kpi.expired).toBe(2); // t1 + d1
    expect(r.kpi.expiring).toBe(3); // t2, i1, d2
    expect(r.attention.map((a) => a.key)).toEqual([
      'mt-veh-expired', 'mt-veh-expiring', 'mt-doc-expired', 'mt-doc-expiring',
    ]);
    expect(r.attention.find((a) => a.key === 'mt-veh-expiring')?.title).toContain('2 ');
  });

  it('respects access: sources without permission are neither counted nor listed', () => {
    const input: Partial<MaintenanceInput> = {
      schedules: [{ id: 'a', assetId: 'x', assetName: 'T', nextDueAt: day('2026-10-01'), isActive: true }],
      taxes: [{ id: 't', assetId: 'v', assetName: 'V', type: 'KIR', dueDate: day('2026-10-01'), status: 'ACTIVE' }],
      documents: [{ id: 'd', title: 'D', assetName: null, expiryDate: day('2026-10-01'), status: 'ACTIVE' }],
    };
    const r = run(input, { maintenance: false, vehicle: true, documents: false });
    expect(r.kpi.overdue).toBe(1);
    expect(r.upcoming.map((u) => u.kind)).toEqual(['vehicleTax']);
  });

  it('caps upcoming at 8 and orders by due date', () => {
    const schedules = Array.from({ length: 12 }, (_, n) => ({
      id: String(n), assetId: 'x', assetName: 'T', nextDueAt: day(`2026-10-${String(20 - n).padStart(2, '0')}`), isActive: true,
    }));
    const r = run({ schedules });
    expect(r.upcoming).toHaveLength(8);
    expect(r.upcoming[0].key).toBe('sch-11');
  });

  it('returns an empty dashboard when nothing is due', () => {
    const r = run({});
    expect(r.kpi).toEqual({ overdue: 0, dueThisWeek: 0, overdueSchedules: 0, overdueWorkOrders: 0, expired: 0, expiring: 0 });
    expect(r.attention).toEqual([]);
    expect(r.upcoming).toEqual([]);
  });
});
