/**
 * Pengajuan Pembayaran — transactional operations. Every transition:
 *   1. loads the request and checks the actor with paymentRequestRules,
 *   2. claims the status with an optimistic `updateMany where status IN (...)`
 *      (a concurrent decision makes count 0 → STALE_STATUS_ERROR),
 *   3. writes a history row, and
 *   4. returns notification events the route dispatches AFTER commit.
 *
 * Payment posts one balanced journal (see buildPaymentJournalLines) through
 * the open-fiscal-year guard; cancelling the payment voids that journal the
 * same way gaFinance does (balances reversed, ledger rows flagged).
 */
import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { updateBalancesForItems } from '../utils/accountBalance';
import { BusinessError } from '../utils/errors';
import { PaymentRequestInputSchema } from '../utils/schemas';
import { cancelJournalInTx } from './gaFinance';
import {
  PR_APPROVAL_DOC_TYPE,
  STALE_STATUS_ERROR,
  buildPaymentJournalLines,
  checkCanDecide,
  checkCancelPayment,
  checkEditable,
  checkFinanceVerify,
  checkPayable,
  checkReason,
  checkRequesterCancel,
  checkSubmittable,
  computeTotal,
  isAdvanceKind,
  matchDirectorRule,
  nextStatusAfterApprove,
  resolveSubmitStatus,
  type Actor,
  type Check,
  type PrStatus,
} from './paymentRequestRules';

type Tx = Prisma.TransactionClient;
export type PaymentRequestInput = z.infer<typeof PaymentRequestInputSchema>;

export class NotFoundError extends Error {}

export type PrEventKind =
  | 'pending_supervisor'
  | 'pending_finance'
  | 'pending_director'
  | 'approved'
  | 'rejected'
  | 'revision'
  | 'paid'
  | 'payment_cancelled'
  | 'cancelled';

export interface PrEvent {
  kind: PrEventKind;
  requestId: string;
  number: string;
  requesterId: string;
  supervisorId: string | null;
  directorRole: string | null;
  actorId: string;
  amount: number;
  note?: string | null;
}

const assertOk = (check: Check): void => {
  if (!check.ok) throw new BusinessError(check.error);
};

async function loadRequest(tx: Tx, id: string) {
  const pr = await tx.paymentRequest.findUnique({ where: { id }, include: { type: true } });
  if (!pr) throw new NotFoundError('Pengajuan tidak ditemukan.');
  return pr;
}

async function claimStatus(tx: Tx, id: string, from: readonly string[], data: Prisma.PaymentRequestUncheckedUpdateManyInput) {
  const res = await tx.paymentRequest.updateMany({ where: { id, status: { in: [...from] } }, data });
  if (res.count !== 1) throw new BusinessError(STALE_STATUS_ERROR);
}

async function addHistory(
  tx: Tx,
  input: { requestId: string; action: string; actorId: string; fromStatus?: string | null; toStatus?: string | null; note?: string | null },
) {
  await tx.paymentRequestHistory.create({
    data: {
      paymentRequestId: input.requestId,
      action: input.action,
      actorId: input.actorId,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus ?? null,
      note: input.note ?? null,
    },
  });
}

function eventOf(
  pr: { id: string; number: string; requesterId: string; supervisorId: string | null; directorRole: string | null; totalAmount: Decimal.Value | { toString(): string } },
  kind: PrEventKind,
  actorId: string,
  note?: string | null,
): PrEvent {
  return {
    kind,
    requestId: pr.id,
    number: pr.number,
    requesterId: pr.requesterId,
    supervisorId: pr.supervisorId,
    directorRole: pr.directorRole,
    actorId,
    amount: new Decimal(pr.totalAmount.toString()).toNumber(),
    note: note ?? null,
  };
}

const toDay = (d: string | null | undefined): Date | null => (d ? new Date(`${d}T00:00:00.000Z`) : null);

async function assertDetailAccount(tx: Tx, accountId: string, label: string) {
  const acc = await tx.account.findUnique({
    where: { id: accountId },
    select: { id: true, isGroup: true, isActive: true, accountNumber: true, accountType: true, name: true },
  });
  if (!acc || acc.isGroup || !acc.isActive) throw new BusinessError(`${label} tidak valid (harus akun detail yang aktif).`);
  return acc;
}

