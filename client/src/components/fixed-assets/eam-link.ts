/** Options for the "Aset EAM terkait" picker on the fixed asset forms. */
import type { ComboboxOption } from '@/components/shared';

export interface EamAssetRef {
  id: string;
  code: string;
  name: string;
}

/** Row of GET /ga/assets (only the fields the picker needs). */
export interface EamAssetListRow extends EamAssetRef {
  fixedAsset?: { id: string; assetNumber: string } | null;
}

/**
 * EAM assets that can be linked to the fixed asset `selfId` (undefined = new asset):
 * assets already linked to another fixed asset are left out (the server rejects them too),
 * and the current link always stays selectable even when it is not in the loaded page.
 */
export function eamAssetOptions(
  rows: readonly EamAssetListRow[],
  selfId: string | undefined,
  current: EamAssetRef | null | undefined,
): ComboboxOption[] {
  const options: ComboboxOption[] = rows
    .filter((r) => !r.fixedAsset || r.fixedAsset.id === selfId)
    .map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }));
  if (current && !options.some((o) => o.value === current.id)) {
    options.unshift({ value: current.id, label: `${current.code} · ${current.name}` });
  }
  return options;
}
