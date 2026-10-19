import { describe, it, expect } from 'vitest';
import { parseSort } from '../../utils/listQuery';
import {
  DEFAULT_FIXED_ASSET_SORT,
  FIXED_ASSET_SORT_FIELDS,
  buildFixedAssetWhere,
  fixedAssetOrderBy,
} from '../fixedAssetList';

describe('buildFixedAssetWhere', () => {
  it('returns an empty where without filters', () => {
    expect(buildFixedAssetWhere({})).toEqual({ ok: true, where: {} });
  });

  it('maps status, category and search', () => {
    const r = buildFixedAssetWhere({ status: 'Active', category: 'Kendaraan', search: ' fa-00 ' });
    expect(r.ok && r.where).toEqual({
      AND: [
        { status: 'Active' },
        { category: 'Kendaraan' },
        {
          OR: [
            { assetNumber: { contains: 'fa-00', mode: 'insensitive' } },
            { name: { contains: 'fa-00', mode: 'insensitive' } },
            { category: { contains: 'fa-00', mode: 'insensitive' } },
          ],
        },
      ],
    });
  });

  it('filters the acquisition date by business-day range (WIB by default)', () => {
    const r = buildFixedAssetWhere({ startDate: '2026-01-01', endDate: '2026-01-31' });
    expect(r.ok && r.where).toEqual({
      AND: [
        {
          acquisitionDate: {
            gte: new Date('2026-01-01T00:00:00.000+07:00'),
            lt: new Date('2026-02-01T00:00:00.000+07:00'),
          },
        },
      ],
    });
  });

  it('accepts an open-ended range', () => {
    const r = buildFixedAssetWhere({ endDate: '2026-03-31' });
    expect(r.ok && r.where).toEqual({
      AND: [{ acquisitionDate: { lt: new Date('2026-04-01T00:00:00.000+07:00') } }],
    });
  });

  it('rejects an unknown status and a malformed date', () => {
    expect(buildFixedAssetWhere({ status: 'Sold' }).ok).toBe(false);
    expect(buildFixedAssetWhere({ startDate: '01-01-2026' }).ok).toBe(false);
  });
});

describe('fixedAssetOrderBy', () => {
  it('defaults to newest first like the legacy list, tie-broken by asset number', () => {
    expect(fixedAssetOrderBy(DEFAULT_FIXED_ASSET_SORT)).toEqual([{ createdAt: 'desc' }, { assetNumber: 'desc' }]);
  });

  it('sorts amounts and dates with an asset-number tie-breaker', () => {
    expect(fixedAssetOrderBy({ field: 'bookValue', dir: 'asc' })).toEqual([{ bookValue: 'asc' }, { assetNumber: 'asc' }]);
    expect(fixedAssetOrderBy({ field: 'acquisitionDate', dir: 'desc' })).toEqual([
      { acquisitionDate: 'desc' },
      { assetNumber: 'desc' },
    ]);
  });

  it('does not repeat the asset number when sorting by it', () => {
    expect(fixedAssetOrderBy({ field: 'assetNumber', dir: 'asc' })).toEqual([{ assetNumber: 'asc' }]);
  });

  it('only accepts whitelisted sort fields', () => {
    expect(parseSort('-bookValue', FIXED_ASSET_SORT_FIELDS, DEFAULT_FIXED_ASSET_SORT)).toEqual({
      field: 'bookValue',
      dir: 'desc',
    });
    expect(parseSort('-fiscalYearId', FIXED_ASSET_SORT_FIELDS, DEFAULT_FIXED_ASSET_SORT)).toEqual(
      DEFAULT_FIXED_ASSET_SORT,
    );
  });
});
