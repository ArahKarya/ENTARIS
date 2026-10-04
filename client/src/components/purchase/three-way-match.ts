/**
 * Three-way match (PO ↔ STT ↔ Faktur) — client types + status → label/tone
 * mapping. Mirrors server/src/services/threeWayMatch.ts (result shape).
 */
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

export const LINE_STATUS_META: Record<MatchLineStatus, { label: string; tone: MatchTone }> = {
  match: { label: 'Sesuai', tone: 'success' },
  qty: { label: 'Selisih qty', tone: 'warning' },
  price: { label: 'Selisih harga', tone: 'warning' },
  qty_price: { label: 'Selisih qty & harga', tone: 'warning' },
  unlinked: { label: 'Tanpa PO/STT', tone: 'neutral' },
};

export const OVERALL_STATUS_META: Record<MatchOverallStatus, { label: string; tone: MatchTone }> = {
  match: { label: 'Sesuai', tone: 'success' },
  variance: { label: 'Ada selisih', tone: 'warning' },
  unlinked: { label: 'Tidak tertaut PO/STT', tone: 'neutral' },
};

export function lineStatusMeta(status: MatchLineStatus) {
  return LINE_STATUS_META[status] ?? LINE_STATUS_META.unlinked;
}

export function overallStatusMeta(status: MatchOverallStatus) {
  return OVERALL_STATUS_META[status] ?? OVERALL_STATUS_META.unlinked;
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
  if ((line.status === 'qty' || line.status === 'qty_price') && line.qtyDiff != null && Math.abs(line.qtyDiff) > 0) {
    out.push(
      `Qty faktur ${formatNumber(line.invoiceQty, { maxDecimals: 3 })}${unit} vs STT ${formatNumber(line.receiptQty, { maxDecimals: 3 })}${unit}: ` +
        `${signed(line.qtyDiff, formatNumber(line.qtyDiff, { maxDecimals: 3 }))}${unit}${pct(line.qtyDiffPct)}`,
    );
  }
  if (line.overOrderedQty != null && line.overOrderedQty > 0) {
    out.push(
      `Melebihi qty PO ${formatNumber(line.orderedQty, { maxDecimals: 3 })}${unit} sebesar ${formatNumber(line.overOrderedQty, { maxDecimals: 3 })}${unit}`,
    );
  }
  if ((line.status === 'price' || line.status === 'qty_price') && line.priceDiff != null) {
    out.push(
      `Harga faktur ${formatRupiah(line.invoiceUnitPrice)} vs PO ${formatRupiah(line.poUnitPrice)}: ` +
        `${signed(line.priceDiff, formatRupiah(line.priceDiff))}${pct(line.priceDiffPct)}` +
        (line.priceVarianceAmount ? ` · total ${signed(line.priceVarianceAmount, formatRupiah(line.priceVarianceAmount))}` : ''),
    );
  }
  return out;
}
