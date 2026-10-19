/**
 * Pengajuan Pembayaran (Payment Request) — pure rules: statuses, who may act
 * at which step, the director threshold and the payment journal lines.
 * No database access here, so every rule is unit-tested in isolation
 * (services/__tests__/paymentRequestRules.test.ts); paymentRequestService.ts
 * applies them inside transactions.
 *
 * Flow:
 *   DRAFT ──submit──▶ SUBMITTED (atasan) ──▶ PENDING_FINANCE ──▶ [PENDING_DIRECTOR] ──▶ APPROVED ──pay──▶ PAID
 *          (no active supervisor → straight to PENDING_FINANCE)
 *   Any approval step can REJECT (final) or RETURN (→ REVISION, requester edits & resubmits).
 *   Requester can cancel anything before PAID. Finance can cancel a payment (PAID → APPROVED).
 *   Nobody — not even a super admin — decides on their own request.
 */
import Decimal from 'decimal.js';
import { OUTSTANDING_SETTLEMENT_STATUSES, checkAdvanceFreeOfSettlement } from './paymentRequestSettlementRules';

export const PR_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_FINANCE',
  'PENDING_DIRECTOR',
  'APPROVED',
  'PAID',
  'REJECTED',
  'REVISION',
  'CANCELLED',
] as const;
export type PrStatus = (typeof PR_STATUSES)[number];

export const PR_KINDS = ['REIMBURSEMENT', 'VENDOR_PAYMENT', 'CASH_ADVANCE', 'TRAVEL', 'OTHER'] as const;
export type PrKind = (typeof PR_KINDS)[number];

export const PAYEE_KINDS = ['EMPLOYEE', 'VENDOR'] as const;
export type PayeeKind = (typeof PAYEE_KINDS)[number];

/** ApprovalRule.documentType that drives the director step. */
export const PR_APPROVAL_DOC_TYPE = 'PaymentRequest';
/** RBAC module for finance verification / payment / "Semua" list. */
export const PR_MODULE = 'payment_request';

export const EDITABLE_STATUSES: readonly PrStatus[] = ['DRAFT', 'REVISION'];
export const APPROVAL_STATUSES: readonly PrStatus[] = ['SUBMITTED', 'PENDING_FINANCE', 'PENDING_DIRECTOR'];
export const REQUESTER_CANCELLABLE: readonly PrStatus[] = [
  'DRAFT',
  'REVISION',
  'SUBMITTED',
  'PENDING_FINANCE',
  'PENDING_DIRECTOR',
  'APPROVED',
];
/** Finance may (re)set line accounts while the request is with finance or later, before payment. */
export const FINANCE_VERIFY_STATUSES: readonly PrStatus[] = ['PENDING_FINANCE', 'PENDING_DIRECTOR', 'APPROVED'];

/** Kinds whose payment is an advance to the employee (asset), settled in stage 2. */
const ADVANCE_KINDS: ReadonlySet<string> = new Set<PrKind>(['CASH_ADVANCE', 'TRAVEL']);
export const isAdvanceKind = (kind: string): boolean => ADVANCE_KINDS.has(kind);

export type Check = { ok: true } | { ok: false; error: string };
const ok: Check = { ok: true };
const fail = (error: string): Check => ({ ok: false, error });

export interface Actor {
  id: string;
  role: string;
  isSuperAdmin: boolean;
  /** Has 'payment_request' edit permission (verify / approve as finance / pay). */
  isFinance: boolean;
}

export interface PrRef {
  status: string;
  requesterId: string;
  supervisorId: string | null;
  directorRole: string | null;
  /** Stage 2: set once the advance is paid; settlement supervisor snapshot. */
  settlementStatus?: string | null;
  settlementSupervisorId?: string | null;
}

export const SELF_APPROVAL_ERROR = 'Anda tidak dapat memproses pengajuan Anda sendiri.';
export const STALE_STATUS_ERROR = 'Status pengajuan sudah berubah. Muat ulang halaman lalu coba lagi.';

// Submit

export interface SupervisorRef {
  id: string;
  isActive: boolean;
}

