import { describe, expect, it } from 'vitest';
import {
  JOURNAL_KINDS,
  KIND_LABEL,
  PAYMENT_KINDS,
  cancelRoute,
  kindLabel,
  signedPrefix,
  statusDocType,
  toExportRows,
  type CashLedgerRow,
} from './cash-ledger';

const row = (patch: Partial<CashLedgerRow> = {}): CashLedgerRow => ({
  id: 'p1',
  source: 'payment',
  journalEntryId: null,
  date: '2026-10-02T17:00:00.000Z',
  number: 'PAY-202610-0001',
  partyId: 'party-1',
  partyName: 'Toko Beras',
  partyType: 'Customer',
  kind: 'Receive',
  direction: 'in',
  amount: 1500000,
  status: 'Submitted',
  accountId: 'acc-1',
  accountName: 'Bank BCA',
  accountNumber: '1.1.5',
  notes: 'Pelunasan',
  memo: 'TF-01',
  ...patch,
});

describe('kind labels', () => {
  it('labels every payment type and journal kind', () => {
    for (const k of [...PAYMENT_KINDS, ...JOURNAL_KINDS]) expect(KIND_LABEL[k]).toBeTruthy();
    expect(kindLabel('Transfer')).toBe('Pinbuk');
    expect(kindLabel('Unknown')).toBe('Unknown');
  });
});

describe('signedPrefix', () => {
  it('marks direction with a sign, not only colour', () => {
    expect(signedPrefix('in')).toBe('+');
    expect(signedPrefix('out')).toBe('−');
  });
});

describe('statusDocType', () => {
  it('maps the row source to the status registry doc type', () => {
    expect(statusDocType({ source: 'payment' })).toBe('payment');
    expect(statusDocType({ source: 'journal' })).toBe('journal');
  });
});

describe('cancelRoute', () => {
  it('cancels Receive/Pay/refunds through the confirmation dialog', () => {
    for (const kind of ['Receive', 'Pay', 'VendorRefund', 'CustomerRefund'] as const) {
      expect(cancelRoute({ source: 'payment', kind })).toEqual({ kind: 'dialog' });
    }
  });

  it('sends deposits and journals to their own modules', () => {
    expect(cancelRoute({ source: 'payment', kind: 'VendorDeposit' })).toMatchObject({ kind: 'redirect', path: '/vendor-deposits' });
    expect(cancelRoute({ source: 'payment', kind: 'CustomerDeposit' })).toMatchObject({ kind: 'redirect', path: '/customer-deposits' });
    for (const kind of JOURNAL_KINDS) {
      expect(cancelRoute({ source: 'journal', kind })).toMatchObject({ kind: 'redirect', path: '/gl' });
    }
  });
});

describe('toExportRows', () => {
  it('splits amounts into Masuk / Keluar columns with Indonesian labels', () => {
    const [inRow, outRow] = toExportRows([
      row(),
      row({
        id: 'ji-1',
        source: 'journal',
        journalEntryId: 'je-1',
        number: 'JV-202610-0018',
        kind: 'Expense',
        direction: 'out',
        amount: 750000,
        partyName: null,
        memo: null,
        status: 'Submitted',
      }),
    ]);
    expect(inRow).toMatchObject({
      Nomor: 'PAY-202610-0001',
      Sumber: 'Pembayaran',
      Tipe: 'Penerimaan',
      Arah: 'Masuk',
      Pihak: 'Toko Beras',
      'Akun Kas/Bank': '1.1.5 Bank BCA',
      Masuk: 1500000,
      Keluar: '',
      Status: 'Diposting',
    });
    expect(outRow).toMatchObject({
      Sumber: 'Jurnal',
      Tipe: 'Kas Keluar (Jurnal)',
      Arah: 'Keluar',
      Pihak: '',
      Referensi: '',
      Masuk: '',
      Keluar: 750000,
    });
  });
});
