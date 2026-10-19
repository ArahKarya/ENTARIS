import { describe, it, expect } from 'vitest';
import { daysUntil, deriveExpiryState, expiryDistance, formatFileSize } from './ga-document-model';

const NOW = new Date(2026, 9, 4, 10, 0); // 4 Oct 2026 10:00 local

describe('ga document model', () => {
  it('counts calendar days to the stored expiry date', () => {
    expect(daysUntil('2026-10-04T00:00:00.000Z', NOW)).toBe(0);
    expect(daysUntil('2026-10-20T00:00:00.000Z', NOW)).toBe(16);
    expect(daysUntil('2026-09-20T00:00:00.000Z', NOW)).toBe(-14);
  });

  it('mirrors the server expiry rule', () => {
    expect(deriveExpiryState({ status: 'ACTIVE', expiryDate: '2026-09-20T00:00:00.000Z' }, NOW)).toBe('expired');
    expect(deriveExpiryState({ status: 'ACTIVE', expiryDate: '2026-10-04T00:00:00.000Z' }, NOW)).toBe('expiring');
    expect(deriveExpiryState({ status: 'ACTIVE', expiryDate: '2026-11-03T00:00:00.000Z' }, NOW)).toBe('expiring');
    expect(deriveExpiryState({ status: 'ACTIVE', expiryDate: '2026-11-04T00:00:00.000Z' }, NOW)).toBe('valid');
    expect(deriveExpiryState({ status: 'ACTIVE', expiryDate: null }, NOW)).toBe('valid');
    expect(deriveExpiryState({ status: 'EXPIRED', expiryDate: null }, NOW)).toBe('expired');
    expect(deriveExpiryState({ status: 'ARCHIVED', expiryDate: '2026-09-20T00:00:00.000Z' }, NOW)).toBeNull();
  });

  it('describes distance and file size', () => {
    expect(expiryDistance('2026-10-04T00:00:00.000Z', NOW)).toBe('hari ini');
    expect(expiryDistance('2026-10-06T00:00:00.000Z', NOW)).toBe('2 hari lagi');
    expect(expiryDistance('2026-10-01T00:00:00.000Z', NOW)).toBe('lewat 3 hari');
    expect(formatFileSize(2048)).toBe('2 KB');
    expect(formatFileSize(0)).toBe('—');
  });
});
