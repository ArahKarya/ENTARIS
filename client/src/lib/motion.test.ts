import { describe, expect, it } from 'vitest';
import { formatNumericParts, parseNumericParts, resolveMotion } from './motion';

describe('resolveMotion', () => {
  it('uses a stored level over the device setting', () => {
    expect(resolveMotion('lively', true)).toBe('lively');
    expect(resolveMotion('none', false)).toBe('none');
  });

  it('follows the device when nothing valid is stored', () => {
    expect(resolveMotion(null, false)).toBe('smooth');
    expect(resolveMotion(null, true)).toBe('none');
    expect(resolveMotion('cinematic', true)).toBe('none');
  });
});

describe('parseNumericParts', () => {
  it('splits a rupiah amount with thousand separators', () => {
    expect(parseNumericParts('Rp 1.234.567')).toEqual({ prefix: 'Rp ', number: 1234567, decimals: 0, suffix: '' });
  });

  it('keeps decimals and suffix of compact values', () => {
    expect(parseNumericParts('Rp 12,5 jt')).toEqual({ prefix: 'Rp ', number: 12.5, decimals: 1, suffix: ' jt' });
  });

  it('handles negatives and percentages', () => {
    expect(parseNumericParts('-3,25%')).toEqual({ prefix: '', number: -3.25, decimals: 2, suffix: '%' });
  });

  it('returns null without a number', () => {
    expect(parseNumericParts('Tidak ada data')).toBeNull();
  });

  it('formats intermediate values in the original shape', () => {
    const parts = parseNumericParts('Rp 12,5 jt');
    expect(parts).not.toBeNull();
    expect(formatNumericParts(parts!, 6.25)).toBe('Rp 6,3 jt');
    const whole = parseNumericParts('Rp 1.234.567')!;
    expect(formatNumericParts(whole, 1234567)).toBe('Rp 1.234.567');
  });
});
