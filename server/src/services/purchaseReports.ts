/**
 * Pure aggregations for the purchasing reports:
 *  - PO Outstanding (open POs, per-line ordered/received/remaining qty + value)
 *  - Kinerja Pemasok (per supplier: PO count, on-time rate, lead time, fill
 *    rate, PI-vs-PO price variance)
 * Dates are compared as business-time-zone calendar days (WIB by default).
 */
import { businessDay, daysOverdue, isPurchaseOrderOverdue } from './purchaseOrderOverdue';
import { businessUtcOffset } from '../utils/listQuery';

type Num = number | string | { toString(): string };
const n = (v: Num | null | undefined): number => (v == null ? 0 : Number(v.toString()));
const round = (v: number, dp: number) => {
  const f = 10 ** dp;
  return Math.round((v + Number.EPSILON * Math.sign(v)) * f) / f;
};
const QTY_EPS = 0.0005;

/** PO net unit price: estimated rate after line discount, plus line PPN. */
export function poLineUnitValue(it: { estimatedRate: Num; discount?: Num | null; taxPct?: Num | null }): number {
  return n(it.estimatedRate) * (1 - n(it.discount) / 100) * (1 + n(it.taxPct) / 100);
}

// ─── PO Outstanding ─────────────────────────────────────────────────────────

export interface OutstandingPOInput {
  id: string;
  poNumber: string;
  date: Date | string;
  status: string;
  closedAt: Date | string | null;
  expectedDeliveryDate: Date | string | null;
  supplier: { id: string; name: string } | null;
  warehouse: { id: string; name: string } | null;
  items: {
    id: string;
    itemName: string;
    unit: string;
    quantity: Num;
    qtyReceived: Num;
    estimatedRate: Num;
    discount?: Num | null;
    taxPct?: Num | null;
  }[];
}

export interface OutstandingRow {
  poId: string;
  poNumber: string;
  date: string;
  expectedDeliveryDate: string | null;
  supplierName: string;
  warehouseName: string | null;
  isOverdue: boolean;
  daysOverdue: number;
  itemId: string;
  itemName: string;
  unit: string;
  ordered: number;
  received: number;
  remaining: number;
  unitValue: number;
  remainingValue: number;
}

export interface OutstandingReport {
  rows: OutstandingRow[];
  summary: { poCount: number; lineCount: number; remainingValue: number; overduePoCount: number };
}

export function buildPoOutstanding(
  pos: OutstandingPOInput[],
  today: string,
  offset: string = businessUtcOffset(),
): OutstandingReport {
  const rows: OutstandingRow[] = [];
  for (const po of pos) {
    if (po.status !== 'Submitted' || po.closedAt) continue;
    const overdue = isPurchaseOrderOverdue(po, today, offset);
    const late = overdue && po.expectedDeliveryDate ? daysOverdue(po.expectedDeliveryDate, today, offset) : 0;
    for (const it of po.items) {
      const ordered = round(n(it.quantity), 3);
      const received = round(n(it.qtyReceived), 3);
      const remaining = round(Math.max(0, ordered - received), 3);
      if (remaining <= QTY_EPS) continue;
      const unitValue = round(poLineUnitValue(it), 2);
      rows.push({
        poId: po.id,
        poNumber: po.poNumber,
        date: businessDay(po.date, offset),
        expectedDeliveryDate: po.expectedDeliveryDate ? businessDay(po.expectedDeliveryDate, offset) : null,
        supplierName: po.supplier?.name ?? 'PO Umum',
        warehouseName: po.warehouse?.name ?? null,
        isOverdue: overdue,
        daysOverdue: late,
        itemId: it.id,
        itemName: it.itemName,
        unit: it.unit,
        ordered,
        received,
        remaining,
        unitValue,
        remainingValue: round(remaining * unitValue, 2),
      });
    }
  }
  const poIds = new Set(rows.map((r) => r.poId));
  const overdueIds = new Set(rows.filter((r) => r.isOverdue).map((r) => r.poId));
  return {
    rows,
    summary: {
      poCount: poIds.size,
      lineCount: rows.length,
      remainingValue: round(rows.reduce((s, r) => s + r.remainingValue, 0), 2),
      overduePoCount: overdueIds.size,
    },
  };
}

// ─── Kinerja Pemasok ────────────────────────────────────────────────────────

