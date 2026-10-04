import { describe, expect, it } from 'vitest';
import {
  apiErrorMessage,
  calibrationDue,
  conditionMeta,
  daysUntil,
  nearestActiveRental,
  numOrNull,
  optionLabel,
  OWNERSHIP_OPTIONS,
  rentalExpiry,
  toAssetListParams,
} from './asset-model';

const TODAY = new Date(2026, 9, 4, 15, 30); // 4 Okt 2026, afternoon local time

describe('toAssetListParams', () => {
  it('maps search to q and asks for the paginated shape with thumbnails', () => {
    expect(toAssetListParams({ page: 2, limit: 25, search: 'timbang', status: 'ACTIVE', sort: '-name' })).toEqual({
      page: 2,
      limit: 25,
      q: 'timbang',
      status: 'ACTIVE',
      sort: '-name',
      paginated: '1',
      thumb: '1',
    });
  });

  it('omits q when there is no search', () => {
    expect(toAssetListParams({ page: 1, limit: 25 })).toEqual({ page: 1, limit: 25, paginated: '1', thumb: '1' });
  });
});

describe('daysUntil', () => {
  it('reads server dates (UTC midnight) as calendar dates', () => {
    expect(daysUntil('2026-10-04T00:00:00.000Z', TODAY)).toBe(0);
    expect(daysUntil('2026-10-20T00:00:00.000Z', TODAY)).toBe(16);
    expect(daysUntil('2026-09-15', TODAY)).toBe(-19);
  });

  it('returns null for missing or invalid dates', () => {
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil('bukan-tanggal', TODAY)).toBeNull();
  });
});

describe('rentalExpiry', () => {
  it('flags an active contract past its end date', () => {
    expect(rentalExpiry({ status: 'AKTIF', tanggalAkhir: '2026-09-15T00:00:00.000Z' }, TODAY)).toEqual({
      state: 'overdue',
      days: -19,
      label: 'Lewat masa sewa 19 hari',
    });
  });

  it('warns within 60 days and on the last day', () => {
    expect(rentalExpiry({ status: 'AKTIF', tanggalAkhir: '2026-10-31' }, TODAY)?.label).toBe('Berakhir 27 hari lagi');
    expect(rentalExpiry({ status: 'AKTIF', tanggalAkhir: '2026-12-03' }, TODAY)?.state).toBe('dueSoon');
    expect(rentalExpiry({ status: 'AKTIF', tanggalAkhir: '2026-10-04' }, TODAY)?.label).toBe('Berakhir hari ini');
  });

  it('is ok further out and absent for ended contracts', () => {
    expect(rentalExpiry({ status: 'AKTIF', tanggalAkhir: '2027-12-31' }, TODAY)?.state).toBe('ok');
    expect(rentalExpiry({ status: 'BERAKHIR', tanggalAkhir: '2024-08-31' }, TODAY)).toBeNull();
  });
});

describe('calibrationDue', () => {
  it('derives overdue / due soon (30 days) / ok', () => {
    expect(calibrationDue('2026-08-01T00:00:00.000Z', TODAY)).toMatchObject({ state: 'overdue', label: 'Lewat jatuh tempo 64 hari' });
    expect(calibrationDue('2026-10-20T00:00:00.000Z', TODAY)).toMatchObject({ state: 'dueSoon', label: 'Jatuh tempo 16 hari lagi' });
    expect(calibrationDue('2026-11-03', TODAY)?.state).toBe('dueSoon');
    expect(calibrationDue('2026-11-04', TODAY)?.state).toBe('ok');
    expect(calibrationDue(null, TODAY)).toBeNull();
  });
});

describe('nearestActiveRental', () => {
  it('picks the active contract that ends first', () => {
    const rentals = [
      { id: 'a', status: 'AKTIF', tanggalAkhir: '2027-01-01T00:00:00.000Z' },
      { id: 'b', status: 'BERAKHIR', tanggalAkhir: '2025-01-01T00:00:00.000Z' },
      { id: 'c', status: 'AKTIF', tanggalAkhir: '2026-11-01T00:00:00.000Z' },
    ];
    expect(nearestActiveRental(rentals)?.id).toBe('c');
    expect(nearestActiveRental([rentals[1]])).toBeNull();
  });
});

describe('labels and parsing', () => {
  it('labels conditions with a tone', () => {
    expect(conditionMeta('BROKEN')).toEqual({ label: 'Rusak', tone: 'danger' });
    expect(conditionMeta('X')).toEqual({ label: 'X', tone: 'neutral' });
  });

  it('labels enum options', () => {
    expect(optionLabel(OWNERSHIP_OPTIONS, 'SEWA_MASUK')).toBe('Disewa (sewa masuk)');
    expect(optionLabel(OWNERSHIP_OPTIONS, null)).toBe('-');
  });

  it('parses optional numbers', () => {
    expect(numOrNull('')).toBeNull();
    expect(numOrNull('12.5')).toBe(12.5);
    expect(numOrNull('abc')).toBeNull();
  });

  it('reads API error messages', () => {
    expect(apiErrorMessage({ response: { data: { error: 'Kode sudah dipakai.' } } }, 'Gagal')).toBe('Kode sudah dipakai.');
    expect(apiErrorMessage(new Error('x'), 'Gagal')).toBe('Gagal');
  });
});
