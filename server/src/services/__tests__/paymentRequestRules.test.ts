import { describe, it, expect } from 'vitest';
import {
  SELF_APPROVAL_ERROR,
  buildPaymentJournalLines,
  canViewRequest,
  checkCanDecide,
  checkCancelPayment,
  checkEditable,
  checkFinanceVerify,
  checkPayable,
  checkReason,
  checkRequesterCancel,
  checkSubmittable,
  computeTotal,
  matchDirectorRule,
  nextStatusAfterApprove,
  resolveSubmitStatus,
  scopeWhere,
  type Actor,
  type PrRef,
  type ViewerCtx,
} from '../paymentRequestRules';

const REQ = 'u-requester';
const SUP = 'u-supervisor';
const FIN = 'u-finance';
const DIR = 'u-director';
const ADMIN = 'u-admin';

const actor = (id: string, over: Partial<Actor> = {}): Actor => ({ id, role: 'StaffProduksi', isSuperAdmin: false, isFinance: false, ...over });
const finance = actor(FIN, { role: 'Accountant', isFinance: true });
const director = actor(DIR, { role: 'Direktur' });
const admin = actor(ADMIN, { role: 'Admin', isSuperAdmin: true, isFinance: true });
const pr = (status: string, over: Partial<PrRef> = {}): PrRef => ({ status, requesterId: REQ, supervisorId: SUP, directorRole: null, ...over });

describe('submit', () => {
  it('goes to the active supervisor, else straight to finance', () => {
    expect(resolveSubmitStatus(REQ, { id: SUP, isActive: true })).toEqual({ status: 'SUBMITTED', supervisorId: SUP });
    expect(resolveSubmitStatus(REQ, { id: SUP, isActive: false })).toEqual({ status: 'PENDING_FINANCE', supervisorId: null });
    expect(resolveSubmitStatus(REQ, null)).toEqual({ status: 'PENDING_FINANCE', supervisorId: null });
    // A user set as their own supervisor never approves themselves.
    expect(resolveSubmitStatus(REQ, { id: REQ, isActive: true })).toEqual({ status: 'PENDING_FINANCE', supervisorId: null });
  });

  const facts = { lineCount: 1, totalAmount: 100, attachmentCount: 0, requiresAttachment: false, typeActive: true };
  it('requires lines, a positive total and an attachment when the type demands it', () => {
    expect(checkSubmittable(pr('DRAFT'), REQ, facts).ok).toBe(true);
    expect(checkSubmittable(pr('REVISION'), REQ, facts).ok).toBe(true);
    expect(checkSubmittable(pr('DRAFT'), REQ, { ...facts, lineCount: 0 }).ok).toBe(false);
    expect(checkSubmittable(pr('DRAFT'), REQ, { ...facts, totalAmount: 0 }).ok).toBe(false);
    expect(checkSubmittable(pr('DRAFT'), REQ, { ...facts, requiresAttachment: true }).ok).toBe(false);
    expect(checkSubmittable(pr('DRAFT'), REQ, { ...facts, requiresAttachment: true, attachmentCount: 1 }).ok).toBe(true);
    expect(checkSubmittable(pr('DRAFT'), REQ, { ...facts, typeActive: false }).ok).toBe(false);
  });

  it('only the requester edits/submits, and only while DRAFT or REVISION', () => {
    expect(checkSubmittable(pr('DRAFT'), SUP, facts).ok).toBe(false);
    expect(checkSubmittable(pr('SUBMITTED'), REQ, facts).ok).toBe(false);
    expect(checkEditable(pr('APPROVED'), REQ).ok).toBe(false);
    expect(checkEditable(pr('REVISION'), REQ).ok).toBe(true);
  });
});