// ─── Draft create / update ───────────────────────────────────────────────────

async function normalizeInput(tx: Tx, input: PaymentRequestInput) {
  const type = await tx.paymentRequestType.findUnique({ where: { id: input.typeId } });
  if (!type || !type.isActive) throw new BusinessError('Jenis pengajuan tidak ditemukan atau tidak aktif.');
  let partyId: string | null = null;
  if (input.payeeKind === 'VENDOR') {
    if (!input.partyId) throw new BusinessError('Pilih vendor penerima pembayaran.');
    const party = await tx.party.findUnique({ where: { id: input.partyId }, select: { id: true } });
    if (!party) throw new BusinessError('Vendor tidak ditemukan.');
    partyId = party.id;
  }
  if (input.costCenterId) {
    const cc = await tx.gaCostCenter.findUnique({ where: { id: input.costCenterId }, select: { id: true } });
    if (!cc) throw new BusinessError('Cost center tidak ditemukan.');
  }
  for (const [i, l] of input.lines.entries()) {
    if (l.expenseAccountId) await assertDetailAccount(tx, l.expenseAccountId, `Akun biaya baris ${i + 1}`);
  }
  const header = {
    typeId: type.id,
    costCenterId: input.costCenterId ?? null,
    department: input.department || null,
    payeeKind: input.payeeKind,
    partyId,
    payeeName: input.payeeName.trim(),
    bankName: input.bankName || null,
    bankAccountNo: input.bankAccountNo || null,
    bankAccountHolder: input.bankAccountHolder || null,
    purpose: input.purpose.trim(),
    neededBy: toDay(input.neededBy),
    totalAmount: computeTotal(input.lines).toFixed(2),
  };
  const lines = input.lines.map((l, i) => ({
    lineNo: i + 1,
    description: l.description.trim(),
    amount: new Decimal(l.amount).toFixed(2),
    expenseAccountId: l.expenseAccountId ?? type.defaultExpenseAccountId ?? null,
    costCenterId: l.costCenterId ?? null,
    expenseDate: toDay(l.expenseDate),
  }));
  return { header, lines };
}

export async function createPaymentRequestInTx(tx: Tx, actor: Actor, input: PaymentRequestInput) {
  const { header, lines } = await normalizeInput(tx, input);
  const now = new Date();
  const number = await generateDocumentNumber(tx, 'PP', now, '');
  const pr = await tx.paymentRequest.create({
    data: { ...header, number, requesterId: actor.id, status: 'DRAFT', lines: { create: lines } },
  });
  await addHistory(tx, { requestId: pr.id, action: 'CREATE', actorId: actor.id, toStatus: 'DRAFT' });
  return pr;
}

export async function updatePaymentRequestInTx(tx: Tx, id: string, actor: Actor, input: PaymentRequestInput) {
  const pr = await loadRequest(tx, id);
  assertOk(checkEditable(pr, actor.id));
  const { header, lines } = await normalizeInput(tx, input);
  await claimStatus(tx, id, [pr.status], header);
  await tx.paymentRequestLine.deleteMany({ where: { paymentRequestId: id } });
  await tx.paymentRequestLine.createMany({ data: lines.map((l) => ({ ...l, paymentRequestId: id })) });
  await addHistory(tx, { requestId: id, action: 'UPDATE', actorId: actor.id, fromStatus: pr.status, toStatus: pr.status });
  return tx.paymentRequest.findUniqueOrThrow({ where: { id } });
}

// ─── Submit / decide / cancel ────────────────────────────────────────────────

