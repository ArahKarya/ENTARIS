/**
 * Pure helpers for the fixed asset pages: CSV export / import (the export
 * columns double as the import template), depreciation-run month handling and
 * preview grouping. Unit-tested in fixed-asset-utils.test.ts.
 */
import { LOCALE, toNumber } from '@/lib/format';
import type { CoaOption, FixedAssetRow } from './types';

export const EXPORT_COLUMNS = [
  'asset_number',
  'name',
  'category',
  'description',
  'acquisition_date',
  'acquisition_cost',
  'useful_life_months',
  'salvage_value',
  'accumulated_depreciation',
  'book_value',
  'status',
  'asset_account',
  'depreciation_account',
  'accumulated_dep_account',
] as const;

export const IMPORT_REQUIRED_COLUMNS = [
  'name',
  'category',
  'acquisition_date',
  'acquisition_cost',
  'useful_life_months',
  'asset_account_id',
  'depreciation_account_id',
  'accumulated_dep_account_id',
] as const;

export const IMPORT_TEMPLATE_HEADER =
  'name,category,description,acquisition_date,acquisition_cost,useful_life_months,salvage_value,asset_account_id,depreciation_account_id,accumulated_dep_account_id';

const BOM = '\uFEFF';

export function escapeCsv(value: unknown): string {
  const v = value == null ? '' : String(value);
  return v.includes(',') || v.includes('"') || v.includes('\n') ? `"${v.replace(/"/g, '""')}"` : v;
}

const account = (a: { accountNumber: string; name: string }) => `${a.accountNumber} ${a.name}`;
const num = (v: unknown) => toNumber(v as string | number | null) ?? 0;

/** CSV text (with BOM, for Excel) — same columns as the legacy export. */
export function toFixedAssetCsv(assets: readonly FixedAssetRow[]): string {
  const lines = [
    EXPORT_COLUMNS.join(','),
    ...assets.map((a) =>
      [
        a.assetNumber,
        a.name,
        a.category,
        a.description ?? '',
        a.acquisitionDate?.substring(0, 10) ?? '',
        num(a.acquisitionCost),
        a.usefulLifeMonths,
        num(a.salvageValue),
        num(a.accumulatedDepreciation),
        num(a.bookValue),
        a.status,
        account(a.assetAccount),
        account(a.depreciationAccount),
        account(a.accumulatedDepAccount),
      ]
        .map(escapeCsv)
        .join(','),
    ),
  ];
  return BOM + lines.join('\n');
}

/** Template with one sample row using real account ids when available. */
export function importTemplateCsv(coa: readonly CoaOption[]): string {
  const asset = coa.find((a) => a.accountNumber.startsWith('1.6'))?.id ?? '<uuid-akun-aset>';
  const dep = coa.find((a) => a.accountNumber.startsWith('6.'))?.id ?? '<uuid-akun-beban>';
  const acc = coa.find((a) => a.accountNumber.startsWith('1.7'))?.id ?? '<uuid-akun-akm>';
  const sample = `Mesin Contoh,Mesin,Mesin contoh untuk template,2026-01-15,50000000,96,0,${asset},${dep},${acc}`;
  return `${BOM}${IMPORT_TEMPLATE_HEADER}\n${sample}`;
}

