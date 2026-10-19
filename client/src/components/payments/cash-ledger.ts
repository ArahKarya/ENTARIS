/**
 * Row model + labels for "Transaksi Kas & Bank" (/payments), backed by
 * GET /api/payments/ledger (payments and cash-account journal lines combined
 * and paginated server-side — see server/src/services/paymentList.ts).
 */
import { formatDate, toNumber } from '@/lib/format';
import { getStatusLabel, type DocType } from '@/lib/status';
import i18n from '@/i18n';

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

const ALL_KINDS: readonly CashLedgerKind[] = [
  'Receive',
  'Pay',
  'VendorDeposit',
  'CustomerDeposit',
  'VendorRefund',
  'CustomerRefund',
  'Transfer',
  'Expense',
  'JournalIn',
];

/** Labels resolve on every read so they follow the UI language. */
export const KIND_LABEL: Readonly<Record<CashLedgerKind, string>> = Object.defineProperties(
  {} as Record<CashLedgerKind, string>,
  Object.fromEntries(
    ALL_KINDS.map((k) => [k, { enumerable: true, get: () => i18n.t(`finance:cashLedger.kind.${k}`) }]),
  ),
);

export const PAYMENT_KINDS: readonly PaymentKind[] = [
  'Receive',
  'Pay',
  'VendorDeposit',
  'CustomerDeposit',
  'VendorRefund',
  'CustomerRefund',
];
export const JOURNAL_KINDS: readonly JournalKind[] = ['Transfer', 'Expense', 'JournalIn'];

export const DIRECTION_LABEL: Readonly<Record<CashDirection, string>> = {
  get in() {
    return i18n.t('finance:cashLedger.direction.in');
  },
  get out() {
    return i18n.t('finance:cashLedger.direction.out');
  },
};

export function kindLabel(kind: string): string {
  return KIND_LABEL[kind as CashLedgerKind] ?? kind;
}

export const statusDocType = (row: Pick<CashLedgerRow, 'source'>): DocType =>
  row.source === 'journal' ? 'journal' : 'payment';

/** Where a row's cancel action leads. */
export type CancelRoute =
  | { kind: 'dialog' }
  | { kind: 'redirect'; path: string; label: string; message: string };

export function cancelRoute(row: Pick<CashLedgerRow, 'source' | 'kind'>): CancelRoute {
  if (row.kind === 'VendorDeposit') {
    return {
      kind: 'redirect',
      path: '/vendor-deposits',
      label: i18n.t('finance:cashLedger.cancel.vendorDepositLabel'),
      message: i18n.t('finance:cashLedger.cancel.vendorDepositMessage'),
    };
  }
  if (row.kind === 'CustomerDeposit') {
    return {
      kind: 'redirect',
      path: '/customer-deposits',
      label: i18n.t('finance:cashLedger.cancel.customerDepositLabel'),
      message: i18n.t('finance:cashLedger.cancel.customerDepositMessage'),
    };
  }
  if (row.source === 'journal') {
    return {
      kind: 'redirect',
      path: '/gl',
      label: i18n.t('finance:cashLedger.cancel.journalLabel'),
      message: i18n.t('finance:cashLedger.cancel.journalMessage'),
    };
  }
  return { kind: 'dialog' };
}

/** "+" for money in, "−" (U+2212) for money out — never colour alone. */
export function signedPrefix(direction: CashDirection): string {
  return direction === 'in' ? '+' : '−';
}

type ExportColumn =
  | 'date'
  | 'number'
  | 'source'
  | 'type'
  | 'direction'
  | 'party'
  | 'account'
  | 'notes'
  | 'reference'
  | 'in'
  | 'out'
  | 'status';

export function toExportRows(rows: readonly CashLedgerRow[]): Record<string, unknown>[] {
  return rows.map((r) => {
    const amount = toNumber(r.amount) ?? 0;
    const col = (key: ExportColumn) => i18n.t(`finance:cashLedger.export.${key}`);
    return {
      [col('date')]: formatDate(r.date),
      [col('number')]: r.number,
      [col('source')]: r.source === 'journal' ? i18n.t('finance:cashLedger.source.journal') : i18n.t('finance:cashLedger.source.payment'),
      [col('type')]: kindLabel(r.kind),
      [col('direction')]: DIRECTION_LABEL[r.direction],
      [col('party')]: r.partyName ?? '',
      [col('account')]: r.accountName ? `${r.accountNumber ?? ''} ${r.accountName}`.trim() : '',
      [col('notes')]: r.notes ?? '',
      [col('reference')]: r.memo ?? '',
      [col('in')]: r.direction === 'in' ? amount : '',
      [col('out')]: r.direction === 'out' ? amount : '',
      [col('status')]: getStatusLabel(r.status, statusDocType(r)),
    };
  });
}
