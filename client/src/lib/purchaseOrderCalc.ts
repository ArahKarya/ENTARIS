/**
 * Mirrors server/src/services/purchaseOrderCalc.ts: net = qty × rate × (1 − disc%); amount = net + net × taxPct%;
 * grand total = Σ amount + other costs. Every step rounds half-up to 2 decimals (decimal.js ROUND_HALF_UP).
 */

/** Half-up rounding to 2 dp without binary float drift (33.335 → 33.34). */
export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const clean = Number(value.toPrecision(12));
  const sign = clean < 0 ? -1 : 1;
  return (sign * Math.round(Number(`${Math.abs(clean)}e2`))) / 100;
}

export interface PoLineInput {
  quantity: number;
  estimatedRate: number;
  discount?: number;
  taxPct?: number;
}

export interface PoLineTotals {
  gross: number;
  net: number;
  discountAmount: number;
  taxAmount: number;
  amount: number;
}

export interface PoTotals {
  lines: PoLineTotals[];
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  otherCosts: number;
  grandTotal: number;
}

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function computePoLine(line: PoLineInput): PoLineTotals {
  const qty = num(line.quantity);
  const rate = num(line.estimatedRate);
  const base = qty * rate;
  const gross = round2(base);
  const net = round2(base - base * (num(line.discount) / 100));
  const taxAmount = round2(net * (num(line.taxPct) / 100));
  return { gross, net, discountAmount: round2(gross - net), taxAmount, amount: round2(net + taxAmount) };
}

export function computePoTotals(items: PoLineInput[], otherCosts = 0): PoTotals {
  const lines = items.map(computePoLine);
  const sum = (pick: (l: PoLineTotals) => number) => round2(lines.reduce((s, l) => s + pick(l), 0));
  const other = round2(num(otherCosts));
  return {
    lines,
    subtotal: sum((l) => l.gross),
    discountTotal: sum((l) => l.discountAmount),
    taxTotal: sum((l) => l.taxAmount),
    otherCosts: other,
    grandTotal: round2(sum((l) => l.amount) + other),
  };
}

/** Payment term presets (days); 0 = Tunai. */
export const PAYMENT_TERM_PRESETS = [0, 7, 14, 30, 45, 60] as const;

export function paymentTermLabel(days: number | null | undefined): string {
  if (days == null) return '—';
  return days === 0 ? 'Tunai' : `${days} hari`;
}

/** Due date (YYYY-MM-DD) = PO date + term days; null when either is missing. */
export function poDueDate(date: string | null | undefined, days: number | null | undefined): string | null {
  if (!date || days == null) return null;
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
