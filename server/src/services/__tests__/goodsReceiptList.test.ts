import { describe, it, expect } from 'vitest';
import {
  buildGoodsReceiptWhere,
  DEFAULT_GOODS_RECEIPT_SORT,
  GOODS_RECEIPT_SORT_FIELDS,
  goodsReceiptOrderBy,
} from '../goodsReceiptList';
import { parseSort } from '../../utils/listQuery';

describe('buildGoodsReceiptWhere', () => {
  it('hides legacy backfill STTs by default', () => {
    expect(buildGoodsReceiptWhere({})).toEqual({ ok: true, where: { isLegacyBackfill: false } });
  });

  it('includes legacy backfill STTs on request', () => {
    expect(buildGoodsReceiptWhere({ includeLegacy: 'true' })).toEqual({ ok: true, where: {} });
  });

  it('maps derived billing statuses', () => {
    const where = (status: string) => {
      const r = buildGoodsReceiptWhere({ status, includeLegacy: 'true' });
      return r.ok ? r.where : null;
    };
    expect(where('Uninvoiced')).toEqual({ status: 'Submitted', invoiceId: null, isCustomerOwned: false });
    expect(where('Invoiced')).toEqual({ status: 'Submitted', invoiceId: { not: null } });
    expect(where('CustomerOwned')).toEqual({ status: 'Submitted', isCustomerOwned: true });
    expect(where('Cancelled')).toEqual({ status: 'Cancelled' });
    // Older callers: "Submitted" = posted and not invoiced (titipan included).
    expect(where('Submitted')).toEqual({ status: 'Submitted', invoiceId: null });
  });

  it('does not share the status template between calls', () => {
    const a = buildGoodsReceiptWhere({ status: 'Invoiced', partyId: 'p1' });
    const b = buildGoodsReceiptWhere({ status: 'Invoiced' });
    expect(a.ok && a.where.partyId).toBe('p1');
    expect(b.ok && b.where.partyId).toBeUndefined();
  });

  it('maps supplier, local-day date range and search', () => {
    const r = buildGoodsReceiptWhere({
      partyId: 'p1',
      startDate: '2026-03-01',
      endDate: '2026-03-01',
      search: ' B 1234 ',
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where.partyId).toBe('p1');
    expect(r.where.date).toEqual({
      gte: new Date('2026-02-28T17:00:00.000Z'),
      lt: new Date('2026-03-01T17:00:00.000Z'),
    });
    expect(r.where.OR).toEqual([
      { sttNumber: { contains: 'B 1234', mode: 'insensitive' } },
      { supplier: { name: { contains: 'B 1234', mode: 'insensitive' } } },
      { nomorMobil: { contains: 'B 1234', mode: 'insensitive' } },
      { purchaseOrder: { poNumber: { contains: 'B 1234', mode: 'insensitive' } } },
    ]);
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildGoodsReceiptWhere({ status: 'Paid' })).toEqual({ ok: false, error: 'Status STT tidak dikenal.' });
    expect(buildGoodsReceiptWhere({ startDate: '2026-1-1' }).ok).toBe(false);
    expect(buildGoodsReceiptWhere({ endDate: 'kemarin' }).ok).toBe(false);
  });
});

describe('goodsReceiptOrderBy', () => {
  it('defaults to newest date with the STT number as tie-breaker', () => {
    expect(goodsReceiptOrderBy(DEFAULT_GOODS_RECEIPT_SORT)).toEqual([{ date: 'desc' }, { sttNumber: 'desc' }]);
  });

  it('sorts by supplier name and STT number alone', () => {
    expect(goodsReceiptOrderBy({ field: 'supplier', dir: 'asc' })).toEqual([
      { supplier: { name: 'asc' } },
      { sttNumber: 'asc' },
    ]);
    expect(goodsReceiptOrderBy({ field: 'sttNumber', dir: 'desc' })).toEqual([{ sttNumber: 'desc' }]);
  });

  it('ignores sort fields outside the whitelist', () => {
    expect(parseSort('nomorMobil', GOODS_RECEIPT_SORT_FIELDS, DEFAULT_GOODS_RECEIPT_SORT)).toEqual(
      DEFAULT_GOODS_RECEIPT_SORT,
    );
  });
});
