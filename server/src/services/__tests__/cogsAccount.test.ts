import { describe, expect, it, vi } from 'vitest';

const getAccounts = vi.fn();
vi.mock('../systemAccounts', () => ({ systemAccounts: { getAccounts: (...a: unknown[]) => getAccounts(...a) } }));

import { resolveCogsAccountId } from '../cogsAccount';
import { makeAutoTx } from '../../__tests__/helpers/autoTx';

describe('resolveCogsAccountId', () => {
  it('prefers HPP Beras 5.1', async () => {
    const { tx } = makeAutoTx({ 'account.findFirst': () => ({ id: 'acc-5.1' }) });
    expect(await resolveCogsAccountId(tx)).toBe('acc-5.1');
    expect(getAccounts).not.toHaveBeenCalled();
  });

  it('falls back to the COGS system account, or null when unmapped', async () => {
    const { tx } = makeAutoTx();
    getAccounts.mockResolvedValueOnce([{ id: 'acc-5' }]);
    expect(await resolveCogsAccountId(tx)).toBe('acc-5');
    getAccounts.mockResolvedValueOnce([]);
    expect(await resolveCogsAccountId(tx)).toBeNull();
  });
});
