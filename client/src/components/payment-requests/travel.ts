/** Travel section state + validation of the payment request form (TRAVEL types). */
export interface TravelValue {
  destination: string;
  startDate: string;
  endDate: string;
  participants: string;
}

export const EMPTY_TRAVEL: TravelValue = { destination: '', startDate: '', endDate: '', participants: '' };

export type TravelErrors = Partial<Record<'destination' | 'startDate' | 'endDate', string>>;

/** Client-side check mirroring server/services/paymentRequestTravel.ts validateTravel. */
export function validateTravelValue(t: TravelValue, forSubmit: boolean): TravelErrors {
  const e: TravelErrors = {};
  if (t.startDate && t.endDate && t.endDate < t.startDate) e.endDate = 'Tanggal kembali tidak boleh sebelum tanggal berangkat.';
  if (forSubmit) {
    if (t.destination.trim().length < 2) e.destination = 'Isi kota/tujuan perjalanan.';
    if (!t.startDate) e.startDate = 'Isi tanggal berangkat.';
    if (!t.endDate) e.endDate ??= 'Isi tanggal kembali.';
  }
  return e;
}
