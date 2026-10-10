/**
 * Draft Buku Kas — shared types and pure helpers for the list, review page and
 * paste/CSV dialog. The server is the source of truth for every rule (DR/CR,
 * classification, validation); the helpers here only PREVIEW edits locally
 * (live totals, balance check, which types fit a direction) before saving.
 */

import i18n from '@/i18n';

export const CB_ENDPOINT = '/cash-book-drafts';
export const CB_ROW_LIMIT = 300;
export const CB_REVIEW_THRESHOLD = 0.7;

export const DRAFT_STATUSES = ['Draft', 'PartiallyPosted', 'Posted', 'Discarded'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const TXN_TYPES = ['pengeluaran', 'pemasukan', 'uang_muka', 'terima_kasbon', 'lainnya'] as const;
export type TxnType = (typeof TXN_TYPES)[number];
export type Direction = 'masuk' | 'keluar';

/** Labels resolve on every read so they follow the UI language. */
export const TXN_LABEL: Readonly<Record<TxnType, string>> = Object.defineProperties(
  {} as Record<TxnType, string>,
  Object.fromEntries(
    TXN_TYPES.map((type) => [type, { enumerable: true, get: () => i18n.t(`finance:cashBook.txnType.${type}`) }]),
  ),
);

export interface CounterAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  isCash: boolean;
  role: 'EMPLOYEE_ADVANCE' | 'OTHER_EXPENSE' | 'OTHER_INCOME' | null;
}

export interface AccountsResponse {
  accounts: CounterAccount[];
  cashAccounts: CounterAccount[];
  rules: { advanceAccountId: string | null; defaultExpenseAccountId: string | null; defaultIncomeAccountId: string | null };
  limits: { maxRows: number; reviewThreshold: number };
}

export interface DraftRow {
  id: string;
  idx: number;
  rowDate: string;
  description: string;
  amount: number;
  direction: Direction;
  txnType: TxnType;
  accountId: string | null;
  accountCode: string | null;
  accountLabel: string | null;
  confidence: number;
  needsReview: boolean;
  reason: string | null;
  isDuplicate: boolean;
  skip: boolean;
  userEdited: boolean;
  journalEntryId: string | null;
  journalNumber: string | null;
  postedAt: string | null;
  error: string | null;
}

export interface BalanceCheck {
  checked: boolean;
  expectedClosing: number | null;
  difference: number | null;
  ok: boolean;
  warning: string | null;
}

export interface DraftDetail {
  id: string;
  draftNumber: string;
  status: DraftStatus;
  title: string;
  entryDate: string;
  cashAccountId: string;
  cashAccount: { id: string; accountNumber: string; name: string } | null;
  openingBalance: number | null;
  closingBalance: number | null;
  source: 'manual' | 'aira';
  sourceRef: string | null;
  sourceNote: string | null;
  createdVia: string | null;
  createdBy: { id: string; fullName: string } | null;
  lastError: string | null;
  postedAt: string | null;
  rows: DraftRow[];
  totals: { masuk: number; keluar: number; rowCount: number; activeCount: number };
  needsReviewCount: number;
  duplicateCount: number;
  balance: BalanceCheck;
}

export interface DraftListItem {
  id: string;
  draftNumber: string;
  status: DraftStatus;
  title: string;
  entryDate: string;
  source: 'manual' | 'aira';
  createdVia: string | null;
  cashAccount: { id: string; accountNumber: string; name: string } | null;
  createdBy: { id: string; fullName: string | null };
  rowCount: number;
  totalMasuk: number;
  totalKeluar: number;
  needsReviewCount: number;
  lastError: string | null;
  createdAt: string;
  postedAt: string | null;
}

/** Unsaved changes to one row (keys present = changed). */
export interface RowEdit {
  description?: string;
  amount?: number;
  date?: string;
  txnType?: TxnType;
  accountId?: string | null;
  skip?: boolean;
  reviewed?: boolean;
}

export type RowEdits = Readonly<Record<string, RowEdit>>;

/** Only rows without a journal can still be edited. */
export const isRowLocked = (row: Pick<DraftRow, 'journalEntryId'>): boolean => !!row.journalEntryId;

export const isEditableStatus = (status: DraftStatus): boolean => status === 'Draft' || status === 'PartiallyPosted';

