import { describe, it, expect } from 'vitest';
import { buildPoOutstanding, buildSupplierPerformance, poLineUnitValue } from '../purchaseReports';

const OFF = '+07:00';
const sup = { id: 's1', name: 'CV Tani' };

describe('buildPoOutstanding', () => {
  const base = {
    id: 'po1',
    poNumber: 'PO-1',
    date: '2026-09-01T00:00:00Z',
    status: 'Submitted',
    closedAt: null,
    expectedDeliveryDate: '2026-10-01T00:00:00Z',
    supplier: sup,
    warehouse: { id: 'w1', name: 'Gudang A' },
    items: [
      { id: 'i1', itemName: 'Gabah', unit: 'Kg', quantity: 100, qtyReceived: 40, estimatedRate: 5000, discount: 10, taxPct: 11 },
      { id: 'i2', itemName: 'Karung', unit: 'pcs', quantity: 10, qtyReceived: 10, estimatedRate: 1000 },
    ],
  };

  it('lists only lines with remaining qty, valued net of discount incl. PPN', () => {
    const r = buildPoOutstanding([base], '2026-10-04', OFF);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0]).toMatchObject({
      itemId: 'i1',
      ordered: 100,
      received: 40,
      remaining: 60,
      unitValue: 4995,
      remainingValue: 299700,
      isOverdue: true,
      daysOverdue: 3,
      expectedDeliveryDate: '2026-10-01',
      supplierName: 'CV Tani',
    });
    expect(r.summary).toEqual({ poCount: 1, lineCount: 1, remainingValue: 299700, overduePoCount: 1 });
  });

  it('skips closed / non-submitted POs and over-received lines', () => {
    const r = buildPoOutstanding(
      [
        { ...base, id: 'c', closedAt: '2026-10-02T00:00:00Z' },
        { ...base, id: 'd', status: 'Draft' },
        { ...base, id: 'o', items: [{ ...base.items[0], qtyReceived: 120 }] },
      ],
      '2026-10-04',
      OFF,
    );
    expect(r.rows).toEqual([]);
  });

  it('poLineUnitValue handles Decimal-like strings', () => {
    expect(poLineUnitValue({ estimatedRate: '1000', discount: '0', taxPct: '0' })).toBe(1000);
  });
});

describe('buildSupplierPerformance', () => {
  const po = (over: Record<string, unknown> = {}) =>
    ({
      id: 'p',
      date: '2026-09-01T00:00:00Z',
      expectedDeliveryDate: '2026-09-05T00:00:00Z',
      supplier: sup,
      items: [{ id: 'i1', quantity: 100, qtyReceived: 100, estimatedRate: 1000, discount: 0 }],
      receipts: [{ date: '2026-09-04T00:00:00Z' }],
      invoiceLines: [{ purchaseOrderItemId: 'i1', quantity: 100, rate: 1050, discount: 0 }],
      ...over,
    }) as Parameters<typeof buildSupplierPerformance>[0][number];

  it('aggregates on-time, lead time, fill rate and price variance per supplier', () => {
    const rows = buildSupplierPerformance(
      [
        po({ id: 'a' }),
        // first STT on time, last after due; half received; billed at PO price
        po({
          id: 'b',
          items: [{ id: 'i1', quantity: 100, qtyReceived: 50, estimatedRate: 1000, discount: 0 }],
          receipts: [{ date: '2026-09-07T00:00:00Z' }, { date: '2026-09-03T00:00:00Z' }],
          invoiceLines: [{ purchaseOrderItemId: 'i1', quantity: 50, rate: 1000, discount: 0 }],
        }),
        // no STT yet: counted as PO, excluded from rates/lead time
        po({
          id: 'c',
          items: [{ id: 'i1', quantity: 100, qtyReceived: 0, estimatedRate: 1000 }],
          receipts: [],
          invoiceLines: [],
        }),
      ],
      OFF,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      supplierName: 'CV Tani',
      poCount: 3,
      evaluatedCount: 2,
      onTimeRate: 50,
      firstOnTimeRate: 100,
      avgLeadTimeDays: 2.5, // (3 + 2) / 2
      fillRate: 50, // 150 / 300
      priceVarianceAmount: 5000,
      priceVariancePct: 3.33, // 5000 / 150000
    });
  });

  it('groups supplier-less POs under "PO Umum" and returns nulls without data', () => {
    const rows = buildSupplierPerformance(
      [po({ supplier: null, expectedDeliveryDate: null, receipts: [], invoiceLines: [], items: [] })],
      OFF,
    );
    expect(rows[0]).toMatchObject({
      supplierId: null,
      supplierName: 'PO Umum',
      onTimeRate: null,
      avgLeadTimeDays: null,
      fillRate: null,
      priceVariancePct: null,
      priceVarianceAmount: 0,
    });
  });
});
