/**
 * Three-way match (PO ↔ STT ↔ Faktur Pembelian) — pure, non-blocking.
 *
 * Per purchase-invoice line:
 *  - qty: invoice qty vs the linked STT line's received qty; and, when the STT
 *    line fulfils a PO line, the invoice qty summed per PO line vs ordered qty
 *    (over-billing only — billing less than ordered is normal for partial receipts).
 *  - price: invoice unit price (after line discount, before tax) vs PO
 *    estimated rate (after PO line discount). Only when PO-linked.
 *
 * Tolerances are module constants (CompanySettings has no purchasing-policy
 * slot yet); callers may pass overrides. A difference within tolerance is
 * "Sesuai". The result is advisory: it never blocks saving or posting.
 */

/** Allowed qty difference, % of the reference qty (0 = must match exactly). */
export const MATCH_QTY_TOLERANCE_PCT = 0;
/** Allowed unit-price difference, % of the PO net unit price. */
export const MATCH_PRICE_TOLERANCE_PCT = 2;

export interface MatchTolerance {
  qtyPct: number;
  pricePct: number;
}

export const DEFAULT_MATCH_TOLERANCE: MatchTolerance = {
  qtyPct: MATCH_QTY_TOLERANCE_PCT,
  pricePct: MATCH_PRICE_TOLERANCE_PCT,
};

const QTY_EPS = 0.0005; // qty stored with 3 decimals
const PRICE_EPS = 0.005; // money stored with 2 decimals

export interface MatchLineInput {
  key: string;
  itemName: string;
  unit?: string | null;
  invoiceQty: number;
  /** Net unit price (after line discount, before tax). */
  invoiceUnitPrice: number;
  /** STT line qty; null when the invoice line is not linked to an STT. */
  receiptQty: number | null;
  sttNumber?: string | null;
  poItemId: string | null;
  poNumber?: string | null;
  orderedQty: number | null;
  /** PO net unit price (estimatedRate after PO line discount). */
  poUnitPrice: number | null;
}

export type MatchLineStatus = 'match' | 'qty' | 'price' | 'qty_price' | 'unlinked';
export type MatchOverallStatus = 'match' | 'variance' | 'unlinked';

export interface MatchLineResult extends MatchLineInput {
  status: MatchLineStatus;
  /** invoiceQty − receiptQty. */
  qtyDiff: number | null;
  qtyDiffPct: number | null;
  /** Invoice qty (summed over this PO line) above the ordered qty, if any. */
  overOrderedQty: number | null;
  /** invoiceUnitPrice − poUnitPrice. */
  priceDiff: number | null;
  priceDiffPct: number | null;
  /** priceDiff × invoiceQty — the line's price variance in Rp. */
  priceVarianceAmount: number | null;
}

export interface MatchResult {
  status: MatchOverallStatus;
  tolerance: MatchTolerance;
  lines: MatchLineResult[];
  summary: {
    lines: number;
    matched: number;
    qtyVariance: number;
    priceVariance: number;
    unlinked: number;
    priceVarianceAmount: number;
  };
}

const round = (n: number, dp: number): number => {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON * Math.sign(n)) * f) / f;
};

/** Percentage of `diff` relative to `base`; null when base is 0. */
function pctOf(diff: number, base: number): number | null {
  if (Math.abs(base) < 1e-12) return null;
  return round((diff / Math.abs(base)) * 100, 2);
}

/** True when |diff| exceeds both the rounding epsilon and the % tolerance of base. */
export function exceedsTolerance(diff: number, base: number, tolPct: number, eps: number): boolean {
  const abs = Math.abs(diff);
  if (abs <= eps) return false;
  if (Math.abs(base) < 1e-12) return true;
  return (abs / Math.abs(base)) * 100 > tolPct + 1e-9;
}

export function computeThreeWayMatch(
  inputs: MatchLineInput[],
  tolerance: MatchTolerance = DEFAULT_MATCH_TOLERANCE,
): MatchResult {
  // Invoice qty summed per PO line (multi-STT: several invoice lines → one PO line).
  const billedPerPoItem = new Map<string, number>();
  for (const l of inputs) {
    if (l.poItemId) billedPerPoItem.set(l.poItemId, (billedPerPoItem.get(l.poItemId) ?? 0) + l.invoiceQty);
  }

  const lines = inputs.map((l): MatchLineResult => {
    const invoiceQty = round(l.invoiceQty, 3);
    const invoiceUnitPrice = round(l.invoiceUnitPrice, 2);

    let qtyDiff: number | null = null;
    let qtyDiffPct: number | null = null;
    let qtyBad = false;
    if (l.receiptQty != null) {
      const ref = round(l.receiptQty, 3);
      qtyDiff = round(invoiceQty - ref, 3);
      qtyDiffPct = pctOf(qtyDiff, ref);
      qtyBad = exceedsTolerance(qtyDiff, ref, tolerance.qtyPct, QTY_EPS);
    }

    let overOrderedQty: number | null = null;
    if (l.poItemId && l.orderedQty != null) {
      const ordered = round(l.orderedQty, 3);
      const over = round((billedPerPoItem.get(l.poItemId) ?? 0) - ordered, 3);
      if (over > 0 && exceedsTolerance(over, ordered, tolerance.qtyPct, QTY_EPS)) {
        overOrderedQty = over;
        qtyBad = true;
      }
    }

    let priceDiff: number | null = null;
    let priceDiffPct: number | null = null;
    let priceVarianceAmount: number | null = null;
    let priceBad = false;
    if (l.poItemId && l.poUnitPrice != null) {
      const ref = round(l.poUnitPrice, 2);
      priceDiff = round(invoiceUnitPrice - ref, 2);
      priceDiffPct = pctOf(priceDiff, ref);
      priceVarianceAmount = round(priceDiff * invoiceQty, 2);
      priceBad = exceedsTolerance(priceDiff, ref, tolerance.pricePct, PRICE_EPS);
    }

    const linked = l.receiptQty != null || l.poItemId != null;
    const status: MatchLineStatus = !linked
      ? 'unlinked'
      : qtyBad && priceBad
        ? 'qty_price'
        : qtyBad
          ? 'qty'
          : priceBad
            ? 'price'
            : 'match';

    return {
      ...l,
      invoiceQty,
      invoiceUnitPrice,
      status,
      qtyDiff,
      qtyDiffPct,
      overOrderedQty,
      priceDiff,
      priceDiffPct,
      priceVarianceAmount,
    };
  });

  const summary = {
    lines: lines.length,
    matched: lines.filter((l) => l.status === 'match').length,
    qtyVariance: lines.filter((l) => l.status === 'qty' || l.status === 'qty_price').length,
    priceVariance: lines.filter((l) => l.status === 'price' || l.status === 'qty_price').length,
    unlinked: lines.filter((l) => l.status === 'unlinked').length,
    priceVarianceAmount: round(
      lines.reduce((s, l) => s + (l.priceVarianceAmount ?? 0), 0),
      2,
    ),
  };

  const status: MatchOverallStatus =
    summary.qtyVariance + summary.priceVariance > 0
      ? 'variance'
      : summary.matched > 0
        ? 'match'
        : 'unlinked';

  return { status, tolerance, lines, summary };
}