describe('approval state machine', () => {
  it('supervisor step: only the snapshotted supervisor', () => {
    expect(checkCanDecide(pr('SUBMITTED'), actor(SUP))).toEqual({ ok: true, step: 'SUPERVISOR' });
    expect(checkCanDecide(pr('SUBMITTED'), finance).ok).toBe(false);
    // Even a super admin is not the supervisor.
    expect(checkCanDecide(pr('SUBMITTED'), admin).ok).toBe(false);
  });

  it('a supervisor cannot act once the request left their step', () => {
    expect(checkCanDecide(pr('PENDING_FINANCE'), actor(SUP)).ok).toBe(false);
    expect(checkCanDecide(pr('APPROVED'), actor(SUP)).ok).toBe(false);
  });

  it('finance step needs the payment_request edit permission', () => {
    expect(checkCanDecide(pr('PENDING_FINANCE'), finance)).toEqual({ ok: true, step: 'FINANCE' });
    expect(checkCanDecide(pr('PENDING_FINANCE'), actor('u-x')).ok).toBe(false);
  });

  it('director step enforces the rule role (or super admin)', () => {
    const p = pr('PENDING_DIRECTOR', { directorRole: 'Direktur' });
    expect(checkCanDecide(p, director)).toEqual({ ok: true, step: 'DIRECTOR' });
    expect(checkCanDecide(p, finance).ok).toBe(false);
    expect(checkCanDecide(p, admin)).toEqual({ ok: true, step: 'DIRECTOR' });
  });

  it('nobody — not even a super admin — decides on their own request', () => {
    for (const status of ['SUBMITTED', 'PENDING_FINANCE', 'PENDING_DIRECTOR']) {
      const own = pr(status, { requesterId: ADMIN, supervisorId: ADMIN, directorRole: 'Admin' });
      expect(checkCanDecide(own, admin)).toEqual({ ok: false, error: SELF_APPROVAL_ERROR });
    }
    expect(checkPayable(pr('APPROVED', { requesterId: FIN }), finance)).toEqual({ ok: false, error: SELF_APPROVAL_ERROR });
    expect(checkFinanceVerify(pr('PENDING_FINANCE', { requesterId: FIN }), finance).ok).toBe(false);
  });

  it('transitions: supervisor → finance → (director) → approved', () => {
    expect(nextStatusAfterApprove('SUPERVISOR', null)).toBe('PENDING_FINANCE');
    expect(nextStatusAfterApprove('FINANCE', null)).toBe('APPROVED');
    expect(nextStatusAfterApprove('FINANCE', 'Direktur')).toBe('PENDING_DIRECTOR');
    expect(nextStatusAfterApprove('DIRECTOR', 'Direktur')).toBe('APPROVED');
  });

  it('non-approval statuses cannot be decided', () => {
    for (const s of ['DRAFT', 'REVISION', 'APPROVED', 'PAID', 'REJECTED', 'CANCELLED']) {
      expect(checkCanDecide(pr(s), finance).ok).toBe(false);
    }
  });

  it('reject / return need a reason', () => {
    expect(checkReason('').ok).toBe(false);
    expect(checkReason('  a ').ok).toBe(false);
    expect(checkReason('Nota tidak jelas').ok).toBe(true);
  });
});

describe('director threshold (ApprovalRule documentType PaymentRequest)', () => {
  const rules = [
    { minAmount: '10000000', requiredRole: 'Manajer', isActive: true },
    { minAmount: '50000000', requiredRole: 'Direktur', isActive: true },
    { minAmount: '1000', requiredRole: 'Ghost', isActive: false },
  ];
  it('highest active rule at or below the total wins', () => {
    expect(matchDirectorRule(rules, 9_999_999)).toBeNull();
    expect(matchDirectorRule(rules, 10_000_000)).toBe('Manajer');
    expect(matchDirectorRule(rules, 75_000_000)).toBe('Direktur');
    expect(matchDirectorRule([], 1e12)).toBeNull();
  });
});

describe('cancel & pay guards', () => {
  it('requester cancels anything before PAID', () => {
    for (const s of ['DRAFT', 'REVISION', 'SUBMITTED', 'PENDING_FINANCE', 'PENDING_DIRECTOR', 'APPROVED']) {
      expect(checkRequesterCancel(pr(s), REQ).ok).toBe(true);
    }
    for (const s of ['PAID', 'REJECTED', 'CANCELLED']) expect(checkRequesterCancel(pr(s), REQ).ok).toBe(false);
    expect(checkRequesterCancel(pr('DRAFT'), SUP).ok).toBe(false);
  });

  it('only finance pays APPROVED requests; already PAID is rejected (idempotent)', () => {
    expect(checkPayable(pr('APPROVED'), finance).ok).toBe(true);
    expect(checkPayable(pr('APPROVED'), actor(SUP)).ok).toBe(false);
    expect(checkPayable(pr('PAID'), finance)).toEqual({ ok: false, error: 'Pengajuan ini sudah dibayar.' });
    expect(checkPayable(pr('PENDING_DIRECTOR'), finance).ok).toBe(false);
    expect(checkCancelPayment(pr('PAID'), finance).ok).toBe(true);
    expect(checkCancelPayment(pr('APPROVED'), finance).ok).toBe(false);
  });
});