/** Splits one CSV line, honouring double quotes and "" escapes. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let buf = '';
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') {
        buf += '"';
        i++;
      } else inQuote = !inQuote;
    } else if (c === ',' && !inQuote) {
      cells.push(buf);
      buf = '';
    } else buf += c;
  }
  cells.push(buf);
  return cells.map((s) => s.trim());
}

export interface ParsedImportRow {
  name: string;
  category: string;
  description: string | null;
  acquisitionDate: string;
  acquisitionCost: number;
  usefulLifeMonths: number;
  salvageValue: number;
  assetAccountId: string;
  depreciationAccountId: string;
  accumulatedDepAccountId: string;
  assetAccountLabel: string;
  depAccountLabel: string;
  accumAccountLabel: string;
  error?: string;
}

export type ParseImportResult = { ok: true; rows: ParsedImportRow[] } | { ok: false; error: string };

/** Parses an import CSV and validates each row. */
export function parseFixedAssetImport(text: string, coa: readonly CoaOption[]): ParseImportResult {
  const clean = text.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { ok: false, error: 'CSV kosong atau hanya berisi header.' };

  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (col: string) => header.indexOf(col);
  const missing = IMPORT_REQUIRED_COLUMNS.filter((c) => idx(c) < 0);
  if (missing.length > 0) return { ok: false, error: `Kolom wajib hilang: ${missing.join(', ')}.` };

  const byId = new Map(coa.map((c) => [c.id, c]));
  const label = (a: CoaOption | undefined) => (a ? `${a.accountNumber} ${a.name}` : '?');

  const rows = lines.slice(1).map((line, lineNo): ParsedImportRow => {
    const cells = splitCsvLine(line);
    const get = (col: string) => cells[idx(col)] ?? '';
    const aAcc = byId.get(get('asset_account_id'));
    const dAcc = byId.get(get('depreciation_account_id'));
    const accAcc = byId.get(get('accumulated_dep_account_id'));
    const row: ParsedImportRow = {
      name: get('name'),
      category: get('category'),
      description: get('description') || null,
      acquisitionDate: get('acquisition_date'),
      acquisitionCost: Number(get('acquisition_cost')),
      usefulLifeMonths: Number(get('useful_life_months')),
      salvageValue: Number(get('salvage_value') || 0),
      assetAccountId: get('asset_account_id'),
      depreciationAccountId: get('depreciation_account_id'),
      accumulatedDepAccountId: get('accumulated_dep_account_id'),
      assetAccountLabel: label(aAcc),
      depAccountLabel: label(dAcc),
      accumAccountLabel: label(accAcc),
    };
    const errs: string[] = [];
    if (!row.name) errs.push('name kosong');
    if (!row.category) errs.push('category kosong');
    if (!row.acquisitionDate) errs.push('acquisition_date kosong');
    if (!(row.acquisitionCost > 0)) errs.push('acquisition_cost tidak valid');
    if (!(row.usefulLifeMonths > 0)) errs.push('useful_life_months tidak valid');
    if (!aAcc) errs.push('asset_account_id tidak dikenal');
    if (!dAcc) errs.push('depreciation_account_id tidak dikenal');
    if (!accAcc) errs.push('accumulated_dep_account_id tidak dikenal');
    return errs.length > 0 ? { ...row, error: `Baris ${lineNo + 2}: ${errs.join('; ')}` } : row;
  });
  return { ok: true, rows };
}

/** Request body for POST /fixed-assets/import (preview-only fields dropped). */
export function toImportPayload(rows: readonly ParsedImportRow[]) {
  return {
    assets: rows.map((r) => ({
      name: r.name,
      category: r.category,
      description: r.description,
      acquisitionDate: r.acquisitionDate,
      acquisitionCost: r.acquisitionCost,
      usefulLifeMonths: r.usefulLifeMonths,
      salvageValue: r.salvageValue,
      assetAccountId: r.assetAccountId,
      depreciationAccountId: r.depreciationAccountId,
      accumulatedDepAccountId: r.accumulatedDepAccountId,
    })),
  };
}

/** Triggers a browser download of CSV text. */
export function downloadCsv(content: string, filename: string): void {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/** "YYYY-MM" of the month before `now` (default period for posting depreciation). */
export function previousMonth(now: Date = new Date()): string {
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

/** "2026-09" → "September 2026" (unchanged when malformed). */
export function monthLabel(month: string): string {
  if (!MONTH_PATTERN.test(month)) return month;
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });
}

/** Groups a depreciation preview by category: count and total per category. */
export function groupPreviewByCategory(
  items: readonly { category: string; amount: number }[],
): Array<{ category: string; count: number; total: number }> {
  const map = new Map<string, { count: number; total: number }>();
  for (const it of items) {
    const cur = map.get(it.category) ?? { count: 0, total: 0 };
    map.set(it.category, { count: cur.count + 1, total: cur.total + it.amount });
  }
  return [...map.entries()].map(([category, v]) => ({ category, ...v }));
}