export function typeFitsDirection(type: TxnType, direction: Direction): boolean {
  if (type === 'lainnya') return true;
  if (type === 'pengeluaran' || type === 'uang_muka') return direction === 'keluar';
  return direction === 'masuk';
}

export const isAdvanceType = (t: TxnType): boolean => t === 'uang_muka' || t === 'terima_kasbon';

/** Types selectable for a row's direction. */
export const typesFor = (direction: Direction): TxnType[] => TXN_TYPES.filter((t) => typeFitsDirection(t, direction));

/** Row as the user will see it after the pending edit (mirrors the server rules, for display only). */
export function withEdit(
  row: DraftRow,
  edit: RowEdit | undefined,
  advanceAccountId: string | null,
  labelOf: (id: string) => string | null,
): DraftRow {
  if (!edit) return row;
  const next: DraftRow = { ...row };
  if (edit.description !== undefined) next.description = edit.description;
  if (edit.amount !== undefined) next.amount = edit.amount;
  if (edit.date !== undefined) next.rowDate = edit.date;
  if (edit.skip !== undefined) next.skip = edit.skip;
  if (edit.txnType !== undefined) {
    next.txnType = edit.txnType;
    if (isAdvanceType(edit.txnType)) next.accountId = advanceAccountId;
    else if (isAdvanceType(row.txnType) && edit.accountId === undefined) next.accountId = null;
  }
  if (edit.accountId !== undefined && !isAdvanceType(next.txnType)) next.accountId = edit.accountId;
  if (edit.accountId !== undefined || edit.txnType !== undefined) {
    next.needsReview = !next.accountId;
    next.accountLabel = next.accountId ? labelOf(next.accountId) : null;
    next.userEdited = true;
  }
  if (edit.reviewed) {
    next.needsReview = false;
    next.userEdited = true;
  }
  return next;
}

/** Body items for PUT /:id/rows from the pending edits (empty edits dropped). */
export function toPatches(edits: RowEdits): Array<Record<string, unknown>> {
  return Object.entries(edits)
    .filter(([, e]) => Object.keys(e).length > 0)
    .map(([id, e]) => ({ id, ...e }));
}

/** Merge one more change into the pending edits (immutable). */
export function mergeEdit(edits: RowEdits, rowId: string, change: RowEdit): RowEdits {
  return { ...edits, [rowId]: { ...(edits[rowId] ?? {}), ...change } };
}

export interface LiveTotals {
  masuk: number;
  keluar: number;
  rowCount: number;
  activeCount: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function liveTotals(rows: ReadonlyArray<Pick<DraftRow, 'amount' | 'direction' | 'skip'>>): LiveTotals {
  let masuk = 0;
  let keluar = 0;
  let active = 0;
  for (const r of rows) {
    if (r.skip) continue;
    active += 1;
    if (r.direction === 'masuk') masuk += r.amount;
    else keluar += r.amount;
  }
  return { masuk: round2(masuk), keluar: round2(keluar), rowCount: rows.length, activeCount: active };
}

/** opening + Σmasuk − Σkeluar vs closing; a warning, never a block. */
export function liveBalance(opening: number | null, closing: number | null, totals: Pick<LiveTotals, 'masuk' | 'keluar'>): BalanceCheck {
  if (opening === null || closing === null) return { checked: false, expectedClosing: null, difference: null, ok: true, warning: null };
  const expected = round2(opening + totals.masuk - totals.keluar);
  const diff = round2(closing - expected);
  return { checked: true, expectedClosing: expected, difference: diff, ok: diff === 0, warning: diff === 0 ? null : i18n.t('finance:cashBook.balanceMismatch') };
}

/** Rows still to be posted (not skipped, no journal yet). */
export const pendingRows = (rows: readonly DraftRow[]): DraftRow[] => rows.filter((r) => !r.skip && !r.journalEntryId);

/** Server error body → readable lines (rowErrors when present). */
export function errorLines(err: unknown, fallback: string): string[] {
  const data = (err as { response?: { data?: { error?: unknown; rowErrors?: unknown } } })?.response?.data;
  if (Array.isArray(data?.rowErrors) && data.rowErrors.length > 0) return data.rowErrors.map(String);
  return [typeof data?.error === 'string' && data.error ? data.error : fallback];
}

export const confidencePercent = (c: number): string => `${Math.round(c * 100)}%`;
