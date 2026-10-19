import { describe, it, expect } from 'vitest';
import {
  computePurchaseItem,
  effectiveQuantity,
  sumPotonganItem,
} from '../purchaseInvoiceCalc';

describe('effectiveQuantity', () => {
  it('uses timbanganDiterima when provided', () => {
    expect(effectiveQuantity({ quantity: 100, timbanganDiterima: 950 }).toNumber()).toBe(950);
  });
  it('falls back to quantity when timbanganDiterima is null', () => {
    expect(effectiveQuantity({ quantity: 100, timbanganDiterima: null }).toNumber()).toBe(100);
  });
  it('falls back to quantity when timbanganDiterima is undefined', () => {
    expect(effectiveQuantity({ quantity: 100 }).toNumber()).toBe(100);
  });
  it('treats zero timbanganDiterima as fallback', () => {
    expect(effectiveQuantity({ quantity: 100, timbanganDiterima: 0 }).toNumber()).toBe(100);
  });
});

describe('computePurchaseItem', () => {
  it('basic case: 1000kg gabah @ Rp 6500/kg, no tax/disc', () => {
    const r = computePurchaseItem({
      quantity: 1000,
      rate: 6500,
      timbanganDiterima: 1000,
    });
    expect(r.subtotal.toNumber()).toBe(6_500_000);
    expect(r.ppnAmount.toNumber()).toBe(0);
    expect(r.pphAmount.toNumber()).toBe(0);
    expect(r.hargaAkhir.toNumber()).toBe(6_500_000);
  });

  it('with PPN 11%: 1000kg @ 6500 → 6,500,000 + 715,000 = 7,215,000', () => {
    const r = computePurchaseItem({
      quantity: 1000,
      rate: 6500,
      timbanganDiterima: 1000,
      taxPct: 11,
    });
    expect(r.ppnAmount.toNumber()).toBe(715_000);
    expect(r.hargaAkhir.toNumber()).toBe(7_215_000);
  });

  it('with PPh 0.5%: subtracts from total', () => {
    const r = computePurchaseItem({
      quantity: 1000,
      rate: 6500,
      timbanganDiterima: 1000,
      pphPct: 0.5,
    });
    expect(r.pphAmount.toNumber()).toBe(32_500);
    expect(r.hargaAkhir.toNumber()).toBe(6_467_500);
  });

  it('with potonganItem: deducted from final', () => {
    const r = computePurchaseItem({
      quantity: 1000,
      rate: 6500,
      timbanganDiterima: 1000,
      potonganItem: 100_000,
    });
    expect(r.hargaAkhir.toNumber()).toBe(6_400_000);
  });

  it('combo: PPN 11% + PPh 0.5% + potongan 100k', () => {
    // subtotal = 6,500,000
    // ppn = 715,000
    // pph = 32,500
    // potongan = 100,000
    // final = 6,500,000 + 715,000 - 32,500 - 100,000 = 7,082,500
    const r = computePurchaseItem({
      quantity: 1000,
      rate: 6500,
      timbanganDiterima: 1000,
      taxPct: 11,
      pphPct: 0.5,
      potonganItem: 100_000,
    });
    expect(r.hargaAkhir.toNumber()).toBe(7_082_500);
  });

  it('rice mill flow: timbanganDiterima overrides quantity for pricing', () => {
    // truk bawa 1050 kg, refaksi 50 kg, diterima 1000 kg @ 6500
    const r = computePurchaseItem({
      quantity: 1, // garbage value, should be ignored
      rate: 6500,
      timbanganDiterima: 1000,
    });
    expect(r.effectiveQuantity.toNumber()).toBe(1000);
    expect(r.hargaAkhir.toNumber()).toBe(6_500_000);
  });

  it('discount % still works (legacy field)', () => {
    // 1000 × 6500 = 6,500,000; disc 10% → 5,850,000
    const r = computePurchaseItem({
      quantity: 1000,
      rate: 6500,
      timbanganDiterima: 1000,
      discount: 10,
    });
    expect(r.subtotal.toNumber()).toBe(5_850_000);
    expect(r.hargaAkhir.toNumber()).toBe(5_850_000);
  });

  it('rounding: half-up to 2 decimals', () => {
    // 33.333 × 1.005 = 33.499665 → 33.50 (half-up)
    const r = computePurchaseItem({
      quantity: 33.333,
      rate: 1.005,
      timbanganDiterima: 33.333,
    });
    // 33.333 * 1.005 = 33.499665 → rounds to 33.50
    expect(r.subtotal.toNumber()).toBe(33.5);
  });

  it('zero quantity: returns zero amounts', () => {
    const r = computePurchaseItem({ quantity: 0, rate: 6500, timbanganDiterima: 0 });
    expect(r.subtotal.toNumber()).toBe(0);
    expect(r.hargaAkhir.toNumber()).toBe(0);
  });
});

describe('sumPotonganItem', () => {
  it('sums per-item potongan', () => {
    const items = [{ potonganItem: 50_000 }, { potonganItem: 30_000 }, { potonganItem: 20_000 }];
    expect(sumPotonganItem(items).toNumber()).toBe(100_000);
  });
  it('handles missing/zero values', () => {
    const items = [{}, { potonganItem: 0 }, { potonganItem: 50_000 }];
    expect(sumPotonganItem(items).toNumber()).toBe(50_000);
  });
  it('empty array → zero', () => {
    expect(sumPotonganItem([]).toNumber()).toBe(0);
  });
});

describe('end-to-end invoice simulation', () => {
  it('realistic rice purchase: 3 lines, mixed taxes & potongan', () => {
    const items = [
      // Line 1: Gabah Kering Panen 2000kg @ 6500, PPh 0.5%
      { quantity: 2000, rate: 6500, timbanganDiterima: 2000, pphPct: 0.5, potonganItem: 50_000 },
      // Line 2: Gabah Kering Giling 1500kg @ 7000, PPh 0.5%
      { quantity: 1500, rate: 7000, timbanganDiterima: 1500, pphPct: 0.5, potonganItem: 30_000 },
      // Line 3: Karung 100 pcs @ 2500, no tax
      { quantity: 100, rate: 2500, timbanganDiterima: 100 },
    ];
    const calcs = items.map(computePurchaseItem);

    // Line 1: sub=13M, pph=65k, pot=50k → 12,885,000
    expect(calcs[0].hargaAkhir.toNumber()).toBe(12_885_000);
    // Line 2: sub=10.5M, pph=52.5k, pot=30k → 10,417,500
    expect(calcs[1].hargaAkhir.toNumber()).toBe(10_417_500);
    // Line 3: sub=250k, no tax → 250,000
    expect(calcs[2].hargaAkhir.toNumber()).toBe(250_000);

    const itemsTotal = calcs.reduce((s, c) => s.plus(c.hargaAkhir), calcs[0].hargaAkhir.constructor.prototype.constructor(0));
    // 12,885,000 + 10,417,500 + 250,000 = 23,552,500
    expect(itemsTotal.toNumber()).toBe(23_552_500);

    const totalPotongan = sumPotonganItem(items);
    expect(totalPotongan.toNumber()).toBe(80_000);
  });
});
