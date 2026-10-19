import { describe, it, expect } from 'vitest';
import {
  buildGaDocumentWhere,
  businessDate,
  daysToExpiry,
  deriveExpiryState,
  expiryWhere,
  expiryWindow,
  gaDocumentOrderBy,
} from '../gaDocumentList';

const WIB = '+07:00';
// 2026-10-04 10:00 WIB
const NOW = new Date('2026-10-04T03:00:00.000Z');
const win = expiryWindow(NOW, WIB);

describe('expiryWindow', () => {
  it('spans today … today + 30 days in the business time zone', () => {
    expect(win.gte.toISOString()).toBe('2026-10-03T17:00:00.000Z'); // Oct 4 00:00 WIB
    expect(win.lt.toISOString()).toBe('2026-11-03T17:00:00.000Z'); // Nov 4 00:00 WIB (Nov 3 included)
  });

  it('uses the business calendar day, not the UTC one', () => {
    // 2026-10-04 23:30 UTC is already Oct 5 in WIB.
    expect(businessDate(new Date('2026-10-04T23:30:00.000Z'), WIB)).toBe('2026-10-05');
  });
});

describe('deriveExpiryState', () => {
  const at = (iso: string) => new Date(iso);
  it('classifies active documents by expiry date', () => {
    expect(deriveExpiryState('ACTIVE', at('2026-10-03T00:00:00.000Z'), win)).toBe('expired');
    // Stored at UTC midnight of today → still valid today ("segera").
    expect(deriveExpiryState('ACTIVE', at('2026-10-04T00:00:00.000Z'), win)).toBe('expiring');
    expect(deriveExpiryState('ACTIVE', at('2026-11-03T00:00:00.000Z'), win)).toBe('expiring');
    expect(deriveExpiryState('ACTIVE', at('2026-11-04T00:00:00.000Z'), win)).toBe('valid');
    expect(deriveExpiryState('ACTIVE', null, win)).toBe('valid');
  });

  it('treats EXPIRED as expired and ignores revoked / archived documents', () => {
    expect(deriveExpiryState('EXPIRED', null, win)).toBe('expired');
    expect(deriveExpiryState('REVOKED', at('2026-10-01T00:00:00.000Z'), win)).toBeNull();
    expect(deriveExpiryState('ARCHIVED', null, win)).toBeNull();
  });
});

describe('expiryWhere', () => {
  it('mirrors deriveExpiryState', () => {
    expect(expiryWhere('expired', win)).toEqual({
      OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', expiryDate: { lt: win.gte } }],
    });
    expect(expiryWhere('expiring', win)).toEqual({ status: 'ACTIVE', expiryDate: { gte: win.gte, lt: win.lt } });
    expect(expiryWhere('valid', win)).toEqual({
      status: 'ACTIVE',
      OR: [{ expiryDate: null }, { expiryDate: { gte: win.lt } }],
    });
  });
});

describe('buildGaDocumentWhere', () => {
  it('returns an empty where without filters', () => {
    expect(buildGaDocumentWhere({}, NOW)).toEqual({ ok: true, where: {} });
  });

  it('combines type, asset, status, expiry and search', () => {
    const r = buildGaDocumentWhere(
      { typeId: 't1', assetId: 'a1', status: 'ACTIVE', expiry: 'expiring', search: 'kir' },
      NOW,
    );
    if (!r.ok) throw new Error('expected ok');
    const and = (r.where as { AND: unknown[] }).AND;
    expect(and.slice(0, 3)).toEqual([{ typeId: 't1' }, { assetId: 'a1' }, { status: 'ACTIVE' }]);
    expect(and[3]).toEqual(expiryWhere('expiring', expiryWindow(NOW)));
    expect(JSON.stringify(and[4])).toContain('"asset":{"name"');
  });

  it('rejects unknown status and expiry values', () => {
    expect(buildGaDocumentWhere({ status: 'DRAFT' }, NOW).ok).toBe(false);
    expect(buildGaDocumentWhere({ expiry: 'soon' }, NOW).ok).toBe(false);
  });
});

describe('ordering and legacy helpers', () => {
  it('keeps documents without expiry last and breaks ties by code', () => {
    expect(gaDocumentOrderBy({ field: 'expiryDate', dir: 'asc' })).toEqual([
      { expiryDate: { sort: 'asc', nulls: 'last' } },
      { code: 'asc' },
    ]);
    expect(gaDocumentOrderBy({ field: 'code', dir: 'desc' })).toEqual([{ code: 'desc' }]);
  });

  it('computes daysToExpiry like the legacy list', () => {
    expect(daysToExpiry(null, NOW)).toBeNull();
    expect(daysToExpiry(new Date('2026-10-20T00:00:00.000Z'), NOW)).toBe(15);
    expect(daysToExpiry(new Date('2026-09-20T00:00:00.000Z'), NOW)).toBe(-15);
  });
});
