import { describe, it, expect } from 'vitest';
import { redactSecrets, REDACTED } from '../redact';

describe('redactSecrets', () => {
  it('masks secret keys at any depth, case-insensitively', () => {
    const input = {
      id: 'x',
      serviceToken: 'abc',
      nested: { PasswordHash: 'h', list: [{ apiKey: 'k', name: 'ok' }] },
    };
    expect(redactSecrets(input)).toEqual({
      id: 'x',
      serviceToken: REDACTED,
      nested: { PasswordHash: REDACTED, list: [{ apiKey: REDACTED, name: 'ok' }] },
    });
  });

  it('does not mutate the input', () => {
    const input = { serviceToken: 'abc', inner: { secret: 's' } };
    redactSecrets(input);
    expect(input).toEqual({ serviceToken: 'abc', inner: { secret: 's' } });
  });

  it('keeps null/empty secrets as-is and passes primitives through', () => {
    expect(redactSecrets({ serviceToken: null })).toEqual({ serviceToken: null });
    expect(redactSecrets('plain')).toBe('plain');
    expect(redactSecrets(null)).toBeNull();
    expect(redactSecrets([1, 2])).toEqual([1, 2]);
  });

  it('leaves Date values intact', () => {
    const d = new Date('2026-10-03T00:00:00Z');
    expect(redactSecrets({ updatedAt: d })).toEqual({ updatedAt: d });
  });

  it('serialises Decimal-like value objects instead of copying their internals', () => {
    const dec = { s: 1, e: 0, d: [1, 5000000], constructor: function Decimal() {}, toJSON: () => '1.5' };
    expect(redactSecrets({ amount: dec, list: [{ qty: dec }] })).toEqual({ amount: '1.5', list: [{ qty: '1.5' }] });
  });
});
