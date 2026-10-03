import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildQuotationWhere,
  DEFAULT_QUOTATION_SORT,
  expiringSoonWhere,
  quotationOrderBy,
  summarizeQuotations,
  type QuotationStatusGroupRow,
} from '../quotationList';

const group = (status: string, n: number, gt: string | null): QuotationStatusGroupRow => ({
  status,
  _count: { _all: n },
  _sum: { grandTotal: gt === null ? null : new Prisma.Decimal(gt) },
});

const NO_EXTRA = { expiringSoonCount: 0, awaitingConversionCount: 0 };

describe('summarizeQuotations', () => {
  it('sums value without cancelled and rates accepted over issued', () => {
    const summary = summarizeQuotations(
      [
        group('Draft', 2, '200'),
        group('Sent', 3, '300.10'),
        group('Accepted', 2, '250.20'),
        group('Rejected', 1, '100'),
        group('Expired', 2, '50'),
        group('Cancelled', 1, '999'),
      ],
      { expiringSoonCount: 1, awaitingConversionCount: 2 },
    );
    expect(summary).toMatchObject({
      count: 11,
      grandTotal: 900.3,
      draftCount: 2,
      sentCount: 3,
      acceptedCount: 2,
      issuedCount: 8,
      conversionRate: 0.25,
      expiringSoonCount: 1,
      awaitingConversionCount: 2,
    });
    expect(summary.byStatus.Cancelled).toEqual({ count: 1, grandTotal: 999 });
  });

  it('handles an empty result (null sums, no issued quotations)', () => {
    expect(summarizeQuotations([], NO_EXTRA)).toEqual({
      count: 0,
      grandTotal: 0,
      draftCount: 0,
      sentCount: 0,
      acceptedCount: 0,
      issuedCount: 0,
      conversionRate: 0,
      expiringSoonCount: 0,
      awaitingConversionCount: 0,
      byStatus: {},
    });
    expect(summarizeQuotations([group('Draft', 1, null)], NO_EXTRA).conversionRate).toBe(0);
  });

  it('keeps decimal precision (no float drift)', () => {
    const summary = summarizeQuotations(
      [group('Draft', 1, '0.1'), group('Sent', 1, '0.1'), group('Accepted', 1, '0.1')],
      NO_EXTRA,
    );
    expect(summary.grandTotal).toBe(0.3);
  });
});

describe('buildQuotationWhere', () => {
  it('builds filters shared by list and summary', () => {
    const r = buildQuotationWhere({
      status: 'Sent',
      partyId: 'p1',
      startDate: '2026-01-01',
      endDate: '2026-01-31',
      search: ' QO-01 ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where.status).toBe('Sent');
    expect(r.where.partyId).toBe('p1');
    expect(r.where.date).toEqual({
      gte: new Date('2025-12-31T17:00:00.000Z'),
      lt: new Date('2026-01-31T17:00:00.000Z'),
    });
    expect(r.where.OR).toHaveLength(2);
    expect(JSON.stringify(r.where.OR)).toContain('"QO-01"');
  });

  it('returns an empty filter when nothing is set', () => {
    expect(buildQuotationWhere({ status: '', search: ' ' })).toEqual({ ok: true, where: {} });
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildQuotationWhere({ status: 'Terkirim' }).ok).toBe(false);
    expect(buildQuotationWhere({ startDate: '2026-02-30x' }).ok).toBe(false);
  });
});

describe('quotationOrderBy', () => {
  it('adds a stable quotation number tie-breaker', () => {
    expect(quotationOrderBy(DEFAULT_QUOTATION_SORT)).toEqual([{ date: 'desc' }, { quotationNumber: 'desc' }]);
    expect(quotationOrderBy({ field: 'quotationNumber', dir: 'asc' })).toEqual([{ quotationNumber: 'asc' }]);
    expect(quotationOrderBy({ field: 'customer', dir: 'asc' })[0]).toEqual({ customer: { name: 'asc' } });
  });
});

describe('expiringSoonWhere', () => {
  it('matches sent quotations valid for at most 3 more days', () => {
    const now = new Date('2026-10-03T00:00:00.000Z');
    expect(expiringSoonWhere(now)).toEqual({
      status: 'Sent',
      validUntil: { gte: now, lte: new Date('2026-10-06T00:00:00.000Z') },
    });
  });
});
