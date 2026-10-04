import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/prisma', () => ({ prisma: new Proxy({}, { get: () => ({ findUnique: vi.fn() }) }) }));
vi.mock('../../lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

import {
  matchSnapshotTarget,
  captureBeforeSnapshot,
  SnapshotEntry,
  DEFAULT_SNAPSHOT_REGISTRY,
} from '../auditSnapshot';
import { REDACTED } from '../../utils/redact';

const ID = '3f2b8c1e-1234-4abc-9def-0123456789ab';

describe('matchSnapshotTarget (default registry)', () => {
  it('matches PUT/PATCH/DELETE on <prefix>/<id>', () => {
    expect(matchSnapshotTarget('PUT', `/api/parties/${ID}`)?.entry.prefix).toBe('parties');
    expect(matchSnapshotTarget('DELETE', `/api/coa/${ID}`)?.id).toBe(ID);
    expect(matchSnapshotTarget('PATCH', `/api/journals/${ID}/cancel?x=1`)?.entry.prefix).toBe('journals');
  });

  it('matches POST only on <prefix>/<id>/<action>', () => {
    expect(matchSnapshotTarget('POST', `/api/sales/invoices/${ID}/cancel`)?.entry.prefix).toBe('sales/invoices');
    expect(matchSnapshotTarget('POST', `/api/fiscal-years/${ID}/close`)?.id).toBe(ID);
    expect(matchSnapshotTarget('POST', '/api/sales/invoices')).toBeNull();
    expect(matchSnapshotTarget('POST', `/api/parties/${ID}`)).toBeNull();
  });

  it('prefers the longest prefix and handles nested routes', () => {
    expect(matchSnapshotTarget('PUT', `/api/inventory/items/${ID}`)?.entry.prefix).toBe('inventory/items');
    expect(matchSnapshotTarget('PUT', `/api/tax/config/${ID}`)?.entry.prefix).toBe('tax/config');
    expect(matchSnapshotTarget('PUT', `/api/purchase/invoices/${ID}`)?.entry.prefix).toBe('purchase/invoices');
  });

  it('skips non-uuid ids, unknown routes, reads and deep paths', () => {
    expect(matchSnapshotTarget('PUT', '/api/users/me/password')).toBeNull();
    expect(matchSnapshotTarget('POST', `/api/customer-deposits/apply/${ID}/cancel`)).toBeNull();
    expect(matchSnapshotTarget('PUT', `/api/warehouses/${ID}`)).toBeNull();
    expect(matchSnapshotTarget('GET', `/api/parties/${ID}`)).toBeNull();
    expect(matchSnapshotTarget('PUT', `/api/parties/${ID}/a/b`)).toBeNull();
  });

  it('handles singleton company settings', () => {
    expect(matchSnapshotTarget('PUT', '/api/settings/company')).toMatchObject({ id: null });
    expect(matchSnapshotTarget('POST', '/api/settings/company/onboarding')).toBeNull();
  });

  it('covers every required document/master prefix', () => {
    const prefixes = DEFAULT_SNAPSHOT_REGISTRY.map((e) => e.prefix);
    for (const p of [
      'sales/invoices', 'purchase/invoices', 'payments', 'customer-deposits', 'vendor-deposits',
      'journals', 'purchase-orders', 'goods-receipts', 'delivery-orders', 'sales-orders', 'quotations',
      'parties', 'inventory/items', 'coa', 'users', 'roles', 'settings/company', 'tax/config',
      'fiscal-years', 'fixed-assets',
    ]) {
      expect(prefixes).toContain(p);
    }
  });
});

describe('captureBeforeSnapshot (mocked loaders)', () => {
  const reg = (load: SnapshotEntry['load']): SnapshotEntry[] => [{ prefix: 'users', load }];

  it('returns the redacted, JSON-plain snapshot', async () => {
    const load = vi.fn().mockResolvedValue({ id: ID, username: 'a', passwordHash: 'h', at: new Date(0) });
    const res = await captureBeforeSnapshot('PUT', `/api/users/${ID}`, reg(load));
    expect(load).toHaveBeenCalledWith(ID);
    expect(res).toEqual({
      id: ID,
      snapshot: { id: ID, username: 'a', passwordHash: REDACTED, at: '1970-01-01T00:00:00.000Z' },
    });
  });

  it('does not call loaders for unmatched routes', async () => {
    const load = vi.fn();
    expect(await captureBeforeSnapshot('PUT', '/api/users/me/password', reg(load))).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it('swallows loader errors and missing rows', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('db down'));
    expect(await captureBeforeSnapshot('PUT', `/api/users/${ID}`, reg(failing))).toBeNull();
    expect(await captureBeforeSnapshot('PUT', `/api/users/${ID}`, reg(vi.fn().mockResolvedValue(null)))).toBeNull();
  });

  it('skips slow loaders after the timeout', async () => {
    const slow = vi.fn(() => new Promise((r) => setTimeout(() => r({ id: ID }), 200)));
    expect(await captureBeforeSnapshot('PUT', `/api/users/${ID}`, reg(slow), 20)).toBeNull();
  });
});
