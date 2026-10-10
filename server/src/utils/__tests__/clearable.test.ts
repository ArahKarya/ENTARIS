import { describe, it, expect } from 'vitest';
import { clearable } from '../clearable';

describe('clearable', () => {
  it('keeps undefined (field not sent = keep stored value)', () => {
    expect(clearable(undefined)).toBeUndefined();
  });

  it('clears on null, empty or blank text', () => {
    expect(clearable(null)).toBeNull();
    expect(clearable('')).toBeNull();
    expect(clearable('   ')).toBeNull();
  });

  it('trims real values', () => {
    expect(clearable('  01.234.567.8-901.000 ')).toBe('01.234.567.8-901.000');
  });
});
