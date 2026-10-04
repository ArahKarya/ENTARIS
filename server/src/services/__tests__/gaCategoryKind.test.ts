import { describe, it, expect } from 'vitest';
import { pickCategoryIds, parseCategoryKind, LEGACY_CATEGORY_IDS } from '../gaCategoryKind';

const cat = (id: string, code: string, name: string) => ({ id, code, name });

describe('parseCategoryKind', () => {
  it('accepts the three kinds and rejects anything else', () => {
    expect(parseCategoryKind('vehicle')).toBe('vehicle');
    expect(parseCategoryKind('building')).toBe('building');
    expect(parseCategoryKind('equipment')).toBe('equipment');
    expect(parseCategoryKind(undefined)).toBeUndefined();
    expect(parseCategoryKind('car')).toBeNull();
  });
});

describe('pickCategoryIds', () => {
  it('uses only the legacy ids when any of them exists (existing tenant unchanged)', () => {
    const legacy = LEGACY_CATEGORY_IDS.building;
    const cats = [
      cat(legacy[0], 'BANGUNAN', 'Bangunan'),
      cat('other', 'GEDUNG_BARU', 'Gedung Baru'),
    ];
    expect(pickCategoryIds('building', cats)).toEqual([legacy[0]]);
  });

  it('falls back to known codes when no legacy id exists', () => {
    const cats = [cat('k1', 'KENDARAAN', 'Kendaraan Operasional'), cat('x', 'IT_EQUIPMENT', 'IT')];
    expect(pickCategoryIds('vehicle', cats)).toEqual(['k1']);
  });

  it('falls back to name keywords when no code matches', () => {
    const cats = [cat('g1', 'GDG-01', 'Gedung Kantor'), cat('m1', 'MSN', 'Mesin Produksi')];
    expect(pickCategoryIds('building', cats)).toEqual(['g1']);
  });

  it('matches codes case-insensitively and returns every match', () => {
    const cats = [cat('b1', 'bangunan', 'B'), cat('b2', 'GUDANG', 'Gudang Bahan')];
    expect(pickCategoryIds('building', cats).sort()).toEqual(['b1', 'b2']);
  });

  it('returns an empty list when nothing matches', () => {
    expect(pickCategoryIds('equipment', [cat('t1', 'TANAH', 'Tanah')])).toEqual([]);
  });
});
