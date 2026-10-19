import { describe, it, expect } from 'vitest';
import { auditActionLabel, auditActionTone, diffAuditValues, formatAuditValue, formatRelativeTime } from './auditDiff';

describe('diffAuditValues', () => {
  it('returns nothing without values', () => {
    expect(diffAuditValues(null, null)).toEqual([]);
  });

  it('marks added, removed, changed and unchanged fields', () => {
    const rows = diffAuditValues({ a: 1, b: 'x', c: true }, { a: 1, b: 'y', d: [1] });
    expect(rows).toEqual([
      { key: 'a', before: 1, after: 1, change: 'unchanged' },
      { key: 'b', before: 'x', after: 'y', change: 'changed' },
      { key: 'c', before: true, after: undefined, change: 'removed' },
      { key: 'd', before: undefined, after: [1], change: 'added' },
    ]);
  });

  it('treats a create (no old values) as all added', () => {
    expect(diffAuditValues(null, { name: 'A' })).toEqual([{ key: 'name', before: undefined, after: 'A', change: 'added' }]);
  });

  it('compares nested values structurally', () => {
    expect(diffAuditValues({ o: { x: 1 } }, { o: { x: 1 } })[0].change).toBe('unchanged');
  });

  it('handles non-object values as a single row', () => {
    expect(diffAuditValues('a', 'b')).toEqual([{ key: 'nilai', before: 'a', after: 'b', change: 'changed' }]);
  });

  it('keeps redacted markers as plain values', () => {
    expect(diffAuditValues(null, { password: '[REDACTED]' })[0].after).toBe('[REDACTED]');
  });
});

describe('formatAuditValue', () => {
  it('formats primitives in Indonesian', () => {
    expect(formatAuditValue(null)).toBe('(kosong)');
    expect(formatAuditValue('')).toBe('(kosong)');
    expect(formatAuditValue(true)).toBe('Ya');
    expect(formatAuditValue(12.5)).toBe('12.5');
    expect(formatAuditValue({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-10-04T12:00:00Z');
  it('describes recent and older times', () => {
    expect(formatRelativeTime('2026-10-04T11:59:50Z', now)).toBe('baru saja');
    expect(formatRelativeTime('2026-10-04T11:55:00Z', now)).toBe('5 menit yang lalu');
    expect(formatRelativeTime('2026-10-04T09:00:00Z', now)).toBe('3 jam yang lalu');
    expect(formatRelativeTime('2026-10-03T12:00:00Z', now)).toBe('kemarin');
    expect(formatRelativeTime('invalid', now)).toBe('—');
  });
});

describe('audit action labels', () => {
  it('maps known actions and keeps unknown ones', () => {
    expect(auditActionLabel('CREATE')).toBe('Buat');
    expect(auditActionLabel('CUSTOM')).toBe('CUSTOM');
    expect(auditActionTone('DELETE')).toBe('danger');
    expect(auditActionTone('FIX_X')).toBe('warning');
  });
});
