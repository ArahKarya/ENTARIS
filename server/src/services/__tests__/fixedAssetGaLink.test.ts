import { describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { isGaAssetLinkConflict, resolveGaAssetLink } from '../fixedAssetGaLink';

function mockDb(opts: { gaAsset?: { id: string } | null; taken?: { assetNumber: string; name: string } | null }) {
  return {
    gaAsset: { findUnique: vi.fn().mockResolvedValue(opts.gaAsset ?? null) },
    fixedAsset: { findFirst: vi.fn().mockResolvedValue(opts.taken ?? null) },
  };
}

describe('resolveGaAssetLink', () => {
  it('leaves the link unchanged when the field is absent', async () => {
    const db = mockDb({});
    expect(await resolveGaAssetLink(db as never, undefined)).toEqual({ ok: true, gaAssetId: undefined });
    expect(db.gaAsset.findUnique).not.toHaveBeenCalled();
  });

  it('unlinks on null or empty string', async () => {
    const db = mockDb({});
    expect(await resolveGaAssetLink(db as never, null)).toEqual({ ok: true, gaAssetId: null });
    expect(await resolveGaAssetLink(db as never, '  ')).toEqual({ ok: true, gaAssetId: null });
  });

  it('rejects an unknown EAM asset', async () => {
    const db = mockDb({ gaAsset: null });
    const r = await resolveGaAssetLink(db as never, 'ga-x');
    expect(r).toMatchObject({ ok: false, status: 400 });
  });

  it('rejects an EAM asset already linked to another fixed asset with an Indonesian message', async () => {
    const db = mockDb({ gaAsset: { id: 'ga1' }, taken: { assetNumber: 'FA-0007', name: 'Hilux' } });
    const r = await resolveGaAssetLink(db as never, 'ga1', 'fa-self');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(409);
      expect(r.error).toContain('FA-0007');
      expect(r.error).toContain('sudah ditautkan');
    }
    expect(db.fixedAsset.findFirst).toHaveBeenCalledWith({
      where: { gaAssetId: 'ga1', id: { not: 'fa-self' } },
      select: { assetNumber: true, name: true },
    });
  });

  it('accepts a free EAM asset', async () => {
    const db = mockDb({ gaAsset: { id: 'ga1' } });
    expect(await resolveGaAssetLink(db as never, 'ga1')).toEqual({ ok: true, gaAssetId: 'ga1' });
    expect(db.fixedAsset.findFirst).toHaveBeenCalledWith({
      where: { gaAssetId: 'ga1' },
      select: { assetNumber: true, name: true },
    });
  });
});

describe('isGaAssetLinkConflict', () => {
  const p2002 = (meta: Record<string, unknown>) =>
    new Prisma.PrismaClientKnownRequestError('Unique constraint failed', { code: 'P2002', clientVersion: 'x', meta });

  it('detects the unique gaAssetId violation', () => {
    expect(isGaAssetLinkConflict(p2002({ target: ['ga_asset_id'] }))).toBe(true);
    expect(isGaAssetLinkConflict(p2002({ target: 'fixed_assets_ga_asset_id_key' }))).toBe(true);
  });

  it('ignores other unique violations and other errors', () => {
    expect(isGaAssetLinkConflict(p2002({ target: ['asset_number'] }))).toBe(false);
    expect(isGaAssetLinkConflict(new Error('x'))).toBe(false);
  });
});
