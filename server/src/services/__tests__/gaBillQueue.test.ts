import { describe, it, expect, vi } from 'vitest';

vi.mock('../../lib/prisma', () => ({ prisma: {} }));
vi.mock('../gaFinance', () => ({
  ACC_VEHICLE_TAX: '6.41',
  ACC_VEHICLE_MAINTENANCE: '6.42',
}));
vi.mock('../gaVehicleServiceJournal', () => ({}));

import { filterAndSortBills, parseEamQuery, summarizeEam, DEFAULT_EAM_SORT, type GaBill, type EamQuery } from '../gaBillQueue';

const bill = (over: Record<string, unknown>): GaBill =>
  ({
    kind: 'VEHICLE_TAX',
    id: 'x',
    ref: 'PKB 2026',
    date: new Date('2026-09-10T00:00:00+07:00'),
    assetCode: 'V-1',
    assetName: 'Hilux',
    description: 'PKB — Hilux TA 2026',
    amount: 1000,
    status: 'IN_PROCESS',
    defaultAccountNumber: '6.41',
    journalEntry: null,
    purchaseInvoice: null,
    notes: null,
    ...over,
  }) as unknown as GaBill;

const q = (over: Partial<EamQuery> = {}): EamQuery => ({ kind: 'ALL', posting: 'pending', search: '', ...over });

const bills = [
  bill({ id: 'a', amount: 500, date: new Date('2026-09-01T00:00:00+07:00') }),
  bill({ id: 'b', kind: 'SERVICE_LOG', ref: 'Servis', description: 'Ganti oli (Bengkel A)', assetName: 'Avanza', amount: 300, date: new Date('2026-09-20T00:00:00+07:00') }),
  bill({ id: 'c', kind: 'MATERIAL_REQUEST', ref: 'MR-1', description: 'Sparepart MR-1', assetName: null, amount: 900, date: null }),
  bill({ id: 'd', amount: 700, journalEntry: { id: 'j', entryNumber: 'JE-1', status: 'POSTED' } as any }),
  bill({ id: 'e', amount: 100, purchaseInvoice: { id: 'p', invoiceNumber: 'PI-1', status: 'UNPAID', outstanding: 100 } as any }),
];

describe('parseEamQuery', () => {
  it('defaults to the pending queue, all kinds', () => {
    expect(parseEamQuery({})).toMatchObject({ ok: true, query: { kind: 'ALL', posting: 'pending', search: '' } });
  });
  it('rejects unknown kind / posting / bad dates', () => {
    expect(parseEamQuery({ kind: 'NOPE' })).toMatchObject({ ok: false });
    expect(parseEamQuery({ posting: 'zzz' })).toMatchObject({ ok: false });
    expect(parseEamQuery({ startDate: '10-09-2026' })).toMatchObject({ ok: false });
    expect(parseEamQuery({ startDate: '2026-09-10', endDate: '2026-09-01' })).toMatchObject({ ok: false });
  });
  it('normalizes kind and lowercases search', () => {
    expect(parseEamQuery({ kind: 'service_log', search: ' OLI ' })).toMatchObject({
      ok: true,
      query: { kind: 'SERVICE_LOG', search: 'oli' },
    });
  });
});

describe('filterAndSortBills', () => {
  const ids = (rows: GaBill[]) => rows.map((r) => r.id);

  it('pending hides journaled and invoiced bills', () => {
    expect(ids(filterAndSortBills(bills, q(), { field: 'amount', dir: 'asc' }))).toEqual(['b', 'a', 'c']);
  });
  it('posted / all', () => {
    expect(ids(filterAndSortBills(bills, q({ posting: 'posted' }), { field: 'amount', dir: 'desc' }))).toEqual(['d', 'e']);
    expect(filterAndSortBills(bills, q({ posting: 'all' }), DEFAULT_EAM_SORT)).toHaveLength(5);
  });
  it('filters by kind and search', () => {
    expect(ids(filterAndSortBills(bills, q({ kind: 'SERVICE_LOG' }), DEFAULT_EAM_SORT))).toEqual(['b']);
    expect(ids(filterAndSortBills(bills, q({ search: 'avanza' }), DEFAULT_EAM_SORT))).toEqual(['b']);
  });
  it('date range uses the business day and drops undated bills', () => {
    const r = filterAndSortBills(bills, q({ startDate: '2026-09-15', endDate: '2026-09-30' }), DEFAULT_EAM_SORT);
    expect(ids(r)).toEqual(['b']);
  });
  it('date sort keeps undated last', () => {
    expect(ids(filterAndSortBills(bills, q(), { field: 'date', dir: 'desc' }))).toEqual(['b', 'a', 'c']);
  });
});

describe('summarizeEam', () => {
  it('counts the unposted queue overall and the matched rows separately', () => {
    const matched = filterAndSortBills(bills, q({ posting: 'all', kind: 'VEHICLE_TAX' }), DEFAULT_EAM_SORT);
    expect(summarizeEam(bills, matched)).toEqual({ pendingCount: 3, pendingAmount: 1700, matchedCount: 3, matchedAmount: 1300 });
  });
});
