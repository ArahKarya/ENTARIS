/**
 * Row model + labels for "Transaksi Kas & Bank" (/payments), backed by
 * GET /api/payments/ledger (payments and cash-account journal lines combined
 * and paginated server-side — see server/src/services/paymentList.ts).
 */
import { formatDate, toNumber } from '@/lib/format';
import { getStatusLabel, type DocType } from '@/lib/status';

export type PaymentKind = 'Receive' | 'Pay' | 'VendorDeposit' | 'CustomerDeposit' | 'VendorRefund' | 'CustomerRefund';
export type JournalKind = 'Transfer' | 'Expense' | 'JournalIn';
export type CashLedgerKind = PaymentKind | JournalKind;
export type CashDirection = 'in' | 'out';

export interface CashLedgerRow {
  /** Payment id (source "payment") or journal line id (source "journal"). */
  id: string;
  source: 'payment' | 'journal';
  journalEntryId: string | null;
  date: string;
  number: string;
  partyId: string | null;
  partyName: string | null;
  partyType: string | null;
  kind: CashLedgerKind;
  direction: CashDirection;
  amount: number;
  status: string;
  accountId: string;
  accountName: string | null;
  accountNumber: string | null;
  /** Payment notes or journal narration. */
  notes: string | null;
  /** Payment reference number or journal line description. */
  memo: string | null;
}

export interface CashLedgerSummary {
  count: number;
  cancelledCount: number;
  inCount: number;
  inTotal: number;
  outCount: number;
  outTotal: number;
  net: number;
}

export const KIND_LABEL: Readonly<Record<CashLedgerKind, string>> = {
  Receive: 'Penerimaan',
  Pay: 'Pembayaran',
  VendorDeposit: 'Uang Muka Vendor',
  CustomerDeposit: 'Uang Muka Pelanggan',
  VendorRefund: 'Refund Vendor',
  CustomerRefund: 'Refund Pelanggan',
  Transfer: 'Pinbuk',
  Expense: 'Kas Keluar (Jurnal)',
  JournalIn: 'Kas Masuk (Jurnal)',
};

export const PAYMENT_KINDS: readonly PaymentKind[] = [
  'Receive',
  'Pay',
  'VendorDeposit',
  'CustomerDeposit',
  'VendorRefund',
  'CustomerRefund',
];
export const JOURNAL_KINDS: readonly JournalKind[] = ['Transfer', 'Expense', 'JournalIn'];

export const DIRECTION_LABEL: Readonly<Record<CashDirection, string>> = { in: 'Masuk', out: 'Keluar' };

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind as CashLedgerKind] ?? kind;
}

export const statusDocType = (row: Pick<CashLedgerRow, 'source'>): DocType =>
  row.source === 'journal' ? 'journal' : 'payment';

/** Where a row's cancel action leads (cancellation itself is unchanged). */
export type CancelRoute =
  | { kind: 'dialog' }
  | { kind: 'redirect'; path: string; label: string; message: string };

export function cancelRoute(row: Pick<CashLedgerRow, 'source' | 'kind'>): CancelRoute {
  if (row.kind === 'VendorDeposit') {
    return {
      kind: 'redirect',
      path: '/vendor-deposits',
      label: 'Batalkan di Uang Muka Vendor',
      message: 'Batalkan dari modul Uang Muka Vendor.',
    };
  }
  if (row.kind === 'CustomerDeposit') {
    return {
      kind: 'redirect',
      path: '/customer-deposits',
      label: 'Batalkan di Uang Muka Pelanggan',
      message: 'Batalkan dari modul Uang Muka Pelanggan.',
    };
  }
  if (row.source === 'journal') {
    return {
      kind: 'redirect',
      path: '/gl',
      label: 'Batalkan di Jurnal Umum',
      message: 'Transaksi ini dibuat dari jurnal. Batalkan dari Buku Besar.',
    };
  }
  return { kind: 'dialog' };
}

/** "+" for money in, "−" (U+2212) for money out — never colour alone. */
export function signedPrefix(direction: CashDirection): string {
  return direction === 'in' ? '+' : '−';
}

export function toExportRows(rows: readonly CashLedgerRow[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const amount = toNumber(r.amount) ?? 0;
    return {
      Tanggal: formatDate(r.date),
      Nomor: r.number,
      Sumber: r.source === 'journal' ? 'Jurnal' : 'Pembayaran',
      Tipe: kindLabel(r.kind),
      Arah: DIRECTION_LABEL[r.direction],
      Pihak: r.partyName ?? '',
      'Akun Kas/Bank': r.accountName ? `${r.accountNumber ?? ''} ${r.accountName}`.trim() : '',
      Keterangan: r.notes ?? '',
      Referensi: r.memo ?? '',
      Masuk: r.direction === 'in' ? amount : '',
      Keluar: r.direction === 'out' ? amount : '',
      Status: getStatusLabel(r.status, statusDocType(r)),
    };
  });
}
