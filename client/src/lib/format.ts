/**
 * Single source for UI money, number and date formatting (id-ID). Display only: never feed these
 * strings back into calculations. Pair numbers with NUM_CLASS for tabular, non-wrapping figures.
 */

export const LOCALE = 'id-ID';
/** Shown for missing or invalid values. */
export const EMPTY_VALUE = '—';
/** Non-breaking space, as Intl uses between "Rp" and the amount. */
const NBSP = '\u00a0';
/** Tailwind utility defined in index.css: tabular-nums + lining-nums + nowrap. */
export const NUM_CLASS = 'num';

export type NumericInput = number | string | null | undefined;
export type DateInput = Date | string | number | null | undefined;

/** Coerces numbers and numeric strings (Prisma Decimal arrives as string). */
export function toNumber(value: NumericInput): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

const numberFormatCache = new Map<string, Intl.NumberFormat>();
function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let fmt = numberFormatCache.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(LOCALE, options);
    numberFormatCache.set(key, fmt);
  }
  return fmt;
}

/** Avoids "-0" / "-Rp 0" after rounding. */
function normalizeZero(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) === 0 ? 0 : n;
}

const COMPACT_UNITS: ReadonlyArray<{ value: number; suffix: string }> = [
  { value: 1e12, suffix: 'T' },
  { value: 1e9, suffix: 'M' },
  { value: 1e6, suffix: 'jt' },
  { value: 1e3, suffix: 'rb' },
];

function compactParts(abs: number): { scaled: number; suffix: string } {
  const unit = COMPACT_UNITS.find((u) => abs >= u.value);
  return unit ? { scaled: abs / unit.value, suffix: unit.suffix } : { scaled: abs, suffix: '' };
}

export interface RupiahOptions {
  /** Fraction digits (default 0). */
  decimals?: number;
  /** Short form with Indonesian units: rb, jt, M, T (e.g. "Rp 1,25 jt"). */
  compact?: boolean;
  /** Include the "Rp" symbol (default true). */
  symbol?: boolean;
  /** "minus" → -Rp 1.000 (default); "parens" → (Rp 1.000), accounting style. */
  negative?: 'minus' | 'parens';
}

export function formatRupiah(value: NumericInput, options: RupiahOptions = {}): string {
  const { decimals = 0, compact = false, symbol = true, negative = 'minus' } = options;
  const raw = toNumber(value);
  if (raw === null) return EMPTY_VALUE;
  const n = normalizeZero(raw, decimals);
  const abs = Math.abs(n);

  let body: string;
  if (compact) {
    const { scaled, suffix } = compactParts(abs);
    const digits = nf({ maximumFractionDigits: suffix ? 2 : decimals, minimumFractionDigits: 0 }).format(scaled);
    body = suffix ? `${digits}${NBSP}${suffix}` : digits;
  } else {
    body = nf({ minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(abs);
  }
  const withSymbol = symbol ? `Rp${NBSP}${body}` : body;
  if (n >= 0) return withSymbol;
  return negative === 'parens' ? `(${withSymbol})` : `-${withSymbol}`;
}

export interface NumberOptions {
  /** Fixed fraction digits. */
  decimals?: number;
  /** Up to this many fraction digits, trailing zeros dropped (ignored when `decimals` is set). */
  maxDecimals?: number;
}

export function formatNumber(value: NumericInput, options: NumberOptions = {}): string {
  const n = toNumber(value);
  if (n === null) return EMPTY_VALUE;
  const { decimals, maxDecimals = 0 } = options;
  const fmt =
    decimals !== undefined
      ? nf({ minimumFractionDigits: decimals, maximumFractionDigits: decimals })
      : nf({ minimumFractionDigits: 0, maximumFractionDigits: maxDecimals });
  return fmt.format(normalizeZero(n, decimals ?? maxDecimals));
}

/** Formats a ratio (0.125) as a percentage ("12,5%"). */
export function formatPercent(value: NumericInput, options: { decimals?: number } = {}): string {
  const n = toNumber(value);
  if (n === null) return EMPTY_VALUE;
  const { decimals = 1 } = options;
  return nf({ style: 'percent', minimumFractionDigits: 0, maximumFractionDigits: decimals }).format(n);
}

// Dates

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Parses Date | ISO string | epoch ms. Date-only strings ("2026-10-03") are
 * read as local calendar dates so they never shift a day across time zones.
 */
export function parseDate(value: DateInput): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const m = DATE_ONLY.exec(value);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export type DateStyle = 'short' | 'medium' | 'long' | 'numeric';

const DATE_STYLES: Record<DateStyle, Intl.DateTimeFormatOptions> = {
  short: { day: '2-digit', month: 'short' },
  medium: { day: '2-digit', month: 'short', year: 'numeric' },
  long: { day: 'numeric', month: 'long', year: 'numeric' },
  numeric: { day: '2-digit', month: '2-digit', year: 'numeric' },
};

const dateFormatCache = new Map<string, Intl.DateTimeFormat>();
function df(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let fmt = dateFormatCache.get(key);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(LOCALE, options);
    dateFormatCache.set(key, fmt);
  }
  return fmt;
}

/** "03 Okt 2026" (medium, default) · "03 Okt" · "3 Oktober 2026" · "03/10/2026" */
export function formatDate(value: DateInput, style: DateStyle = 'medium'): string {
  const d = parseDate(value);
  return d ? df(DATE_STYLES[style]).format(d) : EMPTY_VALUE;
}

/** "03 Okt 2026 14.05" */
export function formatDateTime(value: DateInput): string {
  const d = parseDate(value);
  if (!d) return EMPTY_VALUE;
  const time = df({ hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${formatDate(d)} ${time}`;
}

function monthShort(d: Date): string {
  return df({ month: 'short' }).format(d);
}

/**
 * Compact period labels:
 *   same month → "1–15 Okt 2026"
 *   same year  → "28 Sep – 3 Okt 2026"
 *   otherwise  → "30 Des 2025 – 2 Jan 2026"
 */
export function formatDateRange(start: DateInput, end: DateInput): string {
  const a = parseDate(start);
  const b = parseDate(end);
  const full = (d: Date) => `${d.getDate()} ${monthShort(d)} ${d.getFullYear()}`;
  if (!a && !b) return EMPTY_VALUE;
  if (a && !b) return `Sejak ${full(a)}`;
  if (!a && b) return `Sampai ${full(b)}`;
  const from = a as Date;
  const to = b as Date;
  const sameYear = from.getFullYear() === to.getFullYear();
  const sameMonth = sameYear && from.getMonth() === to.getMonth();
  if (sameMonth && from.getDate() === to.getDate()) return full(from);
  if (sameMonth) return `${from.getDate()}–${to.getDate()} ${monthShort(to)} ${to.getFullYear()}`;
  if (sameYear) return `${from.getDate()} ${monthShort(from)} – ${full(to)}`;
  return `${full(from)} – ${full(to)}`;
}
