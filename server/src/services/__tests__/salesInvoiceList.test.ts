import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildSalesInvoiceWhere,
  DEFAULT_SALES_INVOICE_SORT,
  salesInvoiceOrderBy,
  summarizeSalesInvoices,
  type StatusGroupRow,
} from '../salesInvoiceList';
import { parseListPaging, parseSort, parseDateParam, firstString } from '../../utils/listQuery';

const group = (status: string, n: number, gt: string | null, os: string | null): StatusGroupRow => ({
  status,
  _count: { _all: n },
  _sum: { grandTotal: gt === null ? null : new Prisma.Decimal(gt), outstanding: os === null ? null : new Prisma.Decimal(os) },
});

describe('summarizeSalesInvoices', () => {
  it('sums every status, excludes cancelled from invoice value and counts paid/overdue', () => {
    const summary = summarizeSalesInvoices(
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
    const summary = summarizeSalesInvoices([], { _count: { _all: 0 }, _sum: { outstanding: null } });
    expect(summary).toEqual({
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

  it('keeps decimal precision (no float drift)', () => {
    const summary = summarizeSalesInvoices(
      [group('Draft', 1, '0.1', '0.1'), group('Submitted', 1, '0.1', '0.1'), group('Overdue', 1, '0.1', '0.1')],
      { _count: { _all: 0 }, _sum: { outstanding: 0 } },
    );
    expect(summary.grandTotal).toBe(0.3);
    expect(summary.outstanding).toBe(0.3);
  });
});

describe('buildSalesInvoiceWhere', () => {
  it('builds filters shared by list and summary', () => {
    const r = buildSalesInvoiceWhere({
      status: 'Paid',
      partyId: 'p1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      search: '  SI-01 ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where.status).toBe('Paid');
    expect(r.where.partyId).toBe('p1');
    expect(r.where.date).toEqual({
      gte: new Date('2026-01-01'),
      lte: new Date('2026-01-31T23:59:59.999Z'),
    });
    expect(r.where.OR).toHaveLength(2);
    expect(JSON.stringify(r.where.OR)).toContain('SI-01');
  });

  it('returns an empty filter when nothing is set', () => {
    expect(buildSalesInvoiceWhere({ status: '', search: '   ' })).toEqual({ ok: true, where: {} });
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildSalesInvoiceWhere({ status: 'Unpaid' }).ok).toBe(false);
    expect(buildSalesInvoiceWhere({ startDate: '01/02/2026' }).ok).toBe(false);
  });
});

describe('salesInvoiceOrderBy', () => {
  it('adds a stable invoice number tie-breaker', () => {
    expect(salesInvoiceOrderBy(DEFAULT_SALES_INVOICE_SORT)).toEqual([{ date: 'desc' }, { invoiceNumber: 'desc' }]);
    expect(salesInvoiceOrderBy({ field: 'invoiceNumber', dir: 'asc' })).toEqual([{ invoiceNumber: 'asc' }]);
    expect(salesInvoiceOrderBy({ field: 'customer', dir: 'asc' })[0]).toEqual({ customer: { name: 'asc' } });
  });
});

describe('listQuery helpers', () => {
  it('parses paging with defaults and caps', () => {
    expect(parseListPaging({}, { defaultLimit: 25, maxLimit: 100 })).toEqual({ page: 1, limit: 25, skip: 0 });
    expect(parseListPaging({ page: '3', limit: '50' }, { defaultLimit: 25, maxLimit: 100 })).toEqual({
      page: 3,
      limit: 50,
      skip: 100,
    });
    expect(parseListPaging({ page: '-2', limit: '9999' }, { defaultLimit: 25, maxLimit: 100 })).toEqual({
      page: 1,
      limit: 100,
      skip: 0,
    });
    expect(parseListPaging({ page: 'abc', limit: '1.5' }, { defaultLimit: 25, maxLimit: 100 }).limit).toBe(25);
  });

  it('parses whitelisted sort fields', () => {
    const fallback = { field: 'date', dir: 'desc' } as const;
    expect(parseSort('-outstanding', ['date', 'outstanding'], fallback)).toEqual({ field: 'outstanding', dir: 'desc' });
    expect(parseSort('date', ['date', 'outstanding'], fallback)).toEqual({ field: 'date', dir: 'asc' });
    expect(parseSort('password', ['date'], fallback)).toBe(fallback);
    expect(parseSort(undefined, ['date'], fallback)).toBe(fallback);
  });

  it('parses dates and first strings', () => {
    expect(parseDateParam('2026-10-03')).toBe('2026-10-03');
    expect(parseDateParam('2026-13-45')).toBeNull();
    expect(parseDateParam(undefined)).toBeUndefined();
    expect(firstString(['a', 'b'])).toBe('a');
    expect(firstString({ nested: 1 })).toBeUndefined();
  });
});