/** First approval stop: the requester's active supervisor, else finance. */
export function resolveSubmitStatus(
  requesterId: string,
  supervisor: SupervisorRef | null | undefined,
): { status: 'SUBMITTED' | 'PENDING_FINANCE'; supervisorId: string | null } {
  if (supervisor && supervisor.isActive && supervisor.id !== requesterId) {
    return { status: 'SUBMITTED', supervisorId: supervisor.id };
  }
  return { status: 'PENDING_FINANCE', supervisorId: null };
}

export function checkEditable(pr: Pick<PrRef, 'status' | 'requesterId'>, actorId: string): Check {
  if (pr.requesterId !== actorId) return fail('Hanya pengaju yang dapat mengubah pengajuan ini.');
  if (!EDITABLE_STATUSES.includes(pr.status as PrStatus)) {
    return fail('Pengajuan hanya bisa diubah saat masih Draf atau Perlu Revisi.');
  }
  return ok;
}

export function checkSubmittable(
  pr: Pick<PrRef, 'status' | 'requesterId'>,
  actorId: string,
  facts: { lineCount: number; totalAmount: number; attachmentCount: number; requiresAttachment: boolean; typeActive: boolean },
): Check {
  const editable = checkEditable(pr, actorId);
  if (!editable.ok) return editable;
  if (!facts.typeActive) return fail('Jenis pengajuan sudah tidak aktif. Pilih jenis lain.');
  if (facts.lineCount < 1) return fail('Tambahkan minimal satu rincian biaya.');
  if (!(facts.totalAmount > 0)) return fail('Total pengajuan harus lebih dari 0.');
  if (facts.requiresAttachment && facts.attachmentCount < 1) {
    return fail('Jenis pengajuan ini wajib melampirkan bukti (nota/kuitansi/tagihan).');
  }
  return ok;
}

// Approval steps

export type ApprovalStep = 'SUPERVISOR' | 'FINANCE' | 'DIRECTOR';

export function stepForStatus(status: string): ApprovalStep | null {
  if (status === 'SUBMITTED') return 'SUPERVISOR';
  if (status === 'PENDING_FINANCE') return 'FINANCE';
  if (status === 'PENDING_DIRECTOR') return 'DIRECTOR';
  return null;
}

/** Can this actor decide (approve / reject / return) at the request's current step? */
export function checkCanDecide(
  pr: PrRef,
  actor: Actor,
): { ok: true; step: ApprovalStep } | { ok: false; error: string } {
  const step = stepForStatus(pr.status);
  if (!step) return { ok: false, error: 'Pengajuan tidak sedang menunggu persetujuan.' };
  if (actor.id === pr.requesterId) return { ok: false, error: SELF_APPROVAL_ERROR };
  if (step === 'SUPERVISOR' && actor.id !== pr.supervisorId) {
    return { ok: false, error: 'Hanya atasan langsung pengaju yang dapat memproses tahap ini.' };
  }
  if (step === 'FINANCE' && !actor.isFinance) {
    return { ok: false, error: 'Hanya Keuangan yang dapat memverifikasi pengajuan ini.' };
  }
  if (step === 'DIRECTOR' && !(actor.isSuperAdmin || (pr.directorRole && actor.role === pr.directorRole))) {
    return { ok: false, error: `Tahap ini harus disetujui oleh peran ${pr.directorRole ?? 'direktur'}.` };
  }
  return { ok: true, step };
}

export interface ApprovalRuleLike {
  minAmount: Decimal.Value | { toString(): string };
  requiredRole: string;
  isActive: boolean;
}

/**
 * Director step: the active 'PaymentRequest' rule with the highest
 * minAmount ≤ total wins; its requiredRole must approve. null = no director step.
 */
export function matchDirectorRule(rules: readonly ApprovalRuleLike[], totalAmount: Decimal.Value): string | null {
  const total = new Decimal(totalAmount);
  let best: { min: Decimal; role: string } | null = null;
  for (const r of rules) {
    if (!r.isActive) continue;
    const min = new Decimal(r.minAmount.toString());
    if (min.lte(total) && (!best || min.gt(best.min))) best = { min, role: r.requiredRole };
  }
  return best?.role ?? null;
}

