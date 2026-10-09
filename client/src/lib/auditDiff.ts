/**
 * Field-by-field diff and formatting for audit entries. Values arrive already redacted by the
 * server; nothing here tries to reveal or re-derive them.
 */

export type DiffChange = 'added' | 'removed' | 'changed' | 'unchanged';

export interface DiffRow {
  key: string;
  before: unknown;
  after: unknown;
  change: DiffChange;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

/**
 * Field rows for old → new. Non-object values are compared as one "nilai" row.
 * Keys keep first-seen order (old values first, then keys only in new).
 */
export function diffAuditValues(oldValues: unknown, newValues: unknown): DiffRow[] {
  const hasOld = oldValues !== null && oldValues !== undefined;
  const hasNew = newValues !== null && newValues !== undefined;
  if (!hasOld && !hasNew) return [];

  if ((hasOld && !isPlainObject(oldValues)) || (hasNew && !isPlainObject(newValues))) {
    const change: DiffChange = !hasOld ? 'added' : !hasNew ? 'removed' : sameValue(oldValues, newValues) ? 'unchanged' : 'changed';
    return [{ key: 'nilai', before: oldValues, after: newValues, change }];
  }

  const before = (hasOld ? oldValues : {}) as Record<string, unknown>;
  const after = (hasNew ? newValues : {}) as Record<string, unknown>;
  const keys = [...Object.keys(before), ...Object.keys(after).filter((k) => !(k in before))];
  return keys.map((key) => {
    const inOld = key in before;
    const inNew = key in after;
    let change: DiffChange;
    if (!hasOld || !inOld) change = 'added';
    else if (!hasNew || !inNew) change = 'removed';
    else change = sameValue(before[key], after[key]) ? 'unchanged' : 'changed';
    return { key, before: before[key], after: after[key], change };
  });
}

/** Short display of a JSON value; objects/arrays as compact JSON. */
export function formatAuditValue(value: unknown): string {
  if (value === undefined) return '';
  if (value === null) return '(kosong)';
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
  if (typeof value === 'string') return value === '' ? '(kosong)' : value;
  if (typeof value === 'number') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

const RTF = new Intl.RelativeTimeFormat('id-ID', { numeric: 'auto' });

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

/** "5 menit yang lalu", "kemarin", "baru saja". */
export function formatRelativeTime(value: string | number | Date, now: Date = new Date()): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return 'baru saja';
  for (const [unit, sec] of UNITS) {
    if (abs >= sec || unit === 'minute') return RTF.format(Math.round(diffSec / sec), unit);
  }
  return 'baru saja';
}

/** Indonesian label for well-known audit actions; unknown actions shown as-is. */
const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Buat',
  UPDATE: 'Ubah',
  DELETE: 'Hapus',
  LOGIN: 'Masuk',
  FIX_ALE_SYNC: 'Perbaikan sinkron ALE',
  FIX_ACCOUNT_BALANCE_DRIFT: 'Perbaikan saldo akun',
  FIX_ORPHAN_ALE: 'Perbaikan ALE yatim',
};

export function auditActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

export type AuditActionTone = 'success' | 'info' | 'danger' | 'neutral' | 'warning';

export function auditActionTone(action: string): AuditActionTone {
  switch (action) {
    case 'CREATE':
      return 'success';
    case 'UPDATE':
      return 'info';
    case 'DELETE':
      return 'danger';
    case 'LOGIN':
      return 'neutral';
    default:
      return action.startsWith('FIX_') ? 'warning' : 'neutral';
  }
}
