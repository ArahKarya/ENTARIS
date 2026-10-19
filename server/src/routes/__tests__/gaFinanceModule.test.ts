import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/prisma', () => ({ prisma: {} }));
vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/permissionService', () => ({ invalidatePermissionCache: vi.fn() }));
vi.mock('../../middleware/auth', () => ({
  requireCap: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePerm: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { MODULE_KEYS, DEFAULT_MATRIX, BACKFILL_MODULES } from '../../constants/modules';
import { sanitizePermissions } from '../roles';

describe('retired ga_finance RBAC module', () => {
  it('is no longer registered, granted or backfilled', () => {
    expect(MODULE_KEYS).not.toContain('ga_finance');
    expect(DEFAULT_MATRIX.Accountant).not.toHaveProperty('ga_finance');
    expect(BACKFILL_MODULES).not.toContain('ga_finance');
  });

  it('keeps Accountant on payment_request edit (EAM queue gate)', () => {
    expect(DEFAULT_MATRIX.Accountant.payment_request).toBe('edit');
    expect(DEFAULT_MATRIX.Viewer.payment_request).toBeUndefined();
  });

  it('silently drops a stale ga_finance grant when a role is saved', () => {
    expect(sanitizePermissions([{ module: 'ga_finance', canEdit: true }, { module: 'journal', canView: true }]))
      .toEqual([{ module: 'journal', canView: true, canEdit: false }]);
  });
});