export async function submitPaymentRequestInTx(tx: Tx, id: string, actor: Actor) {
  const pr = await loadRequest(tx, id);
  const [lineCount, attachmentCount, requester] = await Promise.all([
    tx.paymentRequestLine.count({ where: { paymentRequestId: id } }),
    tx.paymentRequestAttachment.count({ where: { paymentRequestId: id } }),
    tx.user.findUnique({ where: { id: pr.requesterId }, select: { supervisor: { select: { id: true, isActive: true } } } }),
  ]);
  assertOk(
    checkSubmittable(pr, actor.id, {
      lineCount,
      totalAmount: Number(pr.totalAmount),
      attachmentCount,
      requiresAttachment: pr.type.requiresAttachment,
      typeActive: pr.type.isActive,
    }),
  );
  const target = resolveSubmitStatus(pr.requesterId, requester?.supervisor ?? null);
  const now = new Date();
  await claimStatus(tx, id, [pr.status], {
    status: target.status,
    supervisorId: target.supervisorId,
    directorRole: null,
    submittedAt: now,
    supervisorApprovedAt: null,
    financeApprovedAt: null,
    financeApprovedBy: null,
    directorApprovedAt: null,
    directorApprovedBy: null,
    lastNote: null,
  });
  await addHistory(tx, { requestId: id, action: 'SUBMIT', actorId: actor.id, fromStatus: pr.status, toStatus: target.status });
  const updated = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  return { request: updated, events: [eventOf(updated, target.status === 'SUBMITTED' ? 'pending_supervisor' : 'pending_finance', actor.id)] };
}

async function applyLineAccounts(
  tx: Tx,
  requestId: string,
  lineAccounts: ReadonlyArray<{ id: string; expenseAccountId: string | null }>,
) {
  for (const la of lineAccounts) {
    if (la.expenseAccountId) await assertDetailAccount(tx, la.expenseAccountId, 'Akun biaya');
    const res = await tx.paymentRequestLine.updateMany({
      where: { id: la.id, paymentRequestId: requestId },
      data: { expenseAccountId: la.expenseAccountId },
    });
    if (res.count !== 1) throw new BusinessError('Baris rincian tidak ditemukan pada pengajuan ini.');
  }
}

export async function approvePaymentRequestInTx(
  tx: Tx,
  id: string,
  actor: Actor,
  input: { note?: string | null; lineAccounts?: ReadonlyArray<{ id: string; expenseAccountId: string | null }> },
) {
  const pr = await loadRequest(tx, id);
  const decide = checkCanDecide(pr, actor);
  if (!decide.ok) throw new BusinessError(decide.error);
  const now = new Date();

  let directorRole: string | null = pr.directorRole;
  const data: Prisma.PaymentRequestUncheckedUpdateManyInput = { lastNote: input.note || null };
  if (decide.step === 'SUPERVISOR') {
    data.supervisorApprovedAt = now;
  } else if (decide.step === 'FINANCE') {
    if (input.lineAccounts?.length) await applyLineAccounts(tx, id, input.lineAccounts);
    const rules = await tx.approvalRule.findMany({
      where: { documentType: PR_APPROVAL_DOC_TYPE, isActive: true },
      select: { minAmount: true, requiredRole: true, isActive: true },
    });
    directorRole = matchDirectorRule(rules, pr.totalAmount.toString());
    Object.assign(data, { financeApprovedAt: now, financeApprovedBy: actor.id, directorRole });
  } else {
    Object.assign(data, { directorApprovedAt: now, directorApprovedBy: actor.id });
  }
  const next = nextStatusAfterApprove(decide.step, directorRole);
  if (next === 'APPROVED') data.approvedAt = now;
  await claimStatus(tx, id, [pr.status], { ...data, status: next });
  await addHistory(tx, { requestId: id, action: 'APPROVE', actorId: actor.id, fromStatus: pr.status, toStatus: next, note: input.note });

  const updated = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  const nextEvent: PrEventKind = next === 'PENDING_FINANCE' ? 'pending_finance' : next === 'PENDING_DIRECTOR' ? 'pending_director' : 'approved';
  return { request: updated, events: [eventOf(updated, nextEvent, actor.id, input.note)] };
}

