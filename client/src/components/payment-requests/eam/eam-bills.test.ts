import { describe, expect, it } from 'vitest';
import {
  billState,
  isPosted,
  itemsSummary,
  type GaBill,
} from './eam-bills';

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

describe('itemsSummary', () => {
  it('summarises items', () => {
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
