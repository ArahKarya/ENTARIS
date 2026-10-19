/**
 * Shared types, labels and helpers for Pengajuan Pembayaran (/payment-requests).
 * Server contract: server/src/routes/paymentRequests.ts.
 */
import api from '@/lib/api';
import i18n from '@/i18n';
import { formatRupiah, toNumber, type NumericInput } from '@/lib/format';

export const PR_ENDPOINT = '/payment-requests';

/** A label map whose values are looked up on every read, so they follow the UI language. */
function lazyLabels<K extends string>(keys: readonly K[], label: (key: K) => string): Readonly<Record<K, string>> {
  return Object.defineProperties(
    {} as Record<K, string>,
    Object.fromEntries(keys.map((k) => [k, { enumerable: true, get: () => label(k) }])),
  );
}

export type PrStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'PENDING_FINANCE'
  | 'PENDING_DIRECTOR'
  | 'APPROVED'
  | 'PAID'
  | 'REJECTED'
  | 'REVISION'
  | 'CANCELLED';

export const PR_STATUSES: readonly PrStatus[] = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_FINANCE',
  'PENDING_DIRECTOR',
  'APPROVED',
  'PAID',
  'REVISION',
  'REJECTED',
  'CANCELLED',
];

export type PrKind = 'REIMBURSEMENT' | 'VENDOR_PAYMENT' | 'CASH_ADVANCE' | 'TRAVEL' | 'OTHER';

const PR_KINDS: readonly PrKind[] = ['REIMBURSEMENT', 'VENDOR_PAYMENT', 'CASH_ADVANCE', 'TRAVEL', 'OTHER'];

export const KIND_LABEL: Readonly<Record<PrKind, string>> = lazyLabels(PR_KINDS, (k) =>
  i18n.t(`finance:paymentRequest.kind.${k}`),
);

export type SettlementStatus = 'OPEN' | 'SUBMITTED' | 'PENDING_FINANCE' | 'REVISION' | 'SETTLED';

/** Advance paid but not yet fully settled. */
export const OUTSTANDING_SETTLEMENT: readonly SettlementStatus[] = ['OPEN', 'SUBMITTED', 'PENDING_FINANCE', 'REVISION'];

export const SETTLEMENT_STATUSES: readonly SettlementStatus[] = ['OPEN', 'SUBMITTED', 'PENDING_FINANCE', 'REVISION', 'SETTLED'];

export type TravelCategory = 'TRANSPORT' | 'LODGING' | 'PER_DIEM' | 'MEALS' | 'OTHER';

export const TRAVEL_CATEGORIES: readonly TravelCategory[] = ['TRANSPORT', 'LODGING', 'PER_DIEM', 'MEALS', 'OTHER'];

export const TRAVEL_CATEGORY_LABEL: Readonly<Record<TravelCategory, string>> = lazyLabels(TRAVEL_CATEGORIES, (c) =>
  i18n.t(`finance:paymentRequest.travelCategory.${c}`),
);

