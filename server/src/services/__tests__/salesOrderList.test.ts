import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildSalesOrderWhere,
  DEFAULT_SALES_ORDER_SORT,
  SALES_ORDER_SORT_FIELDS,
  salesOrderOrderBy,
  summarizeSalesOrders,
  type SalesOrderStatusGroup,
} from '../salesOrderList';
import { parseSort } from '../../utils/listQuery';

const group = (status: string, n: number, gt: string | null): SalesOrderStatusGroup => ({
  status,
  _count: { _all: n },
  _sum: { grandTotal: gt === null ? null : new Prisma.Decimal(gt) },
});

describe('summarizeSalesOrders', () => {
  it('counts per status and excludes cancelled orders from the active value', () => {
    const s = summarizeSalesOrders([
      group('Draft', 1, '100'),
      group('Submitted', 3, '300.10'),
      group('PartiallyDelivered', 2, '200.20'),
      group('FullyDelivered', 4, '400'),
      group('Cancelled', 5, '999'),
    ]);
    expect(s).toMatchObject({
      count: 15,
      activeCount: 10,
      activeValue: 1000.3,
      draftCount: 1,
      submittedCount: 3,
      partiallyDeliveredCount: 2,
      fullyDeliveredCount: 4,
      cancelledCount: 5,
    });
    expect(s.byStatus.Cancelled).toEqual({ count: 5, grandTotal: 999 });
  });

  it('handles an empty result and null sums', () => {
    expect(summarizeSalesOrders([])).toEqual({
      count: 0,
      activeCount: 0,
      activeValue: 0,
      draftCount: 0,
      submittedCount: 0,
      partiallyDeliveredCount: 0,
      fullyDeliveredCount: 0,
      cancelledCount: 0,
      byStatus: {},
    });
    expect(summarizeSalesOrders([group('Submitted', 2, null)]).activeValue).toBe(0);
  });

  it('keeps decimal precision', () => {
    const s = summarizeSalesOrders([group('Draft', 1, '0.1'), group('Submitted', 1, '0.2')]);
    expect(s.activeValue).toBe(0.3);
  });
});

describe('buildSalesOrderWhere', () => {
  it('returns an empty filter for an empty query', () => {
    expect(buildSalesOrderWhere({})).toEqual({ ok: true, where: {} });
  });

  it('maps status, party, date range and search', () => {
    const r = buildSalesOrderWhere({
      status: 'PartiallyDelivered',
      partyId: 'p1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      search: ' SO-0001 ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where.status).toBe('PartiallyDelivered');
    expect(r.where.partyId).toBe('p1');
    expect(r.where.date).toEqual({
      gte: new Date('2025-12-31T17:00:00.000Z'),
      lt: new Date('2026-01-31T17:00:00.000Z'),
    });
    expect(r.where.OR).toEqual([
      { soNumber: { contains: 'SO-0001', mode: 'insensitive' } },
      { customer: { name: { contains: 'SO-0001', mode: 'insensitive' } } },
      { customerRefNo: { contains: 'SO-0001', mode: 'insensitive' } },
    ]);
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildSalesOrderWhere({ status: 'Invoiced' }).ok).toBe(false);
    expect(buildSalesOrderWhere({ startDate: '01/02/2026' }).ok).toBe(false);
  });
});

describe('salesOrderOrderBy', () => {
  it('defaults to newest date with the SO number as tie-breaker', () => {
    expect(salesOrderOrderBy(DEFAULT_SALES_ORDER_SORT)).toEqual([{ date: 'desc' }, { soNumber: 'desc' }]);
  });

  it('sorts by customer name, nullable target date last, and SO number alone', () => {
    expect(salesOrderOrderBy({ field: 'customer', dir: 'asc' })).toEqual([
      { customer: { name: 'asc' } },
      { soNumber: 'asc' },
    ]);
    expect(salesOrderOrderBy({ field: 'expectedDelivery', dir: 'desc' })[0]).toEqual({
      expectedDelivery: { sort: 'desc', nulls: 'last' },
    });
    expect(salesOrderOrderBy({ field: 'soNumber', dir: 'asc' })).toEqual([{ soNumber: 'asc' }]);
  });

  it('ignores sort fields outside the whitelist', () => {
    expect(parseSort('-createdBy', SALES_ORDER_SORT_FIELDS, DEFAULT_SALES_ORDER_SORT)).toEqual(DEFAULT_SALES_ORDER_SORT);
    expect(parseSort('grandTotal', SALES_ORDER_SORT_FIELDS, DEFAULT_SALES_ORDER_SORT)).toEqual({
      field: 'grandTotal',
      dir: 'asc',
    });
  });
});
