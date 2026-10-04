import { describe, it, expect } from 'vitest';
import { systemAccountRenumberError } from '../systemAccountGuard';

describe('systemAccountRenumberError', () => {
  it('blocks renumbering a mapped system account', () => {
    const msg = systemAccountRenumberError('1.1.3', '1.1.9', ['AR', 'AR']);
    expect(msg).toContain('1.1.3');
    expect(msg).toContain('(AR)');
  });

  it('allows unchanged number or name-only edits', () => {
    expect(systemAccountRenumberError('1.1.3', undefined, ['AR'])).toBeNull();
    expect(systemAccountRenumberError('1.1.3', '1.1.3', ['AR'])).toBeNull();
  });

  it('allows renumbering unmapped accounts', () => {
    expect(systemAccountRenumberError('1.1.3', '1.1.9', [])).toBeNull();
  });
});
