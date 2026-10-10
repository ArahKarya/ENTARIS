// Link between a fixed asset (accounting) and its EAM asset (GaAsset). One fixed asset per
// EAM asset: FixedAsset.gaAssetId is unique, and a duplicate is rejected with a clear message
// before the write (the unique index still guards concurrent requests).

import { Prisma } from '@prisma/client';

type LinkDb = {
  gaAsset: Pick<Prisma.TransactionClient['gaAsset'], 'findUnique'>;
  fixedAsset: Pick<Prisma.TransactionClient['fixedAsset'], 'findFirst'>;
};

export type GaAssetLinkResult =
  | { ok: true; gaAssetId: string | null | undefined }
  | { ok: false; status: number; error: string };

export const GA_ASSET_LINK_INCLUDE = { gaAsset: { select: { id: true, code: true, name: true } } } as const;

/**
 * Validates the requested EAM link. `undefined` = leave unchanged, '' / null = unlink.
 * `selfId` is the fixed asset being edited (its own current link is not a duplicate).
 */
export async function resolveGaAssetLink(
  db: LinkDb,
  gaAssetId: string | null | undefined,
  selfId?: string,
): Promise<GaAssetLinkResult> {
  if (gaAssetId === undefined) return { ok: true, gaAssetId: undefined };
  const id = gaAssetId?.trim() || null;
  if (!id) return { ok: true, gaAssetId: null };

  const gaAsset = await db.gaAsset.findUnique({ where: { id }, select: { id: true } });
  if (!gaAsset) return { ok: false, status: 400, error: 'Aset EAM yang dipilih tidak ditemukan.' };

  const taken = await db.fixedAsset.findFirst({
    where: { gaAssetId: id, ...(selfId ? { id: { not: selfId } } : {}) },
    select: { assetNumber: true, name: true },
  });
  if (taken) {
    return {
      ok: false,
      status: 409,
      error: `Aset EAM ini sudah ditautkan ke aset tetap ${taken.assetNumber} (${taken.name}). Satu aset EAM hanya boleh punya satu aset tetap.`,
    };
  }
  return { ok: true, gaAssetId: id };
}

/** True when a write failed on the unique gaAssetId index (concurrent link). */
export function isGaAssetLinkConflict(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  // Prisma 7 driver adapters report the constraint in different meta shapes; search all of it.
  const text = JSON.stringify(error.meta ?? {});
  return text.includes('ga_asset_id') || text.includes('gaAssetId');
}

export const GA_ASSET_LINK_CONFLICT_MESSAGE =
  'Aset EAM ini sudah ditautkan ke aset tetap lain. Satu aset EAM hanya boleh punya satu aset tetap.';
