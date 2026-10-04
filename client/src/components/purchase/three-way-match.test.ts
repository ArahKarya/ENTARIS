import { describe, expect, it } from 'vitest';
import { notificationLink } from '@/lib/notificationNav';
import {
  describeMatchLine,
  hasMatchVariance,
  lineStatusMeta,
  overallStatusMeta,
  type MatchLine,
  type MatchResult,
} from './three-way-match';

const line = (patch: Partial<MatchLine> = {}): MatchLine => ({
  key: 'l1',
  itemName: 'Gabah',
  unit: 'Kg',
  invoiceQty: 100,
  invoiceUnitPrice: 5150,
  receiptQty: 100,
  sttNumber: 'STT-1',
  poItemId: 'poi1',
  poNumber: 'PO-1',
  orderedQty: 100,
  poUnitPrice: 5000,
  status: 'match',
  qtyDiff: 0,
  qtyDiffPct: 0,
  overOrderedQty: null,
  priceDiff: 150,
  priceDiffPct: 3,
  priceVarianceAmount: 15000,
  ...patch,
});

describe('three-way match status mapping', () => {
  it('maps line statuses to Indonesian labels and tones', () => {
    expect(lineStatusMeta('match')).toEqual({ label: 'Sesuai', tone: 'success' });
    expect(lineStatusMeta('qty')).toEqual({ label: 'Selisih qty', tone: 'warning' });
    expect(lineStatusMeta('price')).toEqual({ label: 'Selisih harga', tone: 'warning' });
    expect(lineStatusMeta('qty_price').label).toBe('Selisih qty & harga');
    expect(lineStatusMeta('unlinked').tone).toBe('neutral');
  });

  it('maps the overall badge', () => {
    expect(overallStatusMeta('match').label).toBe('Sesuai');
    expect(overallStatusMeta('variance')).toEqual({ label: 'Ada selisih', tone: 'warning' });
    expect(overallStatusMeta('unlinked').tone).toBe('neutral');
  });

  it('requires confirmation only when a line exceeds tolerance', () => {
    const base = { tolerance: { qtyPct: 0, pricePct: 2 }, lines: [], summary: {} } as unknown as MatchResult;
    expect(hasMatchVariance({ ...base, status: 'variance' })).toBe(true);
    expect(hasMatchVariance({ ...base, status: 'match' })).toBe(false);
    expect(hasMatchVariance(undefined)).toBe(false);
  });

  it('describes price variance with amount and %', () => {
    const [text] = describeMatchLine(line({ status: 'price' }));
    expect(text).toContain('Harga faktur');
    expect(text).toContain('(+3%)');
    expect(text).toMatch(/total \+Rp\s15\.000/);
  });

  it('describes qty variance and over-ordered qty; nothing for a matched line', () => {
    const out = describeMatchLine(line({ status: 'qty', qtyDiff: -2.5, qtyDiffPct: -2.5, overOrderedQty: 5 }));
    expect(out[0]).toContain('-2,5 Kg (-2,5%)');
    expect(out[1]).toContain('Melebihi qty PO');
    expect(describeMatchLine(line({ status: 'match' }))).toEqual([]);
  });
});

describe('po_overdue notification link', () => {
  it('opens the PO drawer via ?po=', () => {
    expect(notificationLink({ type: 'po_overdue', metadata: { purchaseOrderId: 'abc' } }, 'Admin')).toBe(
      '/purchase-orders?po=abc',
    );
    expect(notificationLink({ type: 'po_overdue' }, 'Admin')).toBe('/purchase-orders');
  });
});
