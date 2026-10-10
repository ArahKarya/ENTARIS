import { describe, expect, it } from 'vitest';
import { eamAssetOptions } from './eam-link';

const rows = [
  { id: 'g1', code: 'KND-01', name: 'Hilux', fixedAsset: null },
  { id: 'g2', code: 'MSN-01', name: 'Huller', fixedAsset: { id: 'fa-other', assetNumber: 'FA-0002' } },
  { id: 'g3', code: 'BLD-01', name: 'Gudang', fixedAsset: { id: 'fa-self', assetNumber: 'FA-0003' } },
];

describe('eamAssetOptions', () => {
  it('hides assets linked to another fixed asset', () => {
    expect(eamAssetOptions(rows, undefined, null).map((o) => o.value)).toEqual(['g1']);
  });

  it('keeps the asset linked to the fixed asset being edited', () => {
    expect(eamAssetOptions(rows, 'fa-self', null).map((o) => o.value)).toEqual(['g1', 'g3']);
  });

  it('adds the current link when it is not in the loaded list', () => {
    const opts = eamAssetOptions([], 'fa-self', { id: 'g9', code: 'IT-09', name: 'Server' });
    expect(opts).toEqual([{ value: 'g9', label: 'IT-09 · Server' }]);
  });
});
