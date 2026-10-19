import type { TravelCategory } from './payment-request';

/** Draft expense lines of the payment request form (also the settlement realization lines). */
export interface DraftLine {
  key: string;
  description: string;
  amount: number | null;
  expenseDate: string;
  expenseAccountId: string | null;
  /** Perjalanan dinas only. */
  category: TravelCategory | null;
  /** Tarif × jumlah (e.g. uang saku = tarif × hari); amount follows when both are set. */
  unitAmount: number | null;
  quantity: number | null;
  /** Settlement lines: the planned request line this one realizes. */
  plannedLineId: string | null;
}

let seq = 0;
export const newLine = (over: Partial<DraftLine> = {}): DraftLine => ({
  key: `l${Date.now()}-${(seq += 1)}`,
  description: '',
  amount: null,
  expenseDate: '',
  expenseAccountId: null,
  category: null,
  unitAmount: null,
  quantity: null,
  plannedLineId: null,
  ...over,
});

export const linesTotal = (lines: readonly DraftLine[]): number =>
  Math.round(lines.reduce((s, l) => s + (l.amount ?? 0), 0) * 100) / 100;

/** amount = tarif × jumlah, rounded to cents; null until both are filled. */
export const rateAmount = (unitAmount: number | null, quantity: number | null): number | null =>
  unitAmount && quantity ? Math.round(unitAmount * quantity * 100) / 100 : null;

/** Totals per travel category (uncategorised lines count as Lain-lain). */
export function totalsByCategory(lines: ReadonlyArray<{ category: TravelCategory | null; amount: number | null }>): Map<TravelCategory, number> {
  const out = new Map<TravelCategory, number>();
  for (const l of lines) {
    const key = l.category ?? 'OTHER';
    out.set(key, Math.round(((out.get(key) ?? 0) + (l.amount ?? 0)) * 100) / 100);
  }
  return out;
}
