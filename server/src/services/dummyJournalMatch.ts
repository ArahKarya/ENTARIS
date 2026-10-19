/**
 * Identifies journals created by the dummy-data generator before journals carried
 * `isDummy`, without touching real journals that happen to share a narration.
 */

/** Ledger marker ids the generator wrote for journals that have no source document. */
export const DUMMY_LEDGER_MARKERS = ['dummy-modal-init', 'dummy-gaji', 'dummy-listrik', 'dummy-pay-pi'] as const;

/** Generic narrations: only matched together with a dummy ledger marker row (same day, account, debit). */
export const GENERIC_DUMMY_NARRATION = /^(Setoran modal awal|Pembayaran ke supplier|Gaji karyawan bulan \d{1,2}|Listrik & air bulan \d{1,2})$/;

export interface DummyNames {
  customerNames: string[];
  supplierNames: string[];
  salesInvoiceNumbers: string[];
}

/** Narrations that embed a dummy party name or dummy invoice number, matched exactly. */
export function specificDummyNarrations({ customerNames, supplierNames, salesInvoiceNumbers }: DummyNames): string[] {
  return [
    ...supplierNames.map((n) => `Pembelian gabah - ${n}`),
    ...customerNames.map((n) => `Penjualan beras - ${n}`),
    ...customerNames.map((n) => `Pembayaran ${n}`),
    ...salesInvoiceNumbers.map((n) => `HPP: ${n}`),
  ];
}

export interface JournalCandidate {
  id: string;
  date: Date;
  narration: string | null;
  items: { accountId: string; debit: number }[];
}

export interface MarkerRow {
  date: Date;
  accountId: string;
  debit: number;
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const cents = (n: number) => Math.round(n * 100);

/** Generic-narration journals whose debit line matches a dummy marker row exactly. */
export function matchGenericDummyJournals(candidates: JournalCandidate[], markers: MarkerRow[]): string[] {
  const keys = new Set(
    markers.filter((m) => m.debit > 0).map((m) => `${dayKey(m.date)}|${m.accountId}|${cents(m.debit)}`),
  );
  return candidates
    .filter((j) => j.narration != null && GENERIC_DUMMY_NARRATION.test(j.narration))
    .filter((j) => j.items.some((it) => it.debit > 0 && keys.has(`${dayKey(j.date)}|${it.accountId}|${cents(it.debit)}`)))
    .map((j) => j.id);
}
