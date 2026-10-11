/**
 * Pure rules for the production master-data tabs (Standar Biaya, Master
 * Proses, Mesin): client-side search / status filtering and form validation.
 */

import i18n from '@/i18n';
import { LOCALE } from '@/lib/format';

export type ActiveFilter = '' | 'active' | 'inactive';

const ACTIVE_FILTER_VALUES = ['active', 'inactive'] as const;

/** Status filter options, labelled in the current UI language (call at render time). */
export function activeFilterOptions(): Array<{ value: Exclude<ActiveFilter, ''>; label: string }> {
  return ACTIVE_FILTER_VALUES.map((value) => ({ value, label: i18n.t(`masterData.activeFilter.${value}`, { ns: 'inventory' }) }));
}

type MasterErrorKey =
  | 'notNumber'
  | 'negative'
  | 'standardNameRequired'
  | 'rateRequired'
  | 'rateNotNumber'
  | 'rateNegative'
  | 'processNameRequired'
  | 'processNameTooLong'
  | 'sortOrderInteger'
  | 'machineCodeRequired'
  | 'machineCodeTooLong'
  | 'machineNameRequired'
  | 'machineNameTooLong'
  | 'capacityNotNumber'
  | 'capacityNegative'
  | 'unitTooLong';

/** Validation message in the current UI language. */
const msg = (key: MasterErrorKey): string => i18n.t(`masterData.errors.${key}`, { ns: 'inventory' });

export interface MasterRow {
  isActive: boolean;
}

/** Rows matching the status filter and a case-insensitive search over `fields`. */
export function filterMasterRows<T extends MasterRow>(
  rows: readonly T[],
  { search, status }: { search?: string; status?: ActiveFilter },
  fields: (row: T) => Array<string | null | undefined>,
): T[] {
  const q = search?.trim().toLocaleLowerCase(LOCALE) ?? '';
  return rows.filter((r) => {
    if (status === 'active' && !r.isActive) return false;
    if (status === 'inactive' && r.isActive) return false;
    if (!q) return true;
    return fields(r).some((f) => !!f && f.toLocaleLowerCase(LOCALE).includes(q));
  });
}

export function countActive(rows: readonly MasterRow[]): { total: number; active: number } {
  return { total: rows.length, active: rows.filter((r) => r.isActive).length };
}

export type FormErrors<K extends string> = Partial<Record<K, string>>;

type NumberProblem = 'notNumber' | 'negative';

function parseNonNegative(raw: string): { value: number | null; problem?: NumberProblem } {
  const t = raw.trim().replace(',', '.');
  if (!t) return { value: null };
  const n = Number(t);
  if (!Number.isFinite(n)) return { value: null, problem: 'notNumber' };
  if (n < 0) return { value: null, problem: 'negative' };
  return { value: n };
}

/** Optional non-negative number ("" → null). Returns NaN-safe parse result. */
export function parseOptionalNonNegative(raw: string): { value: number | null; error?: string } {
  const { value, problem } = parseNonNegative(raw);
  return problem ? { value, error: msg(problem) } : { value };
}

// Cost standard

export interface CostStandardForm {
  name: string;
  defaultRate: string;
}

export function validateCostStandard(f: CostStandardForm): FormErrors<'name' | 'defaultRate'> {
  const errors: FormErrors<'name' | 'defaultRate'> = {};
  if (!f.name.trim()) errors.name = msg('standardNameRequired');
  const rate = parseNonNegative(f.defaultRate);
  if (rate.problem) errors.defaultRate = msg(rate.problem === 'negative' ? 'rateNegative' : 'rateNotNumber');
  else if (rate.value === null) errors.defaultRate = msg('rateRequired');
  return errors;
}

// Process

export interface ProcessForm {
  name: string;
  sortOrder: string;
}

export function validateProcess(f: ProcessForm): FormErrors<'name' | 'sortOrder'> {
  const errors: FormErrors<'name' | 'sortOrder'> = {};
  if (!f.name.trim()) errors.name = msg('processNameRequired');
  else if (f.name.trim().length > 100) errors.name = msg('processNameTooLong');
  const t = f.sortOrder.trim();
  if (t && !/^-?\d+$/.test(t)) errors.sortOrder = msg('sortOrderInteger');
  return errors;
}

// Machine

export interface MachineForm {
  code: string;
  name: string;
  idealRatePerHour: string;
  unit: string;
}

export function validateMachine(f: MachineForm): FormErrors<'code' | 'name' | 'idealRatePerHour' | 'unit'> {
  const errors: FormErrors<'code' | 'name' | 'idealRatePerHour' | 'unit'> = {};
  if (!f.code.trim()) errors.code = msg('machineCodeRequired');
  else if (f.code.trim().length > 50) errors.code = msg('machineCodeTooLong');
  if (!f.name.trim()) errors.name = msg('machineNameRequired');
  else if (f.name.trim().length > 150) errors.name = msg('machineNameTooLong');
  const rate = parseNonNegative(f.idealRatePerHour);
  if (rate.problem) errors.idealRatePerHour = msg(rate.problem === 'negative' ? 'capacityNegative' : 'capacityNotNumber');
  if (f.unit.trim().length > 20) errors.unit = msg('unitTooLong');
  return errors;
}

export const hasErrors = (e: Record<string, string | undefined>): boolean => Object.values(e).some(Boolean);
