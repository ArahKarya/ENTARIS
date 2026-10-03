import { describe, expect, it } from 'vitest';
import {
  EMPTY_VALUE,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatNumber,
  formatPercent,
  formatRupiah,
  NUM_CLASS,
  parseDate,
} from './format';

/** Intl uses NBSP between "Rp" and the amount; normalise for readable asserts. */
const plain = (s: string) => s.replace(/\u00a0/g, ' ');

describe('formatRupiah', () => {
  it('formats with id-ID grouping and no decimals by default', () => {
    expect(plain(formatRupiah(1250000))).toBe('Rp 1.250.000');
    expect(plain(formatRupiah(0))).toBe('Rp 0');
  });

  it('accepts numeric strings (Prisma Decimal serialises as string)', () => {
    expect(plain(formatRupiah('1500000.00'))).toBe('Rp 1.500.000');
  });

  it('supports decimals', () => {
    expect(plain(formatRupiah(1234.5, { decimals: 2 }))).toBe('Rp 1.234,50');
  });

  it('renders negatives with a minus sign by default and parentheses on request', () => {
    expect(plain(formatRupiah(-50000))).toBe('-Rp 50.000');
    expect(plain(formatRupiah(-50000, { negative: 'parens' }))).toBe('(Rp 50.000)');
  });

  it('can omit the symbol', () => {
    expect(formatRupiah(1250000, { symbol: false })).toBe('1.250.000');
  });

  it('formats compact values in Indonesian units', () => {
    expect(plain(formatRupiah(1_250_000, { compact: true }))).toBe('Rp 1,25 jt');
    expect(plain(formatRupiah(3_400_000_000, { compact: true }))).toBe('Rp 3,4 M');
    expect(plain(formatRupiah(2_000_000_000_000, { compact: true }))).toBe('Rp 2 T');
    expect(plain(formatRupiah(950, { compact: true }))).toBe('Rp 950');
  });

  it('returns the empty marker for null, undefined and non-numeric input', () => {
    expect(formatRupiah(null)).toBe(EMPTY_VALUE);
    expect(formatRupiah(undefined)).toBe(EMPTY_VALUE);
    expect(formatRupiah('abc')).toBe(EMPTY_VALUE);
    expect(formatRupiah(Number.NaN)).toBe(EMPTY_VALUE);
  });

  it('never rounds -0 into "-Rp 0"', () => {
    expect(plain(formatRupiah(-0.2))).toBe('Rp 0');
  });
});

describe('formatNumber', () => {
  it('groups with dots and uses a decimal comma', () => {
    expect(formatNumber(1234567)).toBe('1.234.567');
    expect(formatNumber(1234.567, { decimals: 2 })).toBe('1.234,57');
  });

  it('keeps up to maxDecimals without trailing zeros', () => {
    expect(formatNumber(12.5, { maxDecimals: 3 })).toBe('12,5');
    expect(formatNumber(12, { maxDecimals: 3 })).toBe('12');
  });

  it('handles empty input', () => {
    expect(formatNumber(null)).toBe(EMPTY_VALUE);
  });
});

describe('formatPercent', () => {
  it('formats a ratio as percent', () => {
    expect(formatPercent(0.125)).toBe('12,5%');
    expect(formatPercent(0.11, { decimals: 0 })).toBe('11%');
  });
});

describe('parseDate', () => {
  it('parses date-only strings as local calendar dates (no UTC shift)', () => {
    const d = parseDate('2026-10-03');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(9);
    expect(d?.getDate()).toBe(3);
  });

  it('returns null for empty or invalid values', () => {
    expect(parseDate(null)).toBeNull();
    expect(parseDate('')).toBeNull();
    expect(parseDate('not a date')).toBeNull();
  });
});

describe('formatDate', () => {
  const d = new Date(2026, 9, 3, 14, 5);

  it('defaults to medium style (03 Okt 2026)', () => {
    expect(formatDate(d)).toBe('03 Okt 2026');
  });

  it('supports short, long and numeric styles', () => {
    expect(formatDate(d, 'short')).toBe('03 Okt');
    expect(formatDate(d, 'long')).toBe('3 Oktober 2026');
    expect(formatDate(d, 'numeric')).toBe('03/10/2026');
  });

  it('accepts ISO date strings', () => {
    expect(formatDate('2026-01-15')).toBe('15 Jan 2026');
  });

  it('returns the empty marker for missing dates', () => {
    expect(formatDate(undefined)).toBe(EMPTY_VALUE);
    expect(formatDate('garbage')).toBe(EMPTY_VALUE);
  });
});

describe('formatDateTime', () => {
  it('appends 24h time with a dot separator (id-ID)', () => {
    expect(formatDateTime(new Date(2026, 9, 3, 14, 5))).toBe('03 Okt 2026 14.05');
  });
});

describe('formatDateRange', () => {
  it('collapses a range within one month', () => {
    expect(formatDateRange('2026-10-01', '2026-10-15')).toBe('1–15 Okt 2026');
  });

  it('collapses a range within one year', () => {
    expect(formatDateRange('2026-09-28', '2026-10-03')).toBe('28 Sep – 3 Okt 2026');
  });

  it('shows both years across years', () => {
    expect(formatDateRange('2025-12-30', '2026-01-02')).toBe('30 Des 2025 – 2 Jan 2026');
  });

  it('shows a single date when start equals end', () => {
    expect(formatDateRange('2026-10-03', '2026-10-03')).toBe('3 Okt 2026');
  });

  it('handles open-ended ranges', () => {
    expect(formatDateRange('2026-10-03', null)).toBe('Sejak 3 Okt 2026');
    expect(formatDateRange(null, '2026-10-03')).toBe('Sampai 3 Okt 2026');
    expect(formatDateRange(null, null)).toBe(EMPTY_VALUE);
  });
});

describe('NUM_CLASS', () => {
  it('points at the tabular-figures utility', () => {
    expect(NUM_CLASS).toBe('num');
  });
});