describe('payment journal', () => {
  const lines = [
    { description: 'Taksi', amount: '150000.50', expenseAccountId: 'acc-transport' },
    { description: 'Makan', amount: 85000, expenseAccountId: 'acc-meal' },
    { description: 'Parkir', amount: '10000', expenseAccountId: 'acc-transport' },
  ];
  const balanced = (ls: { debit: number; credit: number }[]) =>
    Math.round(ls.reduce((s, l) => s + l.debit - l.credit, 0) * 100) === 0;

  it('expense kinds: DR per expense account (grouped) / CR cash, balanced', () => {
    const out = buildPaymentJournalLines({ kind: 'REIMBURSEMENT', lines, cashAccountId: 'acc-cash', advanceAccountId: 'acc-adv', narration: 'PP' });
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.total).toBe(245000.5);
    expect(out.lines).toEqual([
      { accountId: 'acc-transport', debit: 160000.5, credit: 0, description: 'Taksi; Parkir' },
      { accountId: 'acc-meal', debit: 85000, credit: 0, description: 'Makan' },
      { accountId: 'acc-cash', debit: 0, credit: 245000.5, description: 'PP' },
    ]);
    expect(balanced(out.lines)).toBe(true);
  });

  it('CASH_ADVANCE and TRAVEL debit the employee advance account', () => {
    for (const kind of ['CASH_ADVANCE', 'TRAVEL']) {
      const out = buildPaymentJournalLines({
        kind,
        lines: [{ description: 'Uang muka', amount: 2_000_000, expenseAccountId: null }],
        cashAccountId: 'acc-cash',
        advanceAccountId: 'acc-adv',
        narration: 'PP',
      });
      expect(out.ok && out.lines.map((l) => [l.accountId, l.debit, l.credit])).toEqual([
        ['acc-adv', 2_000_000, 0],
        ['acc-cash', 0, 2_000_000],
      ]);
    }
  });

  it('refuses missing expense accounts, unmapped advance account, cash = expense', () => {
    const missing = buildPaymentJournalLines({
      kind: 'OTHER',
      lines: [{ description: 'x', amount: 1, expenseAccountId: null }],
      cashAccountId: 'c',
      advanceAccountId: null,
      narration: 'n',
    });
    expect(missing.ok).toBe(false);
    const noAdv = buildPaymentJournalLines({ kind: 'TRAVEL', lines: [{ description: 'x', amount: 1, expenseAccountId: null }], cashAccountId: 'c', advanceAccountId: null, narration: 'n' });
    expect(noAdv.ok).toBe(false);
    const same = buildPaymentJournalLines({ kind: 'OTHER', lines: [{ description: 'x', amount: 1, expenseAccountId: 'c' }], cashAccountId: 'c', advanceAccountId: null, narration: 'n' });
    expect(same.ok).toBe(false);
    expect(buildPaymentJournalLines({ kind: 'OTHER', lines: [], cashAccountId: 'c', advanceAccountId: null, narration: 'n' }).ok).toBe(false);
  });

  it('computeTotal rounds to 2 decimals without float drift', () => {
    expect(computeTotal([{ amount: 0.1 }, { amount: 0.2 }]).toNumber()).toBe(0.3);
  });
});

describe('visibility', () => {
  const ctx = (id: string, over: Partial<ViewerCtx> = {}): ViewerCtx => ({ ...actor(id), canViewAll: false, ...over });

  it('requester, supervisor snapshot, finance/viewers and the waiting director role may open', () => {
    const p = pr('PENDING_DIRECTOR', { directorRole: 'Direktur' });
    expect(canViewRequest(p, ctx(REQ))).toBe(true);
    expect(canViewRequest(p, ctx(SUP))).toBe(true);
    expect(canViewRequest(p, ctx(FIN, { isFinance: true }))).toBe(true);
    expect(canViewRequest(p, ctx('u-viewer', { canViewAll: true }))).toBe(true);
    expect(canViewRequest(p, ctx(DIR, { role: 'Direktur' }))).toBe(true);
    expect(canViewRequest(p, ctx('u-other'))).toBe(false);
  });

  it('scopes: mine = own; all needs view; payable needs finance; approvals excludes own requests', () => {
    expect(scopeWhere('mine', ctx(REQ))).toEqual({ requesterId: REQ });
    expect(scopeWhere('all', ctx(REQ))).toBeNull();
    expect(scopeWhere('all', ctx(REQ, { canViewAll: true }))).toEqual({});
    expect(scopeWhere('payable', ctx(REQ))).toBeNull();
    expect(scopeWhere('payable', ctx(FIN, { isFinance: true }))).toEqual({ status: 'APPROVED' });
    expect(scopeWhere('approvals', ctx(SUP))).toEqual({
      AND: [
        { requesterId: { not: SUP } },
        { OR: [{ status: 'SUBMITTED', supervisorId: SUP }, { status: 'PENDING_DIRECTOR', directorRole: 'StaffProduksi' }] },
      ],
    });
    const fin = scopeWhere('approvals', ctx(FIN, { isFinance: true, role: 'Accountant' })) as { AND: [unknown, { OR: unknown[] }] };
    expect(fin.AND[1].OR).toContainEqual({ status: 'PENDING_FINANCE' });
  });
});