/** Reject (final) or return for revision — same eligibility as approving. */
export async function declinePaymentRequestInTx(tx: Tx, id: string, actor: Actor, mode: 'REJECT' | 'RETURN', reason: string) {
  assertOk(checkReason(reason));
  const pr = await loadRequest(tx, id);
  const decide = checkCanDecide(pr, actor);
  if (!decide.ok) throw new BusinessError(decide.error);
  const now = new Date();
  const to: PrStatus = mode === 'REJECT' ? 'REJECTED' : 'REVISION';
  await claimStatus(tx, id, [pr.status], {
    status: to,
    lastNote: reason.trim(),
    ...(mode === 'REJECT' ? { rejectedAt: now } : {}),
  });
  await addHistory(tx, { requestId: id, action: mode, actorId: actor.id, fromStatus: pr.status, toStatus: to, note: reason.trim() });
  const updated = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  return { request: updated, events: [eventOf(updated, mode === 'REJECT' ? 'rejected' : 'revision', actor.id, reason.trim())] };
}

export async function cancelPaymentRequestInTx(tx: Tx, id: string, actor: Actor, reason?: string | null) {
  const pr = await loadRequest(tx, id);
  assertOk(checkRequesterCancel(pr, actor.id));
  await claimStatus(tx, id, [pr.status], { status: 'CANCELLED', cancelledAt: new Date(), lastNote: reason || null });
  await addHistory(tx, { requestId: id, action: 'CANCEL', actorId: actor.id, fromStatus: pr.status, toStatus: 'CANCELLED', note: reason });
  const updated = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  // Only approvers who already saw it need to know (not for drafts).
  const events = pr.status === 'DRAFT' || pr.status === 'REVISION' ? [] : [eventOf(updated, 'cancelled', actor.id, reason)];
  return { request: updated, events };
}

export async function verifyPaymentRequestAccountsInTx(
  tx: Tx,
  id: string,
  actor: Actor,
  lineAccounts: ReadonlyArray<{ id: string; expenseAccountId: string | null }>,
) {
  const pr = await loadRequest(tx, id);
  assertOk(checkFinanceVerify(pr, actor));
  await applyLineAccounts(tx, id, lineAccounts);
  await claimStatus(tx, id, [pr.status], { updatedAt: new Date() });
  await addHistory(tx, { requestId: id, action: 'VERIFY', actorId: actor.id, fromStatus: pr.status, toStatus: pr.status, note: 'Akun biaya diperbarui' });
  return tx.paymentRequest.findUniqueOrThrow({ where: { id } });
}

// ─── Pay / cancel payment ────────────────────────────────────────────────────

async function resolveAdvanceAccountId(tx: Tx): Promise<string | null> {
  const mapping = await tx.systemAccountMapping.findFirst({
    where: { role: 'EMPLOYEE_ADVANCE' },
    orderBy: { sortOrder: 'asc' },
    select: { accountId: true },
  });
  return mapping?.accountId ?? null;
}

async function assertCashAccount(tx: Tx, accountId: string) {
  const acc = await assertDetailAccount(tx, accountId, 'Akun kas/bank');
  const isCashMapped = (await tx.systemAccountMapping.count({ where: { role: 'CASH', accountId } })) > 0;
  if (acc.accountType !== 'ASSET' || !(isCashMapped || acc.accountNumber.startsWith('1.1'))) {
    throw new BusinessError('Akun sumber dana harus akun kas/bank (1.1.x).');
  }
  return acc;
}

