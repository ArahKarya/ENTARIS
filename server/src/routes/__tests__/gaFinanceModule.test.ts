import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/prisma', () => ({ prisma: {} }));
vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../services/permissionService', () => ({ invalidatePermissionCache: vi.fn() }));
vi.mock('../../middleware/auth', () => ({
  requireCap: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePerm: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import { MODULES, MODULE_KEYS, DEFAULT_MATRIX, BACKFILL_MODULES } from '../../constants/modules';
import { sanitizePermissions } from '../roles';

describe('ga_finance RBAC module', () => {
  it('is a registered module in the Akuntansi group', () => {
    expect(MODULE_KEYS).toContain('ga_finance');
    expect(MODULES.find((m) => m.key === 'ga_finance')).toMatchObject({
      label: 'Tagihan Aset & Umum',
      group: 'Akuntansi',
    });
  });

  it('is granted to Accountant by default and backfilled once for existing DBs', () => {
    expect(DEFAULT_MATRIX.Accountant.ga_finance).toBe('edit');
    expect(DEFAULT_MATRIX.Viewer.ga_finance).toBeUndefined();
    expect(BACKFILL_MODULES).toContain('ga_finance');
  });

  it('survives role permission sanitising', () => {
    expect(sanitizePermissions([{ module: 'ga_finance', canEdit: true }, { module: 'bogus', canView: true }]))
      .toEqual([{ module: 'ga_finance', canView: true, canEdit: true }]);
  });
});
