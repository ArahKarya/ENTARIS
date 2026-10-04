import { describe, expect, it } from 'vitest';
import { canUploadPhoto, intervalLabel, scheduleDueState, woActions, woDueState } from './wo-meta';
import { compareNullable, includesText, pageRows, sortRows } from './local-list';
import { estimatedTotal, isItemLocked, mrActions } from '@/pages/ga/materialRequest/types';

const NOW = new Date('2026-10-04T05:00:00.000Z');

describe('woDueState', () => {
  it('flags overdue and due-soon active work only', () => {
    expect(woDueState({ status: 'OPEN', dueAt: '2026-10-01T00:00:00.000Z' }, NOW)).toBe('overdue');
    expect(woDueState({ status: 'IN_PROGRESS', dueAt: '2026-10-08T00:00:00.000Z' }, NOW)).toBe('dueSoon');
    expect(woDueState({ status: 'ASSIGNED', dueAt: '2026-11-01T00:00:00.000Z' }, NOW)).toBeNull();
    expect(woDueState({ status: 'DONE', dueAt: '2026-10-01T00:00:00.000Z' }, NOW)).toBeNull();
    expect(woDueState({ status: 'OPEN', dueAt: null }, NOW)).toBeNull();
  });

  it('ignores inactive schedules', () => {
    expect(scheduleDueState({ isActive: false, nextDueAt: '2026-09-01' }, NOW)).toBeNull();
    expect(scheduleDueState({ isActive: true, nextDueAt: '2026-09-01' }, NOW)).toBe('overdue');
  });
});

describe('woActions', () => {
  it('mirrors the server lifecycle rules', () => {
    expect(woActions('OPEN')).toMatchObject({ assign: true, start: false, complete: false, cancel: true });
    expect(woActions('ASSIGNED')).toMatchObject({ assign: true, start: true, complete: true, cancel: true });
    expect(woActions('IN_PROGRESS')).toMatchObject({ assign: false, start: false, complete: true, cancel: true });
    // Server refuses to cancel DONE.
    expect(woActions('DONE')).toMatchObject({ close: true, cancel: false, addParts: true });
    expect(woActions('CLOSED')).toMatchObject({ close: false, cancel: false, addParts: false, requestMaterial: false });
  });

  it('allows photos only for the reporter or technician on an open WO under the limit', () => {
    const wo = { status: 'IN_PROGRESS' as const, reportedById: 'r', assignedToId: 't', photos: [] };
    expect(canUploadPhoto(wo, 't')).toBe(true);
    expect(canUploadPhoto(wo, 'r')).toBe(true);
    expect(canUploadPhoto(wo, 'x')).toBe(false);
    expect(canUploadPhoto({ ...wo, status: 'CLOSED' }, 't')).toBe(false);
    const six = Array.from({ length: 6 }, (_, i) => ({ id: String(i), filePath: '', type: 'BEFORE' as const, caption: null }));
    expect(canUploadPhoto({ ...wo, photos: six }, 't')).toBe(false);
  });
});

describe('intervalLabel', () => {
  it('describes the interval unit', () => {
    expect(intervalLabel({ intervalDays: 30, intervalHours: null, intervalKm: null })).toBe('Setiap 30 hari');
    expect(intervalLabel({ intervalDays: null, intervalHours: 500, intervalKm: null })).toBe('Setiap 500 jam operasi');
    expect(intervalLabel({ intervalDays: null, intervalHours: null, intervalKm: null })).toBe('-');
  });
});

describe('local list helpers', () => {
  const rows = [{ v: 2 }, { v: null }, { v: 1 }];
  it('sorts with nulls last and pages', () => {
    const sorted = sortRows(rows, { id: 'v', desc: false }, { v: (a, b) => compareNullable(a.v, b.v) });
    expect(sorted.map((r) => r.v)).toEqual([1, 2, null]);
    expect(sortRows(rows, null, {})).toEqual(rows);
    expect(pageRows([1, 2, 3, 4, 5], 2, 2)).toEqual([3, 4]);
  });
  it('matches text case-insensitively', () => {
    expect(includesText(['Genset Kantor', null], 'genset')).toBe(true);
    expect(includesText(['Dryer'], 'genset')).toBe(false);
    expect(includesText([], '  ')).toBe(true);
  });
});

describe('material request rules', () => {
  it('allows lifecycle actions per status (PAID is terminal)', () => {
    expect(mrActions('DRAFT')).toMatchObject({ submit: true, cancel: true, approve: false });
    expect(mrActions('SUBMITTED')).toMatchObject({ approve: true, reject: true, cancel: true });
    expect(mrActions('APPROVED')).toMatchObject({ receive: true, cancel: true });
    expect(mrActions('PAID')).toEqual({ submit: false, approve: false, reject: false, cancel: false, receive: false });
  });
  it('locks received items and closed MRs, totals the estimate', () => {
    expect(isItemLocked({ procurementStatus: 'RECEIVED' }, 'APPROVED')).toBe(true);
    expect(isItemLocked({ procurementStatus: 'ORDERED' }, 'REJECTED')).toBe(true);
    expect(isItemLocked({ procurementStatus: 'ORDERED' }, 'APPROVED')).toBe(false);
    expect(estimatedTotal([{ unitPrice: '1500', quantity: '2' }, { unitPrice: '0', quantity: '9' }])).toBe(3000);
  });
});
