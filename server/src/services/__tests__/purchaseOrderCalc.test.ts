import { describe, it, expect } from 'vitest';
import { computePurchaseOrderLine, computePurchaseOrderTotals } from '../purchaseOrderCalc';
import { computePurchaseItem } from '../purchaseInvoiceCalc';

describe('computePurchaseOrderLine', () => {
  it('matches the purchase-invoice line rules (net + PPN = amount)', () => {
    const line = { quantity: 3, estimatedRate: 12345.67, discount: 7.5, taxPct: 11 };
    const po = computePurchaseOrderLine(line);
    const pi = computePurchaseItem({ quantity: 3, rate: 12345.67, discount: 7.5, taxPct: 11 });
    expect(po.net.toNumber()).toBe(pi.subtotal.toNumber());
    expect(po.taxAmount.toNumber()).toBe(pi.ppnAmount.toNumber());
    expect(po.amount.toNumber()).toBe(pi.hargaAkhir.toNumber());
  });

  it('rounds half-up to 2 decimals at each step', () => {
    // gross 33.335 → 33.34 ; net = 33.335 × 0.9 = 30.0015 → 30.00 ; tax 11% = 3.30
    const l = computePurchaseOrderLine({ quantity: 1, estimatedRate: 33.335, discount: 10, taxPct: 11 });
    expect(l.gross.toNumber()).toBe(33.34);
    expect(l.net.toNumber()).toBe(30);
    expect(l.discountAmount.toNumber()).toBe(3.34);
    expect(l.taxAmount.toNumber()).toBe(3.3);
    expect(l.amount.toNumber()).toBe(33.3);
  });

  it('defaults discount/tax to 0 (legacy PO lines)', () => {
    const l = computePurchaseOrderLine({ quantity: 2.5, estimatedRate: 1000 });
    expect(l.amount.toNumber()).toBe(2500);
    expect(l.taxAmount.toNumber()).toBe(0);
  });
});

describe('computePurchaseOrderTotals', () => {
  it('sums lines with multiple PPN rates and adds other costs', () => {
    const t = computePurchaseOrderTotals(
      [
        { quantity: 10, estimatedRate: 100000, discount: 5, taxPct: 11 }, // gross 1.000.000, net 950.000, ppn 104.500
        { quantity: 4, estimatedRate: 250000, taxPct: 12 }, // gross 1.000.000, ppn 120.000
        { quantity: 1, estimatedRate: 50000 }, // no tax
      ],
      75000,
    );
    expect(t.subtotal.toNumber()).toBe(2050000);
    expect(t.discountTotal.toNumber()).toBe(50000);
    expect(t.taxTotal.toNumber()).toBe(224500);
    expect(t.otherCosts.toNumber()).toBe(75000);
    // 950.000+104.500 + 1.000.000+120.000 + 50.000 + 75.000
    expect(t.grandTotal.toNumber()).toBe(2299500);
    // identity: subtotal − discount + tax + other = grand
    expect(t.subtotal.minus(t.discountTotal).plus(t.taxTotal).plus(t.otherCosts).toNumber()).toBe(2299500);
  });

  it('empty other costs / no items → 0', () => {
    const t = computePurchaseOrderTotals([]);
    expect(t.grandTotal.toNumber()).toBe(0);
  });
});