export interface PerformancePOInput {
  id: string;
  date: Date | string;
  expectedDeliveryDate: Date | string | null;
  supplier: { id: string; name: string } | null;
  items: { id: string; quantity: Num; qtyReceived: Num; estimatedRate: Num; discount?: Num | null }[];
  /** Non-cancelled STTs of this PO. */
  receipts: { date: Date | string }[];
  /** Non-cancelled PI lines billed against this PO's STT lines. */
  invoiceLines: { purchaseOrderItemId: string; quantity: Num; rate: Num; discount?: Num | null }[];
}

export interface SupplierPerformanceRow {
  supplierId: string | null;
  supplierName: string;
  poCount: number;
  /** POs with an expected date and at least one STT (denominator of the rates). */
  evaluatedCount: number;
  /** % of evaluated POs whose LAST STT is on/before the expected day. */
  onTimeRate: number | null;
  /** % of evaluated POs whose FIRST STT is on/before the expected day. */
  firstOnTimeRate: number | null;
  /** Average days PO date → first STT, over POs with ≥1 STT. */
  avgLeadTimeDays: number | null;
  /** Σ min(received, ordered) / Σ ordered, %. */
  fillRate: number | null;
  /** (Σ PI net value − Σ PO net value at PI qty) / Σ PO net value, %. */
  priceVariancePct: number | null;
  priceVarianceAmount: number;
}

const dayNum = (d: Date | string, offset: string) => Date.parse(`${businessDay(d, offset)}T00:00:00Z`) / 86_400_000;
const pct = (num: number, den: number, dp = 1) => (den > 0 ? round((num / den) * 100, dp) : null);

interface Acc {
  supplierId: string | null;
  supplierName: string;
  poCount: number;
  evaluated: number;
  onTime: number;
  firstOnTime: number;
  leadSum: number;
  leadCount: number;
  ordered: number;
  filled: number;
  piValue: number;
  poValue: number;
}

export function buildSupplierPerformance(
  pos: PerformancePOInput[],
  offset: string = businessUtcOffset(),
): SupplierPerformanceRow[] {
  const acc = new Map<string, Acc>();
  for (const po of pos) {
    const key = po.supplier?.id ?? '__general__';
    let a = acc.get(key);
    if (!a) {
      a = {
        supplierId: po.supplier?.id ?? null,
        supplierName: po.supplier?.name ?? 'PO Umum',
        poCount: 0, evaluated: 0, onTime: 0, firstOnTime: 0,
        leadSum: 0, leadCount: 0, ordered: 0, filled: 0, piValue: 0, poValue: 0,
      };
      acc.set(key, a);
    }
    a.poCount += 1;

    const sttDays = po.receipts.map((r) => dayNum(r.date, offset)).sort((x, y) => x - y);
    if (sttDays.length > 0) {
      a.leadSum += Math.max(0, sttDays[0] - dayNum(po.date, offset));
      a.leadCount += 1;
      if (po.expectedDeliveryDate) {
        const due = dayNum(po.expectedDeliveryDate, offset);
        a.evaluated += 1;
        if (sttDays[sttDays.length - 1] <= due) a.onTime += 1;
        if (sttDays[0] <= due) a.firstOnTime += 1;
      }
    }

    const poNet = new Map<string, number>();
    for (const it of po.items) {
      const ordered = n(it.quantity);
      a.ordered += ordered;
      a.filled += Math.min(n(it.qtyReceived), ordered);
      poNet.set(it.id, n(it.estimatedRate) * (1 - n(it.discount) / 100));
    }
    for (const l of po.invoiceLines) {
      const ref = poNet.get(l.purchaseOrderItemId);
      if (ref == null) continue;
      const qty = n(l.quantity);
      a.piValue += qty * n(l.rate) * (1 - n(l.discount) / 100);
      a.poValue += qty * ref;
    }
  }

  return [...acc.values()]
    .map((a) => ({
      supplierId: a.supplierId,
      supplierName: a.supplierName,
      poCount: a.poCount,
      evaluatedCount: a.evaluated,
      onTimeRate: pct(a.onTime, a.evaluated),
      firstOnTimeRate: pct(a.firstOnTime, a.evaluated),
      avgLeadTimeDays: a.leadCount > 0 ? round(a.leadSum / a.leadCount, 1) : null,
      fillRate: pct(a.filled, a.ordered),
      priceVariancePct: a.poValue > 0 ? round(((a.piValue - a.poValue) / a.poValue) * 100, 2) : null,
      priceVarianceAmount: round(a.piValue - a.poValue, 2),
    }))
    .sort((x, y) => y.poCount - x.poCount || x.supplierName.localeCompare(y.supplierName));
}
