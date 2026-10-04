/**
 * Perjalanan dinas (type.kind = TRAVEL) — pure helpers: line categories,
 * trip duration and the travel-section validation used by
 * paymentRequestService (save + submit). No database access.
 */
import Decimal from 'decimal.js';
import type { Check } from './paymentRequestRules';

export const TRAVEL_CATEGORIES = ['TRANSPORT', 'LODGING', 'PER_DIEM', 'MEALS', 'OTHER'] as const;
export type TravelCategory = (typeof TRAVEL_CATEGORIES)[number];

export const TRAVEL_CATEGORY_LABEL: Record<TravelCategory, string> = {
  TRANSPORT: 'Transportasi',
  LODGING: 'Penginapan',
  PER_DIEM: 'Uang Saku/Harian',
  MEALS: 'Konsumsi',
  OTHER: 'Lain-lain',
};

const ok: Check = { ok: true };
const fail = (error: string): Check => ({ ok: false, error });

const DAY_MS = 86_400_000;
const isoDayMs = (d: string): number => Date.parse(`${d}T00:00:00.000Z`);

/** Inclusive number of days of the trip (same day = 1). null when a date is missing/invalid. */
export function tripDays(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const s = isoDayMs(start);
  const e = isoDayMs(end);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
  return Math.round((e - s) / DAY_MS) + 1;
}

export interface TravelInput {
  travelDestination?: string | null;
  travelStartDate?: string | null;
  travelEndDate?: string | null;
}

/**
 * Travel section rules. Consistency (return ≥ departure) is checked on every
 * save; completeness (destination + both dates) only when submitting, so a
 * half-filled draft can still be saved.
 */
export function validateTravel(kind: string, travel: TravelInput, forSubmit: boolean): Check {
  if (kind !== 'TRAVEL') return ok;
  const { travelDestination, travelStartDate, travelEndDate } = travel;
  if (travelStartDate && travelEndDate && isoDayMs(travelEndDate) < isoDayMs(travelStartDate)) {
    return fail('Tanggal kembali tidak boleh sebelum tanggal berangkat.');
  }
  if (forSubmit) {
    if (!travelDestination || travelDestination.trim().length < 2) return fail('Isi kota/tujuan perjalanan dinas.');
    if (!travelStartDate || !travelEndDate) return fail('Isi tanggal berangkat dan tanggal kembali.');
  }
  return ok;
}

/** quantity × unitAmount must equal the line amount (when both are given). */
export function checkLineRate(
  line: { amount: Decimal.Value; quantity?: Decimal.Value | null; unitAmount?: Decimal.Value | null },
  label: string,
): Check {
  if (line.quantity == null && line.unitAmount == null) return ok;
  if (line.quantity == null || line.unitAmount == null) return fail(`${label}: isi tarif dan jumlah hari/unit sekaligus.`);
  const expected = new Decimal(line.quantity).times(line.unitAmount);
  if (expected.minus(line.amount).abs().gt(0.01)) {
    return fail(`${label}: nominal harus sama dengan tarif × jumlah (${expected.toDecimalPlaces(2).toString()}).`);
  }
  return ok;
}
