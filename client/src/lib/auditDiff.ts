/**
 * Field-by-field diff and formatting for audit entries. Values arrive already redacted by the
 * server; nothing here tries to reveal or re-derive them. Labels come from `common:auditDiff.*`
 * and follow the UI language.
 */
import i18n from '@/i18n';
import { LOCALE } from '@/lib/format';
import type commonId from '@/locales/id/common.json';

type AuditTextKey = Exclude<keyof (typeof commonId)['auditDiff'], 'actions'>;

const tr = (key: AuditTextKey): string => i18n.t(`auditDiff.${key}`, { ns: 'common' });

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
    return [{ key: tr('value'), before: oldValues, after: newValues, change }];
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
  if (value === null) return tr('empty');
  if (typeof value === 'boolean') return value ? tr('yes') : tr('no');
  if (typeof value === 'string') return value === '' ? tr('empty') : value;
  if (typeof value === 'number') return String(value);
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

let rtf: Intl.RelativeTimeFormat | null = null;

/** Formatter for the current UI locale (rebuilt when the language changes). */
function relativeFormatter(): Intl.RelativeTimeFormat {
  if (!rtf || rtf.resolvedOptions().locale !== new Intl.RelativeTimeFormat(LOCALE).resolvedOptions().locale) {
    rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' });
  }
  return rtf;
}

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
  if (Number.isNaN(d.getTime())) return '—';
  const diffSec = Math.round((d.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSec);
  if (abs < 45) return tr('justNow');
  for (const [unit, sec] of UNITS) {
    if (abs >= sec || unit === 'minute') return relativeFormatter().format(Math.round(diffSec / sec), unit);
  }
  return tr('justNow');
}

/** `common:auditDiff.actions.*` key for well-known audit actions; unknown actions shown as-is. */
const ACTION_KEYS: Record<string, keyof (typeof commonId)['auditDiff']['actions']> = {
  CREATE: 'create',
  UPDATE: 'update',
  DELETE: 'delete',
  LOGIN: 'login',
  FIX_ALE_SYNC: 'fixAleSync',
  FIX_ACCOUNT_BALANCE_DRIFT: 'fixAccountBalanceDrift',
  FIX_ORPHAN_ALE: 'fixOrphanAle',
};

export function auditActionLabel(action: string): string {
  const key = ACTION_KEYS[action];
  return key ? i18n.t(`auditDiff.actions.${key}`, { ns: 'common' }) : action;
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
