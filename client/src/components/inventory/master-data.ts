/**
 * Pure rules for the production master-data tabs (Standar Biaya, Master
 * Proses, Mesin): client-side search / status filtering and form validation.
 */

export type ActiveFilter = '' | 'active' | 'inactive';

export const ACTIVE_FILTER_OPTIONS: ReadonlyArray<{ value: Exclude<ActiveFilter, ''>; label: string }> = [
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Nonaktif' },
];

export interface MasterRow {
  isActive: boolean;
}

/** Rows matching the status filter and a case-insensitive search over `fields`. */
export function filterMasterRows<T extends MasterRow>(
  rows: readonly T[],
  { search, status }: { search?: string; status?: ActiveFilter },
  fields: (row: T) => Array<string | null | undefined>,
): T[] {
  const q = search?.trim().toLocaleLowerCase('id-ID') ?? '';
  return rows.filter((r) => {
    if (status === 'active' && !r.isActive) return false;
    if (status === 'inactive' && r.isActive) return false;
    if (!q) return true;
    return fields(r).some((f) => !!f && f.toLocaleLowerCase('id-ID').includes(q));
  });
}

export function countActive(rows: readonly MasterRow[]): { total: number; active: number } {
  return { total: rows.length, active: rows.filter((r) => r.isActive).length };
}

export type FormErrors<K extends string> = Partial<Record<K, string>>;

/** Optional non-negative number ("" → null). Returns NaN-safe parse result. */
export function parseOptionalNonNegative(raw: string): { value: number | null; error?: string } {
  const t = raw.trim().replace(',', '.');
  if (!t) return { value: null };
  const n = Number(t);
  if (!Number.isFinite(n)) return { value: null, error: 'Harus berupa angka.' };
  if (n < 0) return { value: null, error: 'Tidak boleh negatif.' };
  return { value: n };
}

// ─── Cost standard ──────────────────────────────────────────────────────────

export interface CostStandardForm {
  name: string;
  defaultRate: string;
}

export function validateCostStandard(f: CostStandardForm): FormErrors<'name' | 'defaultRate'> {
  const errors: FormErrors<'name' | 'defaultRate'> = {};
  if (!f.name.trim()) errors.name = 'Nama standar wajib diisi.';
  const rate = parseOptionalNonNegative(f.defaultRate);
  if (rate.error) errors.defaultRate = `Tarif ${rate.error.toLowerCase()}`;
  else if (rate.value === null) errors.defaultRate = 'Tarif wajib diisi.';
  return errors;
}

// ─── Process ────────────────────────────────────────────────────────────────

export interface ProcessForm {
  name: string;
  sortOrder: string;
}

export function validateProcess(f: ProcessForm): FormErrors<'name' | 'sortOrder'> {
  const errors: FormErrors<'name' | 'sortOrder'> = {};
  if (!f.name.trim()) errors.name = 'Nama proses wajib diisi.';
  else if (f.name.trim().length > 100) errors.name = 'Nama proses maksimal 100 karakter.';
  const t = f.sortOrder.trim();
  if (t && !/^-?\d+$/.test(t)) errors.sortOrder = 'Urutan harus bilangan bulat.';
  return errors;
}

// ─── Machine ────────────────────────────────────────────────────────────────

export interface MachineForm {
  code: string;
  name: string;
  idealRatePerHour: string;
  unit: string;
}

export function validateMachine(f: MachineForm): FormErrors<'code' | 'name' | 'idealRatePerHour' | 'unit'> {
  const errors: FormErrors<'code' | 'name' | 'idealRatePerHour' | 'unit'> = {};
  if (!f.code.trim()) errors.code = 'Kode mesin wajib diisi.';
  else if (f.code.trim().length > 50) errors.code = 'Kode maksimal 50 karakter.';
  if (!f.name.trim()) errors.name = 'Nama mesin wajib diisi.';
  else if (f.name.trim().length > 150) errors.name = 'Nama maksimal 150 karakter.';
  const rate = parseOptionalNonNegative(f.idealRatePerHour);
  if (rate.error) errors.idealRatePerHour = `Kapasitas ${rate.error.toLowerCase()}`;
  if (f.unit.trim().length > 20) errors.unit = 'Satuan maksimal 20 karakter.';
  return errors;
}

export const hasErrors = (e: Record<string, string | undefined>): boolean => Object.values(e).some(Boolean);
