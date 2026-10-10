import { describe, expect, it } from 'vitest';
import { matchGenericDummyJournals, specificDummyNarrations } from '../dummyJournalMatch';

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe('specificDummyNarrations', () => {
  it('builds exact narrations from dummy names and invoice numbers', () => {
    const list = specificDummyNarrations({
      customerNames: ['[Dummy] Toko A'],
      supplierNames: ['[Dummy] KUD B'],
      salesInvoiceNumbers: ['SI-202601-0001'],
    });
    expect(list).toEqual([
      'Pembelian gabah - [Dummy] KUD B',
      'Penjualan beras - [Dummy] Toko A',
      'Pembayaran [Dummy] Toko A',
      'HPP: SI-202601-0001',
    ]);
  });
});

describe('matchGenericDummyJournals', () => {
  const markers = [
    { date: d('2026-01-25'), accountId: 'gaji', debit: 9_000_000 },
    { date: d('2026-01-25'), accountId: 'kas', debit: 0 },
    { date: d('2026-02-03'), accountId: 'ap', debit: 1_250_000.5 },
  ];

  it('matches a generic narration only when day, account and debit equal a marker', () => {
    const ids = matchGenericDummyJournals(
      [
        { id: 'dummy-gaji', date: d('2026-01-25'), narration: 'Gaji karyawan bulan 1', items: [{ accountId: 'gaji', debit: 9_000_000 }, { accountId: 'kas', debit: 0 }] },
        { id: 'dummy-pay', date: d('2026-02-03'), narration: 'Pembayaran ke supplier', items: [{ accountId: 'ap', debit: 1_250_000.5 }] },
      ],
      markers,
    );
    expect(ids).toEqual(['dummy-gaji', 'dummy-pay']);
  });

  it('keeps real journals that share a narration but differ in amount, day or account', () => {
    const ids = matchGenericDummyJournals(
      [
        { id: 'real-amount', date: d('2026-01-25'), narration: 'Gaji karyawan bulan 1', items: [{ accountId: 'gaji', debit: 9_500_000 }] },
        { id: 'real-day', date: d('2026-01-26'), narration: 'Gaji karyawan bulan 1', items: [{ accountId: 'gaji', debit: 9_000_000 }] },
        { id: 'real-acct', date: d('2026-02-03'), narration: 'Pembayaran ke supplier', items: [{ accountId: 'other', debit: 1_250_000.5 }] },
      ],
      markers,
    );
    expect(ids).toEqual([]);
  });

  it('never matches narrations outside the generic dummy set', () => {
    const ids = matchGenericDummyJournals(
      [{ id: 'real-pay', date: d('2026-02-03'), narration: 'Pembayaran listrik PLN', items: [{ accountId: 'ap', debit: 1_250_000.5 }] }],
      markers,
    );
    expect(ids).toEqual([]);
  });
});