export async function payPaymentRequestInTx(
  tx: Tx,
  id: string,
  actor: Actor,
  input: { cashAccountId: string; paymentDate: string; reference?: string | null },
) {
  const pr = await loadRequest(tx, id);
  assertOk(checkPayable(pr, actor));
  await assertCashAccount(tx, input.cashAccountId);
  const lines = await tx.paymentRequestLine.findMany({ where: { paymentRequestId: id }, orderBy: { lineNo: 'asc' } });
  const narration = `Pembayaran ${pr.number} — ${pr.purpose}`.slice(0, 250);
  const built = buildPaymentJournalLines({
    kind: pr.type.kind,
    lines: lines.map((l) => ({ description: l.description, amount: l.amount.toString(), expenseAccountId: l.expenseAccountId })),
    cashAccountId: input.cashAccountId,
    advanceAccountId: isAdvanceKind(pr.type.kind) ? await resolveAdvanceAccountId(tx) : null,
    narration,
  });
  if (!built.ok) throw new BusinessError(built.error);
  if (!new Decimal(built.total).eq(new Decimal(pr.totalAmount.toString()))) {
    throw new BusinessError('Total rincian tidak sama dengan total pengajuan. Muat ulang halaman.');
  }

  const date = new Date(`${input.paymentDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new BusinessError('Tanggal bayar tidak valid.');
  const fiscalYear = await getOpenFiscalYear(tx, date); // closed period → BusinessError

  // Claim first: a concurrent second "Bayar" waits on the row lock, then sees PAID.
  const now = new Date();
  await claimStatus(tx, id, ['APPROVED'], {
    status: 'PAID',
    paidAt: now,
    paidById: actor.id,
    paymentDate: date,
    cashAccountId: input.cashAccountId,
    paymentReference: input.reference || null,
    settlementStatus: isAdvanceKind(pr.type.kind) ? 'OPEN' : null,
  });

  const entryNumber = await generateDocumentNumber(tx, 'JV', date, fiscalYear.id);
  const journal = await tx.journalEntry.create({
    data: {
      entryNumber,
      date,
      narration,
      status: 'Submitted',
      fiscalYearId: fiscalYear.id,
      createdBy: actor.id,
      submittedAt: now,
      items: { create: built.lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: l.description })) },
    },
    include: { items: true },
  });
  await tx.accountingLedgerEntry.createMany({
    data: journal.items.map((item) => ({
      date,
      accountId: item.accountId,
      debit: item.debit,
      credit: item.credit,
      referenceType: 'JournalEntry',
      referenceId: journal.id,
      description: item.description ?? narration,
      fiscalYearId: fiscalYear.id,
    })),
  });
  await updateBalancesForItems(
    tx,
    journal.items.map((i) => ({ accountId: i.accountId, debit: Number(i.debit), credit: Number(i.credit) })),
  );
  await tx.paymentRequest.update({ where: { id }, data: { journalEntryId: journal.id } });
  await addHistory(tx, {
    requestId: id,
    action: 'PAY',
    actorId: actor.id,
    fromStatus: 'APPROVED',
    toStatus: 'PAID',
    note: `${journal.entryNumber}${input.reference ? ` · Ref ${input.reference}` : ''}`,
  });
  const updated = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  return { request: updated, journal, events: [eventOf(updated, 'paid', actor.id)] };
}

export async function cancelPaymentRequestPaymentInTx(tx: Tx, id: string, actor: Actor, reason: string) {
  assertOk(checkReason(reason));
  const pr = await loadRequest(tx, id);
  assertOk(checkCancelPayment(pr, actor));
  if (pr.settlementStatus === 'SETTLED') {
    throw new BusinessError('Uang muka sudah dipertanggungjawabkan; batalkan pertanggungjawaban terlebih dahulu.');
  }
  if (pr.journalEntryId) {
    const je = await tx.journalEntry.findUnique({ where: { id: pr.journalEntryId }, select: { fiscalYear: { select: { isClosed: true } } } });
    if (je?.fiscalYear.isClosed) throw new BusinessError('Tahun buku jurnal pembayaran sudah ditutup; pembayaran tidak bisa dibatalkan.');
  }
  await claimStatus(tx, id, ['PAID'], {
    status: 'APPROVED',
    paidAt: null,
    paidById: null,
    paymentDate: null,
    cashAccountId: null,
    paymentReference: null,
    settlementStatus: null,
    lastNote: reason.trim(),
  });
  if (pr.journalEntryId) {
    await cancelJournalInTx(tx, pr.journalEntryId);
    await tx.paymentRequest.update({ where: { id }, data: { journalEntryId: null } });
  }
  await addHistory(tx, { requestId: id, action: 'CANCEL_PAYMENT', actorId: actor.id, fromStatus: 'PAID', toStatus: 'APPROVED', note: reason.trim() });
  const updated = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  return { request: updated, events: [eventOf(updated, 'payment_cancelled', actor.id, reason.trim())] };
}
