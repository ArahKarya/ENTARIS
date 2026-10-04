/**
 * Shared types, labels and helpers for Pengajuan Pembayaran (/payment-requests).
 * Server contract: server/src/routes/paymentRequests.ts.
 */
import api from '@/lib/api';
import { formatRupiah, toNumber, type NumericInput } from '@/lib/format';

export const PR_ENDPOINT = '/payment-requests';

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

export const KIND_LABEL: Record<PrKind, string> = {
  REIMBURSEMENT: 'Reimbursement',
  VENDOR_PAYMENT: 'Pembayaran vendor',
  CASH_ADVANCE: 'Uang muka',
  TRAVEL: 'Perjalanan dinas',
  OTHER: 'Lainnya',
};

/** Kinds paid as an employee advance (DR Uang Muka Karyawan), settled in stage 2. */
export const isAdvanceKind = (kind: string | undefined): boolean => kind === 'CASH_ADVANCE' || kind === 'TRAVEL';

export type PrScope = 'mine' | 'approvals' | 'payable' | 'all';

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
}

export interface PaymentRequestAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
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
  settlementStatus: string | null;
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
}

export interface PaymentRequestSummary {
  count: number;
  totalAmount: number;
  byStatus: Partial<Record<PrStatus, { count: number; amount: number }>>;
  badges: { approvals: number; payable: number };
}

export const HISTORY_LABEL: Record<string, string> = {
  CREATE: 'Dibuat',
  UPDATE: 'Diubah',
  SUBMIT: 'Diajukan',
  APPROVE: 'Disetujui',
  REJECT: 'Ditolak',
  RETURN: 'Dikembalikan untuk revisi',
  CANCEL: 'Dibatalkan',
  VERIFY: 'Akun biaya diverifikasi',
  PAY: 'Dibayar',
  CANCEL_PAYMENT: 'Pembayaran dibatalkan',
};

export const STEP_LABEL: Record<'SUPERVISOR' | 'FINANCE' | 'DIRECTOR', string> = {
  SUPERVISOR: 'atasan langsung',
  FINANCE: 'Keuangan',
  DIRECTOR: 'Direktur',
};

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
