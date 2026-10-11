/**
 * Three-way match (PO ↔ STT ↔ Invoice) — client types + status → label/tone
 * mapping. Mirrors server/src/services/threeWayMatch.ts (result shape).
 */
import i18n from '@/i18n';
import { formatNumber, formatRupiah } from '@/lib/format';

export type MatchLineStatus = 'match' | 'qty' | 'price' | 'qty_price' | 'unlinked';
export type MatchOverallStatus = 'match' | 'variance' | 'unlinked';
export type MatchTone = 'success' | 'warning' | 'neutral';

export interface MatchLine {
  key: string;
  itemName: string;
  unit?: string | null;
  invoiceQty: number;
  invoiceUnitPrice: number;
  receiptQty: number | null;
  sttNumber?: string | null;
  poItemId: string | null;
  poNumber?: string | null;
  orderedQty: number | null;
  poUnitPrice: number | null;
  status: MatchLineStatus;
  qtyDiff: number | null;
  qtyDiffPct: number | null;
  overOrderedQty: number | null;
  priceDiff: number | null;
  priceDiffPct: number | null;
  priceVarianceAmount: number | null;
}

export interface MatchResult {
  status: MatchOverallStatus;
  tolerance: { qtyPct: number; pricePct: number };
  lines: MatchLine[];
  summary: {
    lines: number;
    matched: number;
    qtyVariance: number;
    priceVariance: number;
    unlinked: number;
    priceVarianceAmount: number;
  };
}

export interface MatchItemPayload {
  itemName?: string | null;
  unit?: string | null;
  quantity: number;
  timbanganDiterima?: number | null;
  rate: number;
  discount?: number | null;
  goodsReceiptItemId?: string | null;
}

type StatusMetaKey = { key: 'match' | 'qty' | 'price' | 'qtyPrice' | 'unlinked' | 'variance' | 'notLinked'; tone: MatchTone };

/** Label keys (purchasing:threeWayMatch.status.*), translated when read so they follow the UI language. */
const LINE_STATUS_KEYS: Record<MatchLineStatus, StatusMetaKey> = {
  match: { key: 'match', tone: 'success' },
  qty: { key: 'qty', tone: 'warning' },
  price: { key: 'price', tone: 'warning' },
  qty_price: { key: 'qtyPrice', tone: 'warning' },
  unlinked: { key: 'unlinked', tone: 'neutral' },
};

const OVERALL_STATUS_KEYS: Record<MatchOverallStatus, StatusMetaKey> = {
  match: { key: 'match', tone: 'success' },
  variance: { key: 'variance', tone: 'warning' },
  unlinked: { key: 'notLinked', tone: 'neutral' },
};

const toMeta = ({ key, tone }: StatusMetaKey) => ({ label: i18n.t(`purchasing:threeWayMatch.status.${key}`), tone });

export function lineStatusMeta(status: MatchLineStatus) {
  return toMeta(LINE_STATUS_KEYS[status] ?? LINE_STATUS_KEYS.unlinked);
}

export function overallStatusMeta(status: MatchOverallStatus) {
  return toMeta(OVERALL_STATUS_KEYS[status] ?? OVERALL_STATUS_KEYS.unlinked);
}

/** True when at least one line exceeds tolerance (used for the confirm step). */
export function hasMatchVariance(result: MatchResult | null | undefined): boolean {
  return !!result && result.status === 'variance';
}

const signed = (n: number, text: string) => (n > 0 ? `+${text}` : text);
const pct = (p: number | null) => (p == null ? '' : ` (${signed(p, `${formatNumber(p, { maxDecimals: 2 })}%`)})`);

/** Human-readable detail lines for a match row (amounts and %). */
export function describeMatchLine(line: MatchLine): string[] {
  const out: string[] = [];
  const unit = line.unit ? ` ${line.unit}` : '';
  const qty = (n: number | null) => `${formatNumber(n, { maxDecimals: 3 })}${unit}`;
  if ((line.status === 'qty' || line.status === 'qty_price') && line.qtyDiff != null && Math.abs(line.qtyDiff) > 0) {
    out.push(
      i18n.t('purchasing:threeWayMatch.detail.qty', {
        invoiceQty: qty(line.invoiceQty),
        receiptQty: qty(line.receiptQty),
        diff: `${signed(line.qtyDiff, formatNumber(line.qtyDiff, { maxDecimals: 3 }))}${unit}${pct(line.qtyDiffPct)}`,
      }),
    );
  }
  if (line.overOrderedQty != null && line.overOrderedQty > 0) {
    out.push(
      i18n.t('purchasing:threeWayMatch.detail.overOrdered', {
        orderedQty: qty(line.orderedQty),
        overQty: qty(line.overOrderedQty),
      }),
    );
  }
  if ((line.status === 'price' || line.status === 'qty_price') && line.priceDiff != null) {
    const total = line.priceVarianceAmount
      ? i18n.t('purchasing:threeWayMatch.detail.priceTotal', {
          amount: signed(line.priceVarianceAmount, formatRupiah(line.priceVarianceAmount)),
        })
      : '';
    out.push(
      i18n.t('purchasing:threeWayMatch.detail.price', {
        invoicePrice: formatRupiah(line.invoiceUnitPrice),
        poPrice: formatRupiah(line.poUnitPrice),
        diff: `${signed(line.priceDiff, formatRupiah(line.priceDiff))}${pct(line.priceDiffPct)}`,
      }) + total,
    );
  }
  return out;
}