export function nextStatusAfterApprove(step: ApprovalStep, directorRole: string | null): PrStatus {
  if (step === 'SUPERVISOR') return 'PENDING_FINANCE';
  if (step === 'FINANCE') return directorRole ? 'PENDING_DIRECTOR' : 'APPROVED';
  return 'APPROVED';
}

export function checkReason(reason: string | null | undefined): Check {
  return reason && reason.trim().length >= 3 ? ok : fail('Alasan wajib diisi (minimal 3 karakter).');
}

// Cancel / pay

export function checkRequesterCancel(pr: Pick<PrRef, 'status' | 'requesterId'>, actorId: string): Check {
  if (pr.requesterId !== actorId) return fail('Hanya pengaju yang dapat membatalkan pengajuan ini.');
  if (!REQUESTER_CANCELLABLE.includes(pr.status as PrStatus)) {
    return fail('Pengajuan yang sudah dibayar, ditolak, atau dibatalkan tidak bisa dibatalkan.');
  }
  return ok;
}

export function checkFinanceVerify(pr: Pick<PrRef, 'status' | 'requesterId'>, actor: Actor): Check {
  if (!actor.isFinance) return fail('Hanya Keuangan yang dapat mengatur akun biaya.');
  if (actor.id === pr.requesterId) return fail(SELF_APPROVAL_ERROR);
  if (!FINANCE_VERIFY_STATUSES.includes(pr.status as PrStatus)) {
    return fail('Akun biaya hanya bisa diatur saat pengajuan di tahap Keuangan atau siap dibayar.');
  }
  return ok;
}

export function checkPayable(pr: Pick<PrRef, 'status' | 'requesterId'>, actor: Actor): Check {
  if (!actor.isFinance) return fail('Hanya Keuangan yang dapat membayar pengajuan.');
  if (actor.id === pr.requesterId) return fail(SELF_APPROVAL_ERROR);
  if (pr.status === 'PAID') return fail('Pengajuan ini sudah dibayar.');
  if (pr.status !== 'APPROVED') return fail('Hanya pengajuan berstatus Siap Dibayar yang bisa dibayar.');
  return ok;
}

export function checkCancelPayment(pr: Pick<PrRef, 'status' | 'settlementStatus'>, actor: Actor): Check {
  if (!actor.isFinance) return fail('Hanya Keuangan yang dapat membatalkan pembayaran.');
  if (pr.status !== 'PAID') return fail('Pengajuan ini belum dibayar.');
  return checkAdvanceFreeOfSettlement(pr.settlementStatus);
}

// Amounts & journal

