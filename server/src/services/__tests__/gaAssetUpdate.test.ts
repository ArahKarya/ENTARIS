import { describe, expect, it } from 'vitest';
import { buildAssetUpdateData } from '../gaAssetUpdate';

describe('buildAssetUpdateData', () => {
  it('leaves picUserId untouched when the body omits it (edit keeps PIC / driver)', () => {
    const data = buildAssetUpdateData({ name: 'Hilux', status: 'ACTIVE' });
    expect(data.picUserId).toBeUndefined();
    expect('picUserId' in data && data.picUserId !== undefined).toBe(false);
  });

  it('sets picUserId when provided', () => {
    expect(buildAssetUpdateData({ picUserId: 'user-1' }).picUserId).toBe('user-1');
  });

  it('clears picUserId on explicit null or empty string', () => {
    expect(buildAssetUpdateData({ picUserId: null }).picUserId).toBeNull();
    expect(buildAssetUpdateData({ picUserId: '' }).picUserId).toBeNull();
  });

  it('does not wipe other nullable fields that are absent from the body', () => {
    const data = buildAssetUpdateData({ name: 'Timbangan' });
    expect(data.costCenterId).toBeUndefined();
    expect(data.serialNumber).toBeUndefined();
    expect(data.acquisitionDate).toBeUndefined();
    expect(data.acquisitionCost).toBeUndefined();
    expect(data.location).toBeUndefined();
    expect(data.notes).toBeUndefined();
  });

  it('writes and clears acquisition data when sent', () => {
    const set = buildAssetUpdateData({ acquisitionDate: '2026-01-15', acquisitionCost: 5000 });
    expect(set.acquisitionDate).toEqual(new Date('2026-01-15'));
    expect(set.acquisitionCost).toBe(5000);
    const cleared = buildAssetUpdateData({ acquisitionDate: null, acquisitionCost: null, location: '' });
    expect(cleared.acquisitionDate).toBeNull();
    expect(cleared.acquisitionCost).toBeNull();
    expect(cleared.location).toBeNull();
  });

  it('ignores an empty code (keeps the existing one)', () => {
    expect(buildAssetUpdateData({ code: '' }).code).toBeUndefined();
    expect(buildAssetUpdateData({ code: 'KND-HO-0001' }).code).toBe('KND-HO-0001');
  });
});
