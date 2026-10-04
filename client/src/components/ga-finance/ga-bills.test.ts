import { describe, expect, it } from 'vitest';
import {
  billState,
  billsRequestParams,
  filterBills,
  isPosted,
  itemsSummary,
  sortBills,
  sumAmount,
  type GaBill,
} from './ga-bills';

const bill = (patch: Partial<GaBill> = {}): GaBill => ({
  kind: 'MATERIAL_REQUEST',
  id: 'b1',
  ref: 'MR-2026-0001',
  date: '2026-10-04T02:36:14.951Z',
  assetCode: null,
  assetName: 'Mesin Penggiling',
  description: 'Sparepart MR-2026-0001 — 2 item',
  amount: 1_110_000,
  status: 'APPROVED',
  defaultAccountNumber: '6.7',
  journalEntry: null,
  purchaseInvoice: null,
  ...patch,
});

const je = { id: 'je1', entryNumber: 'JV-1', status: 'Submitted' };
const pi = { id: 'pi1', invoiceNumber: 'PI-1', status: 'Submitted', outstanding: 500 };

describe('posting state', () => {
  it('treats a journal or a purchase invoice as posted (legacy rule)', () => {
    expect(isPosted(bill())).toBe(false);
    expect(isPosted(bill({ journalEntry: je }))).toBe(true);
    expect(isPosted(bill({ purchaseInvoice: pi }))).toBe(true);
  });

  it('derives label, tone and linked document', () => {
    expect(billState(bill())).toMatchObject({ label: 'Menunggu posting', tone: 'warning' });
    expect(billState(bill({ journalEntry: je }))).toMatchObject({ label: 'Diposting', tone: 'success', doc: 'JV-1' });
    expect(billState(bill({ purchaseInvoice: pi }))).toMatchObject({ label: 'Difakturkan', tone: 'info', doc: 'PI-1' });
  });
});

describe('billsRequestParams', () => {
  it('maps the URL filters to kind / includePaid', () => {
    expect(billsRequestParams({})).toEqual({ kind: 'ALL', includePaid: false });
    expect(billsRequestParams({ kind: 'SERVICE_LOG', posting: 'posted' })).toEqual({
      kind: 'SERVICE_LOG',
      includePaid: true,
    });
    expect(billsRequestParams({ kind: 'bogus', posting: 'all' })).toEqual({ kind: 'ALL', includePaid: true });
  });
});

describe('filterBills', () => {
  const rows = [
    bill(),
    bill({ id: 'b2', ref: 'STNK 2026', description: 'STNK — Hilux', assetName: 'Hilux', assetCode: 'KDR-01', date: '2026-09-30T17:30:00.000Z', journalEntry: je }),
    bill({ id: 'b3', date: null }),
  ];

  it('searches description, asset name / code and ref', () => {
    expect(filterBills(rows, { search: 'kdr-01' }).map((b) => b.id)).toEqual(['b2']);
    expect(filterBills(rows, { search: 'mr-2026' }).map((b) => b.id)).toEqual(['b1', 'b3']);
  });

  it('keeps only posted bills in the posted view', () => {
    expect(filterBills(rows, { posting: 'posted' }).map((b) => b.id)).toEqual(['b2']);
    expect(filterBills(rows, { posting: 'all' })).toHaveLength(3);
  });

  it('filters by local calendar day and drops undated bills', () => {
    const day = (iso: string) => {
      const d = new Date(iso);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    };
    const d1 = day(rows[0].date!);
    expect(filterBills(rows, { startDate: d1, endDate: d1 }).map((b) => b.id)).toEqual(['b1']);
    expect(filterBills(rows, { startDate: '2000-01-01' }).map((b) => b.id)).toEqual(['b1', 'b2']);
  });
});

describe('sortBills', () => {
  const rows = [
    bill({ id: 'a', amount: 300, date: '2026-10-02T00:00:00Z', assetName: 'Zeta' }),
    bill({ id: 'b', amount: 100, date: null, assetName: 'alpha', kind: 'VEHICLE_TAX' }),
    bill({ id: 'c', amount: 200, date: '2026-10-01T00:00:00Z', assetName: 'Beta', kind: 'SERVICE_LOG' }),
  ];

  it('keeps the server order without a sort', () => {
    expect(sortBills(rows, null).map((b) => b.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts by amount, asset and kind', () => {
    expect(sortBills(rows, { id: 'amount', desc: true }).map((b) => b.id)).toEqual(['a', 'c', 'b']);
    expect(sortBills(rows, { id: 'asset', desc: false }).map((b) => b.id)).toEqual(['b', 'c', 'a']);
    expect(sortBills(rows, { id: 'kind', desc: false }).map((b) => b.id)).toEqual(['b', 'a', 'c']);
  });

  it('puts undated bills last in both directions', () => {
    expect(sortBills(rows, { id: 'date', desc: false }).map((b) => b.id)).toEqual(['c', 'a', 'b']);
    expect(sortBills(rows, { id: 'date', desc: true }).map((b) => b.id)).toEqual(['a', 'c', 'b']);
  });
});

describe('summaries', () => {
  it('sums amounts and summarises items', () => {
    expect(sumAmount([bill({ amount: 100 }), bill({ amount: 50.5 })])).toBe(150.5);
    expect(itemsSummary(undefined)).toBe('');
    expect(
      itemsSummary([
        { itemName: 'Bearing', quantity: 4, uom: 'pcs', unitPrice: 1 },
        { itemName: 'V-Belt', quantity: 2, uom: 'pcs', unitPrice: 1 },
        { itemName: 'Oli', quantity: 1, uom: 'l', unitPrice: 1 },
      ]),
    ).toBe('Bearing ×4, V-Belt ×2 +1 lain');
  });
});
