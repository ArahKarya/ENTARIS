import { describe, it, expect } from 'vitest';
import {
  buildPurchaseOrderWhere,
  DEFAULT_PURCHASE_ORDER_SORT,
  PURCHASE_ORDER_SORT_FIELDS,
  purchaseOrderOrderBy,
  type PurchaseOrderFieldRefs,
} from '../purchaseOrderList';
import { parseListPaging, parseSort } from '../../utils/listQuery';

describe('buildPurchaseOrderWhere', () => {
  it('returns an empty filter for an empty query', () => {
    expect(buildPurchaseOrderWhere({})).toEqual({ ok: true, where: {} });
  });

  it('maps status, supplier, local-day date range and search', () => {
    const r = buildPurchaseOrderWhere({
      status: 'Submitted',
      partyId: 'p1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      search: ' PO-0001 ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where.status).toBe('Submitted');
    expect(r.where.partyId).toBe('p1');
    // WIB (+07:00) calendar days, half-open.
    expect(r.where.date).toEqual({
      gte: new Date('2025-12-31T17:00:00.000Z'),
      lt: new Date('2026-01-31T17:00:00.000Z'),
    });
    expect(r.where.OR).toEqual([
      { poNumber: { contains: 'PO-0001', mode: 'insensitive' } },
      { supplier: { name: { contains: 'PO-0001', mode: 'insensitive' } } },
    ]);
  });

  it('accepts a single date bound', () => {
    const r = buildPurchaseOrderWhere({ endDate: '2026-02-28' });
    expect(r.ok && r.where.date).toEqual({ lt: new Date('2026-02-28T17:00:00.000Z') });
  });

  it('accepts the Cancelled status used by the page filter', () => {
    const r = buildPurchaseOrderWhere({ status: 'Cancelled' });
    expect(r.ok && r.where.status).toBe('Cancelled');
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildPurchaseOrderWhere({ status: 'Invoiced' })).toEqual({ ok: false, error: 'Status PO tidak dikenal.' });
    expect(buildPurchaseOrderWhere({ startDate: '01/02/2026' }).ok).toBe(false);
    expect(buildPurchaseOrderWhere({ endDate: '2026-13-45' }).ok).toBe(false);
  });
});

describe('purchaseOrderOrderBy', () => {
  it('defaults to newest date with the PO number as tie-breaker', () => {
    expect(purchaseOrderOrderBy(DEFAULT_PURCHASE_ORDER_SORT)).toEqual([{ date: 'desc' }, { poNumber: 'desc' }]);
  });

  it('sorts by supplier name, nullable target date last, amount, and PO number alone', () => {
    expect(purchaseOrderOrderBy({ field: 'supplier', dir: 'asc' })).toEqual([
      { supplier: { name: 'asc' } },
      { poNumber: 'asc' },
    ]);
    expect(purchaseOrderOrderBy({ field: 'expectedDeliveryDate', dir: 'desc' })[0]).toEqual({
      expectedDeliveryDate: { sort: 'desc', nulls: 'last' },
    });
    expect(purchaseOrderOrderBy({ field: 'totalEstimated', dir: 'desc' })).toEqual([
      { totalEstimated: 'desc' },
      { poNumber: 'desc' },
    ]);
    expect(purchaseOrderOrderBy({ field: 'poNumber', dir: 'asc' })).toEqual([{ poNumber: 'asc' }]);
  });

  it('ignores sort fields outside the whitelist', () => {
    expect(parseSort('-createdBy', PURCHASE_ORDER_SORT_FIELDS, DEFAULT_PURCHASE_ORDER_SORT)).toEqual(
      DEFAULT_PURCHASE_ORDER_SORT,
    );
    expect(parseSort('-totalEstimated', PURCHASE_ORDER_SORT_FIELDS, DEFAULT_PURCHASE_ORDER_SORT)).toEqual({
      field: 'totalEstimated',
      dir: 'desc',
    });
  });
});

describe('purchase order paging', () => {
  it('keeps limit=100/200 working for pickers (STT modal pulls open POs)', () => {
    const opts = { defaultLimit: 50, maxLimit: 200 };
    expect(parseListPaging({ limit: '100' }, opts)).toEqual({ page: 1, limit: 100, skip: 0 });
    expect(parseListPaging({ limit: '500', page: '2' }, opts)).toEqual({ page: 2, limit: 200, skip: 200 });
  });
});

describe('buildPurchaseOrderWhere — receipt & open filters', () => {
  // Stand-in for prisma.purchaseOrderItem.fields.quantity (a column reference).
  const refs = {
    itemQuantity: { modelName: 'PurchaseOrderItem', name: 'quantity' },
  } as unknown as PurchaseOrderFieldRefs;
  const qty = refs.itemQuantity;
  const OPEN = { status: 'Submitted', closedAt: null };

  it('unreceived → open POs whose every line has qtyReceived ≤ 0', () => {
    expect(buildPurchaseOrderWhere({ receipt: 'unreceived' }, refs)).toEqual({
      ok: true,
      where: { AND: [{ ...OPEN, items: { every: { qtyReceived: { lte: 0 } } } }] },
    });
  });

  it('full → open POs with ≥1 line and every line received ≥ ordered (column ref)', () => {
    const r = buildPurchaseOrderWhere({ receipt: 'full' }, refs);
    expect(r.ok && r.where.AND).toEqual([
      { ...OPEN, AND: [{ items: { some: {} } }, { items: { every: { qtyReceived: { gte: qty } } } }] },
    ]);
  });

  it('partial → something received and some line still short', () => {
    const r = buildPurchaseOrderWhere({ receipt: 'partial' }, refs);
    expect(r.ok && r.where.AND).toEqual([
      {
        ...OPEN,
        AND: [{ items: { some: { qtyReceived: { gt: 0 } } } }, { items: { some: { qtyReceived: { lt: qty } } } }],
      },
    ]);
  });

  it('closed → short-closed POs; open=1 → Submitted and not closed', () => {
    const closed = buildPurchaseOrderWhere({ receipt: 'closed' });
    expect(closed.ok && closed.where.AND).toEqual([{ status: 'Submitted', closedAt: { not: null } }]);
    expect(buildPurchaseOrderWhere({ status: 'Submitted', open: '1' })).toEqual({
      ok: true,
      where: { status: 'Submitted', AND: [OPEN] },
    });
  });

  it('keeps the status filter alongside receipt (AND, never overwritten)', () => {
    const r = buildPurchaseOrderWhere({ status: 'Cancelled', receipt: 'unreceived' }, refs);
    expect(r.ok && r.where.status).toBe('Cancelled');
    expect(r.ok && r.where.AND).toHaveLength(1);
  });

  it('rejects unknown receipt values, and column-ref filters without refs', () => {
    expect(buildPurchaseOrderWhere({ receipt: 'half' }, refs)).toEqual({
      ok: false,
      error: 'Filter penerimaan PO tidak dikenal.',
    });
    expect(buildPurchaseOrderWhere({ receipt: 'full' }).ok).toBe(false);
  });
});