/** Inclusive number of days between two YYYY-MM-DD dates (same day = 1); null when unusable. */
export function tripDays(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null;
  const s = Date.parse(`${String(start).slice(0, 10)}T00:00:00Z`);
  const e = Date.parse(`${String(end).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return null;
  return Math.round((e - s) / 86_400_000) + 1;
}

/** Whole days since an advance was paid (never negative). */
export function advanceAgeDays(paymentDate: string | null | undefined, now: Date = new Date()): number {
  if (!paymentDate) return 0;
  const paid = new Date(paymentDate);
  const a = Date.UTC(paid.getUTCFullYear(), paid.getUTCMonth(), paid.getUTCDate());
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((b - a) / 86_400_000));
}

/** Kinds paid as an employee advance (DR Uang Muka Karyawan), settled via Pertanggungjawaban. */
export const isAdvanceKind = (kind: string | undefined): boolean => kind === 'CASH_ADVANCE' || kind === 'TRAVEL';

export type PrScope = 'mine' | 'approvals' | 'payable' | 'advances' | 'all';

export interface AccountRef {
  id: string;
  accountNumber: string;
  name: string;
}

export interface PaymentRequestType {
  id: string;
  code: string;
  name: string;
  kind: PrKind;
  description: string | null;
  defaultExpenseAccountId: string | null;
  defaultExpenseAccount?: AccountRef | null;
  requiresAttachment: boolean;
  requiresSettlement: boolean;
  isActive: boolean;
  sortOrder: number;
  _count?: { requests: number };
}

export interface PaymentRequestRow {
  id: string;
  number: string;
  status: PrStatus;
  purpose: string;
  payeeKind: 'EMPLOYEE' | 'VENDOR';
  payeeName: string;
  totalAmount: string | number;
  neededBy: string | null;
  createdAt: string;
  submittedAt: string | null;
  paidAt: string | null;
  paymentDate: string | null;
  settlementStatus: SettlementStatus | null;
  settlementDeadline: string | null;
  directorRole: string | null;
  type: { id: string; name: string; kind: PrKind };
  requester: { id: string; fullName: string };
}

export interface PaymentRequestLine {
  id: string;
  lineNo: number;
  description: string;
  amount: string | number;
  expenseAccountId: string | null;
  expenseAccount: AccountRef | null;
  expenseDate: string | null;
  category: TravelCategory | null;
  quantity: string | number | null;
  unitAmount: string | number | null;
}

export interface SettlementLine {
  id: string;
  lineNo: number;
  description: string;
  expenseDate: string | null;
  amount: string | number;
  category: TravelCategory | null;
  plannedLineId: string | null;
  expenseAccountId: string | null;
  expenseAccount: AccountRef | null;
}

export interface PaymentRequestAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  scope: 'REQUEST' | 'SETTLEMENT';
  createdAt: string;
}

export interface PaymentRequestHistory {
  id: string;
  action: string;
  note: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: string;
  actor: { id: string; fullName: string };
}

export interface PaymentRequestActions {
  edit: boolean;
  submit: boolean;
  decide: boolean;
  step: 'SUPERVISOR' | 'FINANCE' | 'DIRECTOR' | null;
  verify: boolean;
  pay: boolean;
  cancel: boolean;
  cancelPayment: boolean;
  viewJournal: boolean;
  settlement: {
    edit: boolean;
    decide: boolean;
    step: 'SUPERVISOR' | 'FINANCE' | null;
    post: boolean;
    cancelPosting: boolean;
  };
}

export interface PaymentRequestDetail {
  id: string;
  number: string;
  status: PrStatus;
  requesterId: string;
  requester: { id: string; fullName: string; email: string };
  supervisor: { id: string; fullName: string } | null;
  type: PaymentRequestType;
  department: string | null;
  payeeKind: 'EMPLOYEE' | 'VENDOR';
  party: { id: string; name: string } | null;
  payeeName: string;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountHolder: string | null;
  purpose: string;
  neededBy: string | null;
  totalAmount: string | number;
  directorRole: string | null;
  lastNote: string | null;
  createdAt: string;
  submittedAt: string | null;
  paidAt: string | null;
  paymentDate: string | null;
  paymentReference: string | null;
  travelDestination: string | null;
  travelStartDate: string | null;
  travelEndDate: string | null;
  travelParticipants: string | null;
  settlementStatus: SettlementStatus | null;
  settlementNote: string | null;
  settlementDeadline: string | null;
  settlementSubmittedAt: string | null;
  settlementLastNote: string | null;
  settlementDate: string | null;
  settlementRealized: string | number | null;
  settlementReference: string | null;
  settledAt: string | null;
  settlementSupervisor: { id: string; fullName: string } | null;
  settlementCashAccount: AccountRef | null;
  settlementJournal: { id: string; entryNumber: string; status: string } | null;
  settlementLines: SettlementLine[];
  /** Set while the advance is paid but not fully settled. */
  advanceAge: { days: number; overdue: boolean; overdueDays: number } | null;
  cashAccount: AccountRef | null;
  paidBy: { id: string; fullName: string } | null;
  journalEntry: { id: string; entryNumber: string; status: string } | null;
  lines: PaymentRequestLine[];
  attachments: PaymentRequestAttachment[];
  history: PaymentRequestHistory[];
  actions: PaymentRequestActions;
}

export interface PaymentRequestMeta {
  me: { id: string; fullName: string; supervisor: { id: string; fullName: string; isActive: boolean } | null } | null;
  role: string;
  isFinance: boolean;
  canViewAll: boolean;
  isSuperAdmin: boolean;
  lastPayee: { bankName: string | null; bankAccountNo: string | null; bankAccountHolder: string | null; department: string | null } | null;
  badges: { approvals: number; payable: number };
  openAdvances: { count: number; amount: number; overdueCount: number; overdueAmount: number; oldestDays: number };
  overdueDays: number;
}

export interface AdvanceSummary {
  count: number;
  amount: number;
  overdueCount: number;
  overdueAmount: number;
  overdueDays: number;
  byEmployee: Array<{ employeeId: string; name: string; count: number; amount: number; overdueCount: number; oldestDays: number }>;
}

export interface SettlementPreviewLine {
  side: 'DR' | 'CR';
  accountId: string | null;
  accountLabel: string | null;
  amount: number;
  description: string;
}

export interface SettlementPreview {
  realized: number;
  advance: number;
  difference: number;
  mode: 'EXACT' | 'RETURN' | 'REIMBURSE';
  cashRequired: boolean;
  lines: SettlementPreviewLine[];
  problems: string[];
}

export interface PaymentRequestSummary {
  count: number;
  totalAmount: number;
  byStatus: Partial<Record<PrStatus, { count: number; amount: number }>>;
  badges: { approvals: number; payable: number };
}

const HISTORY_ACTIONS = [
  'CREATE',
  'UPDATE',
  'SUBMIT',
  'APPROVE',
  'REJECT',
  'RETURN',
  'CANCEL',
  'VERIFY',
  'PAY',
  'CANCEL_PAYMENT',
  'SETTLE_SUBMIT',
  'SETTLE_APPROVE',
  'SETTLE_RETURN',
  'SETTLE_POST',
  'SETTLE_CANCEL',
] as const;

export const HISTORY_LABEL: Readonly<Record<string, string>> = lazyLabels(HISTORY_ACTIONS, (a) =>
  i18n.t(`finance:paymentRequest.history.${a}`),
);

const STEPS = ['SUPERVISOR', 'FINANCE', 'DIRECTOR'] as const;

export const STEP_LABEL: Readonly<Record<(typeof STEPS)[number], string>> = lazyLabels(STEPS, (s) =>
  i18n.t(`finance:paymentRequest.step.${s}`),
);

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const attachmentUrl = (id: string): string =>
  `${(api.defaults.baseURL ?? '/api').replace(/\/+$/, '')}${PR_ENDPOINT}/attachments/${id}`;

/** Rupiah with cents only when the amount has them (requests may carry ",50"). */
export function formatMoney(value: NumericInput, options: { symbol?: boolean } = {}): string {
  const n = toNumber(value) ?? 0;
  return formatRupiah(n, { ...options, decimals: Number.isInteger(Math.round(n * 100) / 100) ? 0 : 2 });
}
