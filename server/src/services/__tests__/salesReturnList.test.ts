import { describe, it, expect } from 'vitest';
import {
  buildSalesReturnWhere,
  DEFAULT_SALES_RETURN_SORT,
  SALES_RETURN_SORT_FIELDS,
  salesReturnOrderBy,
} from '../salesReturnList';
import { parseSort } from '../../utils/listQuery';

describe('buildSalesReturnWhere', () => {
  it('returns an empty filter by default', () => {
    expect(buildSalesReturnWhere({})).toEqual({ ok: true, where: {} });
  });

  it('builds status, party, invoice, date range and search filters', () => {
    const r = buildSalesReturnWhere({
      status: 'Submitted',
      partyId: 'p1',
      salesInvoiceId: 'si1',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      search: ' RN-2026 ',
    });
    expect(r).toEqual({
      ok: true,
      where: {
        status: 'Submitted',
        partyId: 'p1',
        salesInvoiceId: 'si1',
        date: { gte: new Date('2026-10-01'), lte: new Date('2026-10-31T23:59:59.999Z') },
        OR: [
          { returnNumber: { contains: 'RN-2026', mode: 'insensitive' } },
          { customer: { name: { contains: 'RN-2026', mode: 'insensitive' } } },
          { salesInvoice: { invoiceNumber: { contains: 'RN-2026', mode: 'insensitive' } } },
        ],
      },
    });
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildSalesReturnWhere({ status: 'Paid' })).toEqual({ ok: false, error: 'Status retur tidak dikenal.' });
    expect(buildSalesReturnWhere({ startDate: 'kemarin' }).ok).toBe(false);
  });

  it('ignores blank params', () => {
    expect(buildSalesReturnWhere({ status: '  ', search: '', partyId: [''] })).toEqual({ ok: true, where: {} });
  });
});

describe('salesReturnOrderBy', () => {
  it('defaults to newest first with a return-number tie-breaker', () => {
    expect(salesReturnOrderBy(DEFAULT_SALES_RETURN_SORT)).toEqual([{ date: 'desc' }, { returnNumber: 'desc' }]);
  });

  it('sorts by customer name through the relation', () => {
    expect(salesReturnOrderBy({ field: 'customer', dir: 'asc' })).toEqual([
      { customer: { name: 'asc' } },
      { returnNumber: 'asc' },
    ]);
  });

  it('only accepts whitelisted fields', () => {
    expect(parseSort('-totalReturn', SALES_RETURN_SORT_FIELDS, DEFAULT_SALES_RETURN_SORT)).toEqual({
      field: 'totalReturn',
      dir: 'desc',
    });
    expect(parseSort('status', SALES_RETURN_SORT_FIELDS, DEFAULT_SALES_RETURN_SORT)).toBe(DEFAULT_SALES_RETURN_SORT);
    expect(salesReturnOrderBy({ field: 'returnNumber', dir: 'asc' })).toEqual([{ returnNumber: 'asc' }]);
  });
});
