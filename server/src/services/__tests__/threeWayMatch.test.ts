import { describe, it, expect } from 'vitest';
import { computeThreeWayMatch, exceedsTolerance, type MatchLineInput } from '../threeWayMatch';

const line = (over: Partial<MatchLineInput> = {}): MatchLineInput => ({
  key: 'l1',
  itemName: 'Gabah',
  invoiceQty: 100,
  invoiceUnitPrice: 5000,
  receiptQty: 100,
  sttNumber: 'STT-1',
  poItemId: 'poi1',
  poNumber: 'PO-1',
  orderedQty: 100,
  poUnitPrice: 5000,
  ...over,
});

describe('exceedsTolerance', () => {
  it('ignores rounding noise and respects the % band', () => {
    expect(exceedsTolerance(0.004, 100, 0, 0.005)).toBe(false);
    expect(exceedsTolerance(2, 100, 2, 0.005)).toBe(false); // exactly 2% is within
    expect(exceedsTolerance(2.01, 100, 2, 0.005)).toBe(true);
    expect(exceedsTolerance(1, 0, 2, 0.005)).toBe(true); // zero base
  });
});

describe('computeThreeWayMatch', () => {
  it('matches identical PO, STT and invoice lines', () => {
    const r = computeThreeWayMatch([line()]);
    expect(r.status).toBe('match');
    expect(r.lines[0]).toMatchObject({ status: 'match', qtyDiff: 0, priceDiff: 0, priceDiffPct: 0 });
  });

  it('flags any qty difference vs STT at the default 0% tolerance', () => {
    const r = computeThreeWayMatch([line({ invoiceQty: 100.5, orderedQty: 200 })]);
    expect(r.lines[0]).toMatchObject({ status: 'qty', qtyDiff: 0.5, qtyDiffPct: 0.5, overOrderedQty: null });
    expect(r.status).toBe('variance');
  });

  it('treats a price within 2% as Sesuai and above 2% as Selisih harga', () => {
    expect(computeThreeWayMatch([line({ invoiceUnitPrice: 5100 })]).lines[0].status).toBe('match');
    const r = computeThreeWayMatch([line({ invoiceUnitPrice: 5150 })]);
    expect(r.lines[0]).toMatchObject({ status: 'price', priceDiff: 150, priceDiffPct: 3, priceVarianceAmount: 15000 });
    expect(r.summary.priceVarianceAmount).toBe(15000);
  });

  it('compares against the PO net price (after line discount) and rounds the invoice price', () => {
    // PO 5000 less 10% = 4500; invoice 4589.999 → 4590 (+2%) → within tolerance.
    const r = computeThreeWayMatch([line({ poUnitPrice: 4500, invoiceUnitPrice: 4589.999 })]);
    expect(r.lines[0]).toMatchObject({ status: 'match', invoiceUnitPrice: 4590, priceDiffPct: 2 });
  });

  it('reports both qty and price variance on one line', () => {
    const r = computeThreeWayMatch([line({ invoiceQty: 90, invoiceUnitPrice: 6000 })]);
    expect(r.lines[0].status).toBe('qty_price');
    expect(r.summary).toMatchObject({ qtyVariance: 1, priceVariance: 1, matched: 0 });
  });

  it('multi-STT: sums invoice qty per PO line to detect over-billing vs ordered', () => {
    const ok = computeThreeWayMatch([
      line({ key: 'a', invoiceQty: 60, receiptQty: 60 }),
      line({ key: 'b', invoiceQty: 40, receiptQty: 40, sttNumber: 'STT-2' }),
    ]);
    expect(ok.status).toBe('match');
    const over = computeThreeWayMatch([
      line({ key: 'a', invoiceQty: 60, receiptQty: 60 }),
      line({ key: 'b', invoiceQty: 50, receiptQty: 50, sttNumber: 'STT-2' }),
    ]);
    expect(over.lines.map((l) => [l.status, l.overOrderedQty])).toEqual([
      ['qty', 10],
      ['qty', 10],
    ]);
  });

  it('honours custom tolerances', () => {
    const r = computeThreeWayMatch([line({ invoiceQty: 101, receiptQty: 100, orderedQty: 101 })], {
      qtyPct: 1,
      pricePct: 0,
    });
    expect(r.lines[0].status).toBe('match');
  });

  it('STT without PO checks qty only; unlinked lines are neutral', () => {
    const r = computeThreeWayMatch([
      line({ key: 'stt', poItemId: null, orderedQty: null, poUnitPrice: null, invoiceUnitPrice: 9999 }),
      line({ key: 'svc', receiptQty: null, poItemId: null, orderedQty: null, poUnitPrice: null }),
    ]);
    expect(r.lines.map((l) => l.status)).toEqual(['match', 'unlinked']);
    expect(r.lines[0].priceDiff).toBeNull();
    expect(r.status).toBe('match');
    expect(computeThreeWayMatch([r.lines[1]]).status).toBe('unlinked');
  });
});
