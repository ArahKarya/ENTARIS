import { describe, it, expect } from 'vitest';
import { Prisma } from '@prisma/client';
import {
  buildStockOpnameWhere,
  DEFAULT_STOCK_OPNAME_SORT,
  mergeOpnameWarehouses,
  opnameWarehouses,
  STOCK_OPNAME_SORT_FIELDS,
  stockOpnameOrderBy,
  summarizeOpnameLines,
} from '../stockOpnameList';
import { parseSort } from '../../utils/listQuery';

describe('buildStockOpnameWhere', () => {
  it('returns an empty filter for an empty query (legacy callers)', () => {
    expect(buildStockOpnameWhere({})).toEqual({ ok: true, where: {} });
  });

  it('maps status and a local-day date range', () => {
    const r = buildStockOpnameWhere({ status: 'Submitted', startDate: '2026-10-01', endDate: '2026-10-31' });
    expect(r).toEqual({
      ok: true,
      where: {
        status: 'Submitted',
        date: { gte: new Date('2026-09-30T17:00:00.000Z'), lt: new Date('2026-10-31T17:00:00.000Z') },
      },
    });
  });

  it('filters by header warehouse, resolved opname ids or the line warehouse', () => {
    const r = buildStockOpnameWhere({ warehouseId: 'w1' }, { warehouseOpnameIds: ['o1', 'o2'] });
    expect(r.ok && r.where.OR).toEqual([
      { warehouseId: 'w1' },
      { id: { in: ['o1', 'o2'] } },
      { items: { some: { warehouseId: 'w1' } } },
    ]);
  });

  it('matches nothing via ids when no movement hit the warehouse', () => {
    const r = buildStockOpnameWhere({ warehouseId: 'w1' });
    expect(r.ok && r.where.OR?.[1]).toEqual({ id: { in: [] } });
  });

  it('searches number, notes and creator; combines with warehouse via AND', () => {
    const r = buildStockOpnameWhere({ search: ' SO-0001 ', warehouseId: 'w1' }, { warehouseOpnameIds: [] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.where.OR).toBeUndefined();
    expect(r.where.AND).toHaveLength(2);
    expect((r.where.AND as Prisma.StockOpnameWhereInput[])[1].OR).toEqual([
      { opnameNumber: { contains: 'SO-0001', mode: 'insensitive' } },
      { notes: { contains: 'SO-0001', mode: 'insensitive' } },
      { createdBy: { fullName: { contains: 'SO-0001', mode: 'insensitive' } } },
    ]);
  });

  it('rejects unknown statuses and malformed dates', () => {
    expect(buildStockOpnameWhere({ status: 'Posted' }).ok).toBe(false);
    expect(buildStockOpnameWhere({ endDate: '2026/10/01' }).ok).toBe(false);
  });
});

describe('stockOpnameOrderBy', () => {
  it('defaults to newest date with the opname number as tie-breaker', () => {
    expect(stockOpnameOrderBy(DEFAULT_STOCK_OPNAME_SORT)).toEqual([{ date: 'desc' }, { opnameNumber: 'desc' }]);
    expect(stockOpnameOrderBy({ field: 'opnameNumber', dir: 'asc' })).toEqual([{ opnameNumber: 'asc' }]);
  });

  it('ignores sort fields outside the whitelist', () => {
    expect(parseSort('-totalVariance', STOCK_OPNAME_SORT_FIELDS, DEFAULT_STOCK_OPNAME_SORT)).toEqual(
      DEFAULT_STOCK_OPNAME_SORT,
    );
  });
});

describe('summarizeOpnameLines', () => {
  it('sums absolute line values and counts lines with a difference per opname', () => {
    const m = summarizeOpnameLines([
      { stockOpnameId: 'a', difference: new Prisma.Decimal('-20'), totalValue: new Prisma.Decimal('69389.80') },
      { stockOpnameId: 'a', difference: new Prisma.Decimal('0'), totalValue: new Prisma.Decimal('0') },
      { stockOpnameId: 'a', difference: '5.5', totalValue: '20267.61' },
      { stockOpnameId: 'b', difference: 0, totalValue: 0 },
    ]);
    expect(m.get('a')).toEqual({ totalVariance: 69389.8 + 20267.61, itemsWithDiff: 2 });
    expect(m.get('b')).toEqual({ totalVariance: 0, itemsWithDiff: 0 });
    expect(m.has('c')).toBe(false);
  });
});

describe('opnameWarehouses', () => {
  it('groups distinct warehouses per opname and skips unattributed movements', () => {
    const utm = { id: 'w1', code: 'GDG-UTM', name: 'Gudang Utama' };
    const prd = { id: 'w2', code: 'GDG-PRD', name: 'Gudang Produksi' };
    const m = opnameWarehouses([
      { referenceId: 'a', warehouse: utm },
      { referenceId: 'a', warehouse: utm },
      { referenceId: 'a', warehouse: prd },
      { referenceId: 'b', warehouse: null },
      { referenceId: null, warehouse: utm },
    ]);
    expect(m.get('a')).toEqual([utm, prd]);
    expect(m.has('b')).toBe(false);
  });
});

describe('mergeOpnameWarehouses', () => {
  const utm = { id: 'w1', code: 'GDG-UTM', name: 'Gudang Utama' };
  const prd = { id: 'w2', code: 'GDG-PRD', name: 'Gudang Produksi' };

  it('shows the header warehouse even without adjustment movements', () => {
    expect(mergeOpnameWarehouses(utm, [])).toEqual([utm]);
  });

  it('puts the header first and drops duplicates from movements', () => {
    expect(mergeOpnameWarehouses(utm, [prd, utm])).toEqual([utm, prd]);
  });

  it('falls back to movement warehouses for legacy rows without a header', () => {
    expect(mergeOpnameWarehouses(null, [prd])).toEqual([prd]);
  });
});
