// Purchase Order totals — reuses the purchase-invoice line rules
// (purchaseInvoiceCalc.computePurchaseItem) so a PO and the PI that follows
// it price identically:
//   gross      = qty × rate                          (2 dp, half-up)
//   net        = qty × rate × (1 − discount/100)      (= PI `subtotal`)
//   taxAmount  = net × taxPct/100                     (= PI `ppnAmount`)
//   amount     = net + taxAmount                      (= PI `hargaAkhir`, no PPh/potongan on PO)
// Header:
//   subtotal      = Σ gross
//   discountTotal = Σ (gross − net)
//   taxTotal      = Σ taxAmount
//   grandTotal    = Σ amount + otherCosts             (PI: Σ amount + biayaLain)
// PO has no GL/stock effect; these numbers are informational / approval input.

import Decimal from 'decimal.js';
import { computePurchaseItem } from './purchaseInvoiceCalc';

export interface PurchaseOrderLineInput {
  quantity: number;
  estimatedRate?: number;
  discount?: number;
  taxPct?: number;
}

export interface PurchaseOrderLineTotals {
  gross: Decimal;
  net: Decimal;
  discountAmount: Decimal;
  taxAmount: Decimal;
  amount: Decimal;
}

export interface PurchaseOrderTotals {
  lines: PurchaseOrderLineTotals[];
  subtotal: Decimal;
  discountTotal: Decimal;
  taxTotal: Decimal;
  otherCosts: Decimal;
  grandTotal: Decimal;
}

const round2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

export function computePurchaseOrderLine(line: PurchaseOrderLineInput): PurchaseOrderLineTotals {
  const rate = line.estimatedRate ?? 0;
  const calc = computePurchaseItem({
    quantity: line.quantity,
    rate,
    discount: line.discount ?? 0,
    taxPct: line.taxPct ?? 0,
  });
  const gross = round2(new Decimal(line.quantity).mul(rate));
  return {
    gross,
    net: calc.subtotal,
    discountAmount: gross.minus(calc.subtotal),
    taxAmount: calc.ppnAmount,
    amount: calc.hargaAkhir,
  };
}

export function computePurchaseOrderTotals(
  items: PurchaseOrderLineInput[],
  otherCosts = 0,
): PurchaseOrderTotals {
  const lines = items.map(computePurchaseOrderLine);
  const sum = (pick: (l: PurchaseOrderLineTotals) => Decimal) =>
    lines.reduce((s, l) => s.plus(pick(l)), new Decimal(0));
  const other = round2(new Decimal(otherCosts || 0));
  return {
    lines,
    subtotal: sum((l) => l.gross),
    discountTotal: sum((l) => l.discountAmount),
    taxTotal: sum((l) => l.taxAmount),
    otherCosts: other,
    grandTotal: round2(sum((l) => l.amount).plus(other)),
  };
}
