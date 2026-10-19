/**
 * Resolve GA asset categories for the Kendaraan / Gedung / Peralatan pages: if any legacy
 * hard-coded id exists, use only those; otherwise match category codes, then names.
 */
import { prisma } from '../lib/prisma';

export type CategoryKind = 'vehicle' | 'building' | 'equipment';

const KINDS: readonly CategoryKind[] = ['vehicle', 'building', 'equipment'];

export const LEGACY_CATEGORY_IDS: Record<CategoryKind, readonly string[]> = {
  vehicle: ['cmq7ja1dc000001lpil7negq7'],
  building: ['cmq6bx8z30003vvqjbog7voys', 'cmq7ja1kg000401lp4k5obtk8'],
  equipment: ['cmq7ja1lo000501lpk8lwwi2q'],
};

const CODES: Record<CategoryKind, readonly string[]> = {
  vehicle: ['KENDARAAN', 'VEHICLE', 'KND'],
  building: ['BANGUNAN', 'GUDANG', 'GEDUNG', 'BUILDING', 'BLD'],
  equipment: ['EQUIPMENT', 'PERALATAN', 'ALAT_TIMBANG', 'EQP'],
};

const NAME_KEYWORDS: Record<CategoryKind, readonly string[]> = {
  vehicle: ['kendaraan', 'armada', 'vehicle'],
  building: ['gedung', 'bangunan', 'gudang', 'building'],
  equipment: ['peralatan', 'equipment', 'alat'],
};

/** undefined when absent, null when present but invalid. */
export function parseCategoryKind(value: unknown): CategoryKind | undefined | null {
  if (value === undefined || value === null || value === '') return undefined;
  return KINDS.includes(value as CategoryKind) ? (value as CategoryKind) : null;
}

interface CategoryRow {
  id: string;
  code: string;
  name: string;
}

export function pickCategoryIds(kind: CategoryKind, categories: readonly CategoryRow[]): string[] {
  const legacy = categories.filter((c) => LEGACY_CATEGORY_IDS[kind].includes(c.id));
  if (legacy.length > 0) return legacy.map((c) => c.id);

  const codes = CODES[kind];
  const byCode = categories.filter((c) => codes.includes(c.code.trim().toUpperCase()));
  if (byCode.length > 0) return byCode.map((c) => c.id);

  const words = NAME_KEYWORDS[kind];
  return categories.filter((c) => words.some((w) => c.name.toLowerCase().includes(w))).map((c) => c.id);
}

export async function resolveCategoryIds(kind: CategoryKind): Promise<string[]> {
  const categories = await prisma.gaAssetCategory.findMany({ select: { id: true, code: true, name: true } });
  return pickCategoryIds(kind, categories);
}
