import { describe, expect, it } from 'vitest';
import {
  apiError,
  attentionItems,
  buildServiceCostSummary,
  classifyServiceCost,
  daysUntil,
  dueStateOf,
  filterServiceLogs,
  numOrNull,
  taxCost,
  oilLife,
  parseSection,
  vehicleTitle,
  type FleetRow,
} from './vehicle-model';

const TODAY = new Date(2026, 9, 4, 10, 0); // 4 Oct 2026, local

describe('dueStateOf / daysUntil', () => {
  it('uses calendar days with a 30-day window', () => {
    expect(dueStateOf('2026-10-03T00:00:00.000Z', true, TODAY)).toBe('overdue');
    expect(dueStateOf('2026-10-04', true, TODAY)).toBe('dueSoon');
    expect(dueStateOf('2026-11-03', true, TODAY)).toBe('dueSoon');
    expect(dueStateOf('2026-11-04', true, TODAY)).toBe('ok');
  });
  it('has no state for inactive records or missing dates', () => {
    expect(dueStateOf('2026-01-01', false, TODAY)).toBeNull();
    expect(dueStateOf(null, true, TODAY)).toBeNull();
  });
  it('counts days to the date', () => {
    expect(daysUntil('2026-10-14T00:00:00.000Z', TODAY)).toBe(10);
    expect(daysUntil('2026-09-24', TODAY)).toBe(-10);
    expect(daysUntil(undefined, TODAY)).toBeNull();
  });
});

describe('attentionItems', () => {
  const none = { dueDate: null, state: null };
  const row = {
    due: {
      tax: { dueDate: '2026-10-20', state: 'dueSoon' },
      stnk: none,
      kir: { dueDate: '2026-09-01', state: 'overdue' },
      insurance: { dueDate: '2026-10-10', state: 'dueSoon' },
      inspection: { dueDate: '2027-01-01', state: 'ok' },
    },
  } as Pick<FleetRow, 'due'>;
  it('lists overdue first, then due soon by date', () => {
    expect(attentionItems(row).map((i) => i.doc)).toEqual(['kir', 'insurance', 'tax']);
  });
});

describe('service costs', () => {
  it('classifies by type and description', () => {
    expect(classifyServiceCost({ jenisService: 'OLI' })).toBe('oli');
    expect(classifyServiceCost({ jenisService: 'LAINNYA', deskripsi: 'Ganti ban depan' })).toBe('ban');
    expect(classifyServiceCost({ deskripsi: 'Setel rem belakang' })).toBe('rem');
    expect(classifyServiceCost({ jenisService: 'AC' })).toBe('ac');
    expect(classifyServiceCost({ jenisService: 'PERBAIKAN', deskripsi: 'kopling' })).toBe('service');
    expect(classifyServiceCost({ jenisService: 'LAINNYA', deskripsi: 'cuci' })).toBe('lainnya');
  });

  it('sums buckets', () => {
    const s = buildServiceCostSummary([
      { jenisService: 'OLI', biaya: '100000' },
      { jenisService: 'OLI', biaya: 50000 },
      { jenisService: 'GANTI_BAN', biaya: null },
    ]);
    expect(s.total).toBe(150000);
    expect(s.count).toBe(3);
    expect(s.buckets.oli).toEqual({ amount: 150000, count: 2 });
    expect(s.buckets.ban).toEqual({ amount: 0, count: 1 });
  });

  it('filters by inclusive date range and bucket, newest first', () => {
    const logs = [
      { tanggal: '2026-07-14T00:00:00.000Z', jenisService: 'GANTI_BAN' },
      { tanggal: '2026-09-05T00:00:00.000Z', jenisService: 'SERVIS_BERKALA' },
      { tanggal: '2026-09-30T00:00:00.000Z', jenisService: 'OLI' },
    ];
    expect(filterServiceLogs(logs, {}).map((l) => l.tanggal!.slice(5, 10))).toEqual(['09-30', '09-05', '07-14']);
    expect(filterServiceLogs(logs, { startDate: '2026-09-05', endDate: '2026-09-05' })).toHaveLength(1);
    expect(filterServiceLogs(logs, { bucket: 'ban' })).toHaveLength(1);
  });
});

describe('oilLife', () => {
  it('reports remaining km and share of the interval', () => {
    expect(oilLife(47900, 52900, 48250)).toEqual({ remainingKm: 4650, pct: 93, overdue: false });
    expect(oilLife(47900, 52900, 53000)).toMatchObject({ remainingKm: -100, pct: 0, overdue: true });
    expect(oilLife(100, 100, 50).pct).toBe(0);
  });
});

describe('small helpers', () => {
  it('numOrNull', () => {
    expect(numOrNull('')).toBeNull();
    expect(numOrNull('12.5')).toBe(12.5);
    expect(numOrNull('abc')).toBeNull();
  });
  it('parseSection falls back to ringkasan', () => {
    expect(parseSection('pajak')).toBe('pajak');
    expect(parseSection('nope')).toBe('ringkasan');
    expect(parseSection(null)).toBe('ringkasan');
  });
  it('vehicleTitle prefers the plate', () => {
    expect(vehicleTitle({ noPlat: 'B 1 A', code: 'KND-1' })).toBe('B 1 A');
    expect(vehicleTitle({ noPlat: null, code: 'KND-1' })).toBe('KND-1');
  });
  it('apiError reads the API message', () => {
    expect(apiError({ response: { data: { error: 'Ditolak' } } }, 'x')).toBe('Ditolak');
    expect(apiError(new Error('Tipe dokumen tidak ditemukan'), 'x')).toBe('Tipe dokumen tidak ditemukan');
    expect(apiError(undefined, 'Gagal')).toBe('Gagal');
  });
});

describe('taxCost', () => {
  it('uses paidAmount for a paid tax', () => {
    expect(taxCost({ amount: null, paidAmount: '1500000', paidAt: '2026-05-01', status: 'PAID' })).toBe('1500000');
    expect(taxCost({ amount: '1000000', paidAmount: '1200000', paidAt: '2026-05-01', status: 'PAID' })).toBe('1200000');
  });

  it('falls back to amount when unpaid or paidAmount is missing', () => {
    expect(taxCost({ amount: '900000', paidAmount: null, paidAt: null, status: 'ACTIVE' })).toBe('900000');
    expect(taxCost({ amount: '900000', paidAmount: null, paidAt: '2026-05-01', status: 'PAID' })).toBe('900000');
    expect(taxCost({ amount: null, paidAmount: null, paidAt: null, status: 'ACTIVE' })).toBeNull();
  });
});
