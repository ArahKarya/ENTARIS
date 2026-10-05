import type { PeriodRange } from '../DashboardPeriodFilter';

const DAY = 86_400_000;

function parse(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

/**
 * Comparison window for "delta vs previous period", like-for-like:
 * month/quarter/12-month/custom compare against the contiguous window just before
 * (same elapsed length); YTD compares against the same dates a year earlier.
 * Returns null for "Seluruh Periode" (nothing to compare) or invalid input.
 */
export function previousPeriod(period: PeriodRange, today: Date = new Date()): { startDate: string; endDate: string } | null {
  if (period.preset === 'all') return null;
  const start = parse(period.startDate);
  const end = parse(period.endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return null;

  const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const effectiveEnd = end < todayMid ? end : todayMid;
  if (effectiveEnd < start) return null; // period entirely in the future
  const len = daysBetween(start, effectiveEnd) + 1;

  if (period.preset === 'ytd') {
    const prevStart = new Date(start.getFullYear() - 1, start.getMonth(), start.getDate());
    return { startDate: toISO(prevStart), endDate: toISO(addDays(prevStart, len - 1)) };
  }

  const fullLen = daysBetween(start, end) + 1;
  let prevStart: Date;
  switch (period.preset) {
    case 'thisMonth':
    case 'lastMonth':
      prevStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
      break;
    case 'thisQuarter':
      prevStart = new Date(start.getFullYear(), start.getMonth() - 3, 1);
      break;
    case 'last12Months':
      prevStart = new Date(start.getFullYear(), start.getMonth() - 12, 1);
      break;
    default:
      prevStart = addDays(start, -fullLen);
  }
  const naturalEnd = addDays(start, -1);
  const candidate = addDays(prevStart, len - 1);
  return { startDate: toISO(prevStart), endDate: toISO(candidate < naturalEnd ? candidate : naturalEnd) };
}

/** Percentage change as a signed display string; null when previous is 0/invalid. */
export function deltaPct(current: number, previous: number): { text: string; direction: 'up' | 'down' | 'flat' } | null {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return { text: '0%', direction: 'flat' };
  const text = `${rounded > 0 ? '+' : '-'}${Math.abs(rounded).toLocaleString('id-ID', { maximumFractionDigits: 1 })}%`;
  return { text, direction: rounded > 0 ? 'up' : 'down' };
}
