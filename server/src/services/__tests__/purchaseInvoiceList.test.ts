import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildPurchaseInvoiceWhere,
  DEFAULT_PURCHASE_INVOICE_SORT,
  PURCHASE_INVOICE_SORT_FIELDS,
  purchaseInvoiceOrderBy,
  purchaseOverdueWhere,
  summarizePurchaseInvoices,
  type PurchaseStatusGroupRow,
} from '../purchaseInvoiceList';
import { parseSort } from '../../utils/listQuery';

const group = (status: string, n: number, gt: string | null, os: string | null): PurchaseStatusGroupRow => ({
  status,
  _count: { _all: n },
  _sum: {
    grandTotal: gt === null ? null : new Prisma.Decimal(gt),
    outstanding: os === null ? null : new Prisma.Decimal(os),
  },
});

describe('summarizePurchaseInvoices', () => {
  it('sums every status, excludes cancelled from invoice value and counts paid/overdue', () => {
    const summary = summarizePurchaseInvoices(
      [
        group('Submitted', 3, '300.10', '300.10'),
        group('PartiallyPaid', 2, '200.20', '50.05'),
        group('Paid', 4, '400', '0'),
        group('Cancelled', 1, '999', '0'),
      ],
      { _count: { _all: 2 }, _sum: { outstanding: new Prisma.Decimal('120.15') } },
    );
    expect(summary).toMatchObject({
      count: 10,
      grandTotal: 900.3,
      outstanding: 350.15,
      paidCount: 4,
      cancelledCount: 1,
      overdueCount: 2,
      overdueOutstanding: 120.15,
    });
    expect(summary.byStatus.Cancelled).toEqual({ count: 1, grandTotal: 999, outstanding: 0 });
  });

  it('handles an empty result (null sums)', () => {
    expect(summarizePurchaseInvoices([], { _count: { _all: 0 }, _sum: { outstanding: null } })).toEqual({
      count: 0,
      grandTotal: 0,
      outstanding: 0,
      paidCount: 0,
      cancelledCount: 0,
      overdueCount: 0,
      overdueOutstanding: 0,
      byStatus: {},
    });
  });

  it('keeps decimal precision (no float drift) on large rupiah values', () => {
    const summary = summarizePurchaseInvoices(
      [group('Submitted', 1, '0.1', '0.1'), group('PartiallyPaid', 1, '0.2', '0.2'), group('Paid', 1, '123456789012.35', null)],
      { _count: { _all: 0 }, _sum: { outstanding: 0 } },
    );
    expect(summary.grandTotal).toBe(123456789012.65);
    expect(summary.outstanding).toBe(0.3);
  });
});

describe('buildPurchaseInvoiceWhere', () => {
  it('builds filters shared by list and summary (business-time-zone days)', () => {
    const r = buildPurchaseInvoiceWhere({
      status: 'PartiallyPaid',
      partyId: 'sup-1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      search: '  PI-01 ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where.status).toBe('PartiallyPaid');
    expect(r.where.partyId).toBe('sup-1');
    expect(r.where.date).toEqual({
      gte: new Date('2025-12-31T17:00:00.000Z'),
      lt: new Date('2026-01-31T17:00:00.000Z'),
    });
    expect(r.where.OR).toEqual([
      { invoiceNumber: { contains: 'PI-01', mode: 'insensitive' } },
      { supplier: { name: { contains: 'PI-01', mode: 'insensitive' } } },
    ]);
  });

  it('supports an open-ended date range', () => {
    const r = buildPurchaseInvoiceWhere({ endDate: '2026-03-15' });
    expect(r).toEqual({ ok: true, where: { date: { lt: new Date('2026-03-15T17:00:00.000Z') } } });
  });

  it('returns an empty filter when nothing is set', () => {
    expect(buildPurchaseInvoiceWhere({ status: '', search: '   ', partyId: '' })).toEqual({ ok: true, where: {} });
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildPurchaseInvoiceWhere({ status: 'Unpaid' })).toEqual({ ok: false, error: 'Status invoice tidak dikenal.' });
    expect(buildPurchaseInvoiceWhere({ startDate: '01/02/2026' }).ok).toBe(false);
    expect(buildPurchaseInvoiceWhere({ endDate: '2026-02-30x' }).ok).toBe(false);
  });
});

describe('purchaseInvoiceOrderBy', () => {
  it('adds a stable invoice number tie-breaker', () => {
    expect(purchaseInvoiceOrderBy(DEFAULT_PURCHASE_INVOICE_SORT)).toEqual([{ date: 'desc' }, { invoiceNumber: 'desc' }]);
    expect(purchaseInvoiceOrderBy({ field: 'invoiceNumber', dir: 'asc' })).toEqual([{ invoiceNumber: 'asc' }]);
    expect(purchaseInvoiceOrderBy({ field: 'supplier', dir: 'asc' })).toEqual([
      { supplier: { name: 'asc' } },
      { invoiceNumber: 'asc' },
    ]);
    expect(purchaseInvoiceOrderBy({ field: 'dueDate', dir: 'desc' })[0]).toEqual({
      dueDate: { sort: 'desc', nulls: 'last' },
    });
  });

  it('only accepts whitelisted sort fields', () => {
    expect(parseSort('-outstanding', PURCHASE_INVOICE_SORT_FIELDS, DEFAULT_PURCHASE_INVOICE_SORT)).toEqual({
      field: 'outstanding',
      dir: 'desc',
    });
    expect(parseSort('partyId', PURCHASE_INVOICE_SORT_FIELDS, DEFAULT_PURCHASE_INVOICE_SORT)).toBe(
      DEFAULT_PURCHASE_INVOICE_SORT,
    );
  });
});

describe('purchaseOverdueWhere', () => {
  it('matches past-due invoices that still owe money', () => {
    const now = new Date('2026-10-03T00:00:00.000Z');
    expect(purchaseOverdueWhere(now)).toEqual({ dueDate: { lt: now }, outstanding: { gt: 0 } });
  });
});
