import { describe, expect, it } from 'vitest';
import {
  EXPORT_COLUMNS,
  escapeCsv,
  groupPreviewByCategory,
  importTemplateCsv,
  monthLabel,
  parseFixedAssetImport,
  previousMonth,
  splitCsvLine,
  toFixedAssetCsv,
  toImportPayload,
} from './fixed-asset-utils';
import type { CoaOption, FixedAssetRow } from './types';

const coa: CoaOption[] = [
  { id: 'a-16', accountNumber: '1.6.3', name: 'Kendaraan' },
  { id: 'a-17', accountNumber: '1.7.2', name: 'Akm Kendaraan' },
  { id: 'a-6', accountNumber: '6.22', name: 'Beban Penyusutan Kendaraan' },
];

const asset = (patch: Partial<FixedAssetRow> = {}): FixedAssetRow => ({
  id: 'fa1',
  assetNumber: 'FA-0001',
  name: 'Toyota "Hilux", B 1',
  category: 'Kendaraan',
  description: null,
  acquisitionDate: '2026-02-15T00:00:00.000Z',
  acquisitionCost: '485000000',
  usefulLifeMonths: 96,
  salvageValue: '50000000',
  depreciationMethod: 'straight_line',
  accumulatedDepreciation: '4531250.5',
  bookValue: '480468749.5',
  status: 'Active',
  assetAccount: { accountNumber: '1.6.3', name: 'Kendaraan' },
  depreciationAccount: { accountNumber: '6.22', name: 'Beban Penyusutan Kendaraan' },
  accumulatedDepAccount: { accountNumber: '1.7.2', name: 'Akm Kendaraan' },
  ...patch,
});

describe('CSV export', () => {
  it('escapes commas, quotes and newlines', () => {
    expect(escapeCsv('plain')).toBe('plain');
    expect(escapeCsv('a,b')).toBe('"a,b"');
    expect(escapeCsv('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsv(null)).toBe('');
  });

  it('keeps the legacy columns and converts decimals to numbers', () => {
    const csv = toFixedAssetCsv([asset()]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    const [header, row] = csv.slice(1).split('\n');
    expect(header).toBe(EXPORT_COLUMNS.join(','));
    expect(row).toBe(
      'FA-0001,"Toyota ""Hilux"", B 1",Kendaraan,,2026-02-15,485000000,96,50000000,4531250.5,480468749.5,Active,1.6.3 Kendaraan,6.22 Beban Penyusutan Kendaraan,1.7.2 Akm Kendaraan',
    );
  });

  it('builds the import template from real account ids', () => {
    const tpl = importTemplateCsv(coa);
    expect(tpl).toContain(',a-16,a-6,a-17');
    expect(importTemplateCsv([])).toContain('<uuid-akun-aset>');
  });
});

describe('CSV import', () => {
  const header =
    'name,category,description,acquisition_date,acquisition_cost,useful_life_months,salvage_value,asset_account_id,depreciation_account_id,accumulated_dep_account_id';

  it('splits quoted cells', () => {
    expect(splitCsvLine('a,"b, c","d ""e"""')).toEqual(['a', 'b, c', 'd "e"']);
  });

  it('parses valid rows and labels the accounts', () => {
    const res = parseFixedAssetImport(`\uFEFF${header}\nHilux,Kendaraan,,2026-01-15,1000,12,0,a-16,a-6,a-17\n`, coa);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      name: 'Hilux',
      acquisitionCost: 1000,
      usefulLifeMonths: 12,
      salvageValue: 0,
      description: null,
      assetAccountLabel: '1.6.3 Kendaraan',
    });
    expect(res.rows[0].error).toBeUndefined();
    expect(toImportPayload(res.rows).assets[0]).not.toHaveProperty('assetAccountLabel');
  });

  it('flags invalid rows with their line number', () => {
    const res = parseFixedAssetImport(`${header}\n,Kendaraan,,2026-01-15,0,12,0,x,a-6,a-17`, coa);
    expect(res.ok && res.rows[0].error).toBe(
      'Baris 2: name kosong; acquisition_cost tidak valid; asset_account_id tidak dikenal',
    );
  });

  it('rejects empty files and missing columns', () => {
    expect(parseFixedAssetImport(header, coa)).toEqual({ ok: false, error: 'CSV kosong atau hanya berisi header.' });
    const res = parseFixedAssetImport('name,category\nA,B', coa);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toMatch(/^Kolom wajib hilang: acquisition_date/);
  });
});

describe('depreciation run helpers', () => {
  it('defaults to the previous month, across the year boundary', () => {
    expect(previousMonth(new Date(2026, 9, 4))).toBe('2026-09');
    expect(previousMonth(new Date(2026, 0, 31))).toBe('2025-12');
  });

  it('labels a month in Indonesian', () => {
    expect(monthLabel('2026-09')).toBe('September 2026');
    expect(monthLabel('2026-13')).toBe('2026-13');
  });

  it('groups the preview by category', () => {
    expect(
      groupPreviewByCategory([
        { category: 'Mesin', amount: 100 },
        { category: 'Gedung', amount: 50 },
        { category: 'Mesin', amount: 25.5 },
      ]),
    ).toEqual([
      { category: 'Mesin', count: 2, total: 125.5 },
      { category: 'Gedung', count: 1, total: 50 },
    ]);
  });
});
