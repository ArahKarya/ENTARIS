import i18n from '@/i18n';

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
  if (t.startDate && t.endDate && t.endDate < t.startDate) e.endDate = i18n.t('finance:travel.errors.endBeforeStart');
  if (forSubmit) {
    if (t.destination.trim().length < 2) e.destination = i18n.t('finance:travel.errors.destination');
    if (!t.startDate) e.startDate = i18n.t('finance:travel.errors.startDate');
    if (!t.endDate) e.endDate ??= i18n.t('finance:travel.errors.endDate');
  }
  return e;
}