export function computeTotal(lines: ReadonlyArray<{ amount: Decimal.Value }>): Decimal {
  return lines
    .reduce((sum, l) => sum.plus(new Decimal(l.amount)), new Decimal(0))
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export interface PayLineInput {
  description: string;
  amount: Decimal.Value;
  expenseAccountId: string | null;
}

export interface JournalLine {
  accountId: string;
  debit: number;
  credit: number;
  description: string;
}

/**
 * Balanced payment journal:
 *   expense kinds:      DR each line's expense account (grouped per account) / CR cash-bank
 *   CASH_ADVANCE/TRAVEL: DR employee advance (asset, settled in stage 2)      / CR cash-bank
 */
export function buildPaymentJournalLines(input: {
  kind: string;
  lines: readonly PayLineInput[];
  cashAccountId: string;
  advanceAccountId: string | null;
  narration: string;
}): { ok: true; lines: JournalLine[]; total: number } | { ok: false; error: string } {
  if (input.lines.length === 0) return { ok: false, error: 'Pengajuan tidak memiliki rincian biaya.' };
  const total = computeTotal(input.lines);
  if (!total.gt(0)) return { ok: false, error: 'Total pengajuan harus lebih dari 0.' };

  const debits: JournalLine[] = [];
  if (isAdvanceKind(input.kind)) {
    if (!input.advanceAccountId) {
      return {
        ok: false,
        error: 'Akun sistem "Uang Muka Karyawan" belum dipetakan. Atur di Pengaturan → Akun Sistem.',
      };
    }
    debits.push({ accountId: input.advanceAccountId, debit: total.toNumber(), credit: 0, description: input.narration });
  } else {
    const missing = input.lines.findIndex((l) => !l.expenseAccountId);
    if (missing >= 0) {
      return { ok: false, error: `Akun biaya baris ${missing + 1} belum diisi. Keuangan wajib memilih akun sebelum membayar.` };
    }
    const byAccount = new Map<string, { amount: Decimal; descriptions: string[] }>();
    for (const l of input.lines) {
      const key = l.expenseAccountId as string;
      const cur = byAccount.get(key) ?? { amount: new Decimal(0), descriptions: [] };
      byAccount.set(key, { amount: cur.amount.plus(new Decimal(l.amount)), descriptions: [...cur.descriptions, l.description] });
    }
    for (const [accountId, v] of byAccount) {
      debits.push({
        accountId,
        debit: v.amount.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
        credit: 0,
        description: v.descriptions.join('; ').slice(0, 250),
      });
    }
  }
  if (debits.some((d) => d.accountId === input.cashAccountId)) {
    return { ok: false, error: 'Akun kas/bank tidak boleh sama dengan akun biaya.' };
  }
  const lines = [...debits, { accountId: input.cashAccountId, debit: 0, credit: total.toNumber(), description: input.narration }];
  const dr = lines.reduce((s, l) => s.plus(l.debit), new Decimal(0));
  const cr = lines.reduce((s, l) => s.plus(l.credit), new Decimal(0));
  if (!dr.eq(cr)) return { ok: false, error: 'Jurnal tidak seimbang.' };
  return { ok: true, lines, total: total.toNumber() };
}

// Visibility

export const PR_SCOPES = ['mine', 'approvals', 'payable', 'advances', 'all'] as const;
export type PrScope = (typeof PR_SCOPES)[number];

export interface ViewerCtx extends Actor {
  /** Has 'payment_request' view permission ("Semua" tab). */
  canViewAll: boolean;
}

/** May this user open a request? Requester, its supervisor snapshot, finance/viewers, or the director role while it waits. */
export function canViewRequest(pr: PrRef, ctx: ViewerCtx): boolean {
  if (pr.requesterId === ctx.id) return true;
  if (pr.supervisorId && pr.supervisorId === ctx.id) return true;
  if (pr.settlementSupervisorId && pr.settlementSupervisorId === ctx.id) return true;
  if (ctx.canViewAll || ctx.isFinance || ctx.isSuperAdmin) return true;
  return !!pr.directorRole && pr.directorRole === ctx.role;
}

/** Scope part of the list `where` (filters are added by paymentRequestList). null = forbidden. */
export function scopeWhere(scope: PrScope, ctx: ViewerCtx): Record<string, unknown> | null {
  if (scope === 'mine') return { requesterId: ctx.id };
  if (scope === 'all') return ctx.canViewAll ? {} : null;
  if (scope === 'payable') return ctx.isFinance ? { status: 'APPROVED' } : null;
  if (scope === 'advances') {
    // Open advances: everything for finance / "Semua" viewers, otherwise only my own.
    const outstanding = { status: 'PAID', settlementStatus: { in: [...OUTSTANDING_SETTLEMENT_STATUSES] } };
    return ctx.isFinance || ctx.canViewAll || ctx.isSuperAdmin ? outstanding : { ...outstanding, requesterId: ctx.id };
  }
  // approvals: what waits for THIS user's decision (never their own requests) —
  // request approvals and, for PAID advances, settlement approvals.
  const or: Record<string, unknown>[] = [
    { status: 'SUBMITTED', supervisorId: ctx.id },
    { status: 'PAID', settlementStatus: 'SUBMITTED', settlementSupervisorId: ctx.id },
  ];
  if (ctx.isFinance) or.push({ status: 'PENDING_FINANCE' }, { status: 'PAID', settlementStatus: 'PENDING_FINANCE' });
  if (ctx.isSuperAdmin) or.push({ status: 'PENDING_DIRECTOR' });
  else or.push({ status: 'PENDING_DIRECTOR', directorRole: ctx.role });
  return { AND: [{ requesterId: { not: ctx.id } }, { OR: or }] };
}
