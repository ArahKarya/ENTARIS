import { describe, expect, it } from 'vitest';
import { computePaymentInfo, deriveDisplayStatus } from '../proformaStatus';

const NOW = new Date('2026-10-20T08:00:00Z');
const FUTURE = new Date('2026-11-30T00:00:00Z');
const PAST = new Date('2026-10-01T00:00:00Z');

describe('computePaymentInfo', () => {
  it('tagih penuh bila requestedAmount kosong', () => {
    const p = computePaymentInfo(1000000, null, []);
    expect(p).toEqual({ target: 1000000, paid: 0, remaining: 1000000, paidPct: 0 });
  });

  it('memakai requestedAmount sebagai target DP', () => {
    const p = computePaymentInfo(10000000, 3000000, [1000000]);
    expect(p.target).toBe(3000000);
    expect(p.remaining).toBe(2000000);
    expect(p.paidPct).toBe(33.3);
  });

  it('sisa tidak negatif dan persen dibatasi 100 saat kelebihan bayar', () => {
    const p = computePaymentInfo(1000000, 1000000, [700000, 500000]);
    expect(p.paid).toBe(1200000);
    expect(p.remaining).toBe(0);
    expect(p.paidPct).toBe(100);
  });

  it('presisi desimal tidak bocor (0.1 + 0.2)', () => {
    expect(computePaymentInfo(0.3, null, [0.1, 0.2]).remaining).toBe(0);
  });
});

describe('deriveDisplayStatus', () => {
  const none = computePaymentInfo(1000000, null, []);
  const part = computePaymentInfo(1000000, null, [400000]);
  const full = computePaymentInfo(1000000, null, [1000000]);

  it('status tersimpan Draft/Converted/Cancelled dipertahankan apa adanya', () => {
    for (const s of ['Draft', 'Converted', 'Cancelled'] as const) {
      expect(deriveDisplayStatus(s, PAST, full, NOW)).toBe(s);
    }
  });

  it('Sent tanpa DP dan masih berlaku tetap Sent', () => {
    expect(deriveDisplayStatus('Sent', FUTURE, none, NOW)).toBe('Sent');
  });

  it('Sent lewat tanggal tanpa DP menjadi Expired', () => {
    expect(deriveDisplayStatus('Sent', PAST, none, NOW)).toBe('Expired');
  });

  it('berlaku sampai AKHIR hari validUntil', () => {
    expect(deriveDisplayStatus('Sent', new Date('2026-10-20T00:00:00Z'), none, NOW)).toBe('Sent');
    expect(deriveDisplayStatus('Sent', new Date('2026-10-19T00:00:00Z'), none, NOW)).toBe('Expired');
  });

  it('DP sebagian -> PartiallyPaid, lunas -> Paid', () => {
    expect(deriveDisplayStatus('Sent', FUTURE, part, NOW)).toBe('PartiallyPaid');
    expect(deriveDisplayStatus('Sent', FUTURE, full, NOW)).toBe('Paid');
  });

  it('pembayaran menang atas kedaluwarsa (DP sudah masuk)', () => {
    expect(deriveDisplayStatus('Sent', PAST, part, NOW)).toBe('PartiallyPaid');
    expect(deriveDisplayStatus('Sent', PAST, full, NOW)).toBe('Paid');
  });
});
