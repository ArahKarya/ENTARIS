import { describe, expect, it } from 'vitest';
import {
  countActive,
  filterMasterRows,
  hasErrors,
  parseOptionalNonNegative,
  validateCostStandard,
  validateMachine,
  validateProcess,
} from './master-data';

const rows = [
  { id: '1', name: 'Drying', code: 'DRY', isActive: true },
  { id: '2', name: 'Huller', code: null, isActive: false },
  { id: '3', name: 'Polishing', code: 'POL', isActive: true },
];

describe('filterMasterRows', () => {
  const fields = (r: (typeof rows)[number]) => [r.name, r.code];
  it('filters by status and search', () => {
    expect(filterMasterRows(rows, { status: 'active' }, fields).map((r) => r.id)).toEqual(['1', '3']);
    expect(filterMasterRows(rows, { status: 'inactive' }, fields).map((r) => r.id)).toEqual(['2']);
    expect(filterMasterRows(rows, { search: 'pol' }, fields).map((r) => r.id)).toEqual(['3']);
    expect(filterMasterRows(rows, { search: 'HUL', status: 'active' }, fields)).toEqual([]);
    expect(filterMasterRows(rows, { search: ' ' }, fields)).toHaveLength(3);
  });

  it('counts active rows', () => {
    expect(countActive(rows)).toEqual({ total: 3, active: 2 });
  });
});

describe('validation', () => {
  it('parses optional non-negative numbers', () => {
    expect(parseOptionalNonNegative('')).toEqual({ value: null });
    expect(parseOptionalNonNegative('12,5')).toEqual({ value: 12.5 });
    expect(parseOptionalNonNegative('-1').error).toBeDefined();
    expect(parseOptionalNonNegative('abc').error).toBeDefined();
  });

  it('validates cost standards', () => {
    expect(validateCostStandard({ name: '', defaultRate: '' })).toEqual({ name: 'Nama standar wajib diisi.', defaultRate: 'Tarif wajib diisi.' });
    expect(validateCostStandard({ name: 'Listrik', defaultRate: '-5' }).defaultRate).toMatch(/negatif/);
    expect(hasErrors(validateCostStandard({ name: 'Listrik', defaultRate: '0' }))).toBe(false);
  });

  it('validates processes', () => {
    expect(validateProcess({ name: ' ', sortOrder: '0' }).name).toBeDefined();
    expect(validateProcess({ name: 'Drying', sortOrder: '1.5' }).sortOrder).toBeDefined();
    expect(validateProcess({ name: 'Drying', sortOrder: '' })).toEqual({});
  });

  it('validates machines', () => {
    expect(validateMachine({ code: '', name: '', idealRatePerHour: '', unit: 'kg' })).toEqual({
      code: 'Kode mesin wajib diisi.',
      name: 'Nama mesin wajib diisi.',
    });
    expect(validateMachine({ code: 'M1', name: 'Pellet', idealRatePerHour: 'x', unit: 'kg' }).idealRatePerHour).toBeDefined();
    expect(validateMachine({ code: 'M1', name: 'Pellet', idealRatePerHour: '1000', unit: '' })).toEqual({});
  });
});
