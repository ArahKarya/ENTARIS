/**
 * Pertanggungjawaban uang muka / perjalanan dinas — transactional operations
 * (stage 2), in the same style as paymentRequestService: load → check with the
 * pure rules → optimistic claim (`updateMany where settlementStatus IN (...)`,
 * a concurrent decision makes count 0 → STALE_STATUS_ERROR) → history row →
 * notification events returned for the route to dispatch after commit.
 *
 * Posting (finance step) writes ONE balanced journal on the settlement date
 * through the open-fiscal-year guard; cancelling the posting voids it.
 */
import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { BusinessError } from '../utils/errors';
import type { PaymentRequestSettlementDraftSchema } from '../utils/schemas';
import { cancelJournalInTx } from './gaFinance';
import {
  assertCashAccount,
  assertDetailAccount,
  addHistory,
  eventOf,
  loadRequest,
  postJournalInTx,
  resolveAdvanceAccountId,
  type PrEvent,
} from './paymentRequestService';
import {
  buildSettlementJournalLines,
  checkCancelSettlementPosting,
  checkSettlementDecide,
  checkSettlementEditable,
  checkSettlementSubmittable,
  previewSettlementJournal,
  type SettlementPreview,
} from './paymentRequestSettlementRules';
import { STALE_STATUS_ERROR, checkReason, computeTotal, resolveSubmitStatus, type Actor, type Check } from './paymentRequestRules';

type Tx = Prisma.TransactionClient;
export type SettlementDraftInput = z.infer<typeof PaymentRequestSettlementDraftSchema>;
type LineAccounts = ReadonlyArray<{ id: string; expenseAccountId: string | null }>;

const assertOk = (check: Check): void => {
  if (!check.ok) throw new BusinessError(check.error);
};

const toDay = (d: string | null | undefined): Date | null => (d ? new Date(`${d}T00:00:00.000Z`) : null);

/** Claim the settlement status of a PAID request; a concurrent change → stale error. */
async function claimSettlement(tx: Tx, id: string, from: readonly string[], data: Prisma.PaymentRequestUncheckedUpdateManyInput) {
  const res = await tx.paymentRequest.updateMany({ where: { id, status: 'PAID', settlementStatus: { in: [...from] } }, data });
  if (res.count !== 1) throw new BusinessError(STALE_STATUS_ERROR);
}

const settlementEvent = (
  pr: Parameters<typeof eventOf>[0] & { settlementSupervisorId: string | null; settlementRealized?: Decimal.Value | { toString(): string } | null },
  kind: PrEvent['kind'],
  actorId: string,
  note?: string | null,
): PrEvent => {
  const realized = pr.settlementRealized ? new Decimal(pr.settlementRealized.toString()).toNumber() : undefined;
  return { ...eventOf(pr, kind, actorId, note, realized), supervisorId: pr.settlementSupervisorId };
};

// Requester: save draft / submit

export async function saveSettlementDraftInTx(tx: Tx, id: string, actor: Actor, input: SettlementDraftInput) {
  const pr = await loadRequest(tx, id);
  assertOk(checkSettlementEditable(pr, actor.id));
  const planned = await tx.paymentRequestLine.findMany({ where: { paymentRequestId: id }, select: { id: true, expenseAccountId: true } });
  const plannedById = new Map(planned.map((p) => [p.id, p]));
  for (const [i, l] of input.lines.entries()) {
    if (l.plannedLineId && !plannedById.has(l.plannedLineId)) throw new BusinessError(`Baris realisasi ${i + 1}: baris rencana tidak ditemukan.`);
    if (l.expenseAccountId) await assertDetailAccount(tx, l.expenseAccountId, `Akun biaya baris ${i + 1}`);
  }
  const deadline = toDay(input.deadline);
  if (deadline && pr.paymentDate && deadline < pr.paymentDate) throw new BusinessError('Batas waktu tidak boleh sebelum tanggal pembayaran uang muka.');

  await claimSettlement(tx, id, [pr.settlementStatus as string], {
    settlementNote: input.note?.trim() || null,
    settlementDeadline: deadline,
  });
  await tx.paymentRequestSettlementLine.deleteMany({ where: { paymentRequestId: id } });
  await tx.paymentRequestSettlementLine.createMany({
    data: input.lines.map((l, i) => ({
      paymentRequestId: id,
      lineNo: i + 1,
      description: l.description.trim(),
      expenseDate: toDay(l.expenseDate),
      amount: new Decimal(l.amount).toFixed(2),
      category: l.category ?? null,
      plannedLineId: l.plannedLineId ?? null,
      // Default account: the one chosen by the requester/finance, else the planned line's, else the type default.
      expenseAccountId:
        l.expenseAccountId ?? (l.plannedLineId ? plannedById.get(l.plannedLineId)?.expenseAccountId : null) ?? pr.type.defaultExpenseAccountId ?? null,
    })),
  });
  return tx.paymentRequest.findUniqueOrThrow({ where: { id } });
}

export async function submitSettlementInTx(tx: Tx, id: string, actor: Actor) {
  const pr = await loadRequest(tx, id);
  const [lines, requester] = await Promise.all([
    tx.paymentRequestSettlementLine.findMany({ where: { paymentRequestId: id }, select: { amount: true } }),
    tx.user.findUnique({ where: { id: pr.requesterId }, select: { supervisor: { select: { id: true, isActive: true } } } }),
  ]);
  const realized = computeTotal(lines.map((l) => ({ amount: l.amount.toString() })));
  assertOk(checkSettlementSubmittable(pr, actor.id, { lineCount: lines.length, totalAmount: realized.toNumber() }));

  const target = resolveSubmitStatus(pr.requesterId, requester?.supervisor ?? null);
  await claimSettlement(tx, id, [pr.settlementStatus as string], {
    settlementStatus: target.status,
    settlementSupervisorId: target.supervisorId,
    settlementSubmittedAt: new Date(),
    settlementSupervisorApprovedAt: null,
    settlementLastNote: null,
    settlementRealized: realized.toFixed(2),
  });
  await addHistory(tx, { requestId: id, action: 'SETTLE_SUBMIT', actorId: actor.id, fromStatus: pr.settlementStatus, toStatus: target.status });
  const updated = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  const kind = target.status === 'SUBMITTED' ? 'settlement_pending_supervisor' : 'settlement_pending_finance';
  return { request: updated, events: [settlementEvent(updated, kind, actor.id)] };
}

// Supervisor / finance: approve, return

/** Supervisor step: approve → Finance. (Finance uses postSettlementInTx.) */
export async function approveSettlementInTx(tx: Tx, id: string, actor: Actor, note?: string | null) {
  const pr = await loadRequest(tx, id);
  const decide = checkSettlementDecide(pr, actor);
  if (!decide.ok) throw new BusinessError(decide.error);
  if (decide.step !== 'SUPERVISOR') throw new BusinessError('Tahap Keuangan diselesaikan dengan memposting pertanggungjawaban.');
  await claimSettlement(tx, id, ['SUBMITTED'], {
    settlementStatus: 'PENDING_FINANCE',
    settlementSupervisorApprovedAt: new Date(),
    settlementLastNote: note?.trim() || null,
  });
  await addHistory(tx, { requestId: id, action: 'SETTLE_APPROVE', actorId: actor.id, fromStatus: 'SUBMITTED', toStatus: 'PENDING_FINANCE', note });
  const updated = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  return { request: updated, events: [settlementEvent(updated, 'settlement_pending_finance', actor.id, note)] };
}

/** Return for revision (supervisor or finance): requester edits & resubmits. */
export async function returnSettlementInTx(tx: Tx, id: string, actor: Actor, reason: string) {
  assertOk(checkReason(reason));
  const pr = await loadRequest(tx, id);
  const decide = checkSettlementDecide(pr, actor);
  if (!decide.ok) throw new BusinessError(decide.error);
  await claimSettlement(tx, id, [pr.settlementStatus as string], { settlementStatus: 'REVISION', settlementLastNote: reason.trim() });
  await addHistory(tx, { requestId: id, action: 'SETTLE_RETURN', actorId: actor.id, fromStatus: pr.settlementStatus, toStatus: 'REVISION', note: reason.trim() });
  const updated = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  return { request: updated, events: [settlementEvent(updated, 'settlement_revision', actor.id, reason.trim())] };
}

// Finance: preview, post, cancel posting

/** The account the advance was debited to on payment (falls back to the system mapping). */
async function resolveAdvanceAccount(tx: Tx, journalEntryId: string | null): Promise<string | null> {
  if (journalEntryId) {
    const item = await tx.journalItem.findFirst({ where: { journalEntryId, debit: { gt: 0 } }, orderBy: { debit: 'desc' }, select: { accountId: true } });
    if (item) return item.accountId;
  }
  return resolveAdvanceAccountId(tx);
}

async function loadPostingContext(tx: Tx, id: string, lineAccounts: LineAccounts | undefined) {
  const pr = await loadRequest(tx, id);
  const rows = await tx.paymentRequestSettlementLine.findMany({ where: { paymentRequestId: id }, orderBy: { lineNo: 'asc' } });
  const overrides = new Map((lineAccounts ?? []).map((la) => [la.id, la.expenseAccountId]));
  for (const la of lineAccounts ?? []) {
    if (!rows.some((r) => r.id === la.id)) throw new BusinessError('Baris realisasi tidak ditemukan pada pengajuan ini.');
    if (la.expenseAccountId) await assertDetailAccount(tx, la.expenseAccountId, 'Akun biaya');
  }
  const lines = rows.map((r) => ({
    id: r.id,
    description: r.description,
    amount: r.amount.toString(),
    expenseAccountId: overrides.has(r.id) ? (overrides.get(r.id) as string | null) : r.expenseAccountId,
  }));
  const advanceAccountId = await resolveAdvanceAccount(tx, pr.journalEntryId);
  const narration = `Pertanggungjawaban ${pr.number}: ${pr.purpose}`.slice(0, 250);
  return { pr, lines, advanceAccountId, narration };
}

export interface SettlementPreviewResult extends Omit<SettlementPreview, 'lines'> {
  lines: Array<{ side: 'DR' | 'CR'; accountId: string | null; accountLabel: string | null; amount: number; description: string }>;
}

/** Journal preview (nothing is saved): what posting would book with the given accounts. */
export async function previewSettlementInTx(
  tx: Tx,
  id: string,
  input: { lineAccounts?: LineAccounts; cashAccountId?: string | null },
): Promise<SettlementPreviewResult> {
  const { pr, lines, advanceAccountId, narration } = await loadPostingContext(tx, id, input.lineAccounts);
  const preview = previewSettlementJournal({
    lines,
    advanceAmount: pr.totalAmount.toString(),
    advanceAccountId,
    cashAccountId: input.cashAccountId ?? null,
    narration,
  });
  const ids = [...new Set(preview.lines.map((l) => l.accountId).filter((a): a is string => !!a))];
  const accounts = await tx.account.findMany({ where: { id: { in: ids } }, select: { id: true, accountNumber: true, name: true } });
  const label = new Map(accounts.map((a) => [a.id, `${a.accountNumber} · ${a.name}`]));
  return { ...preview, lines: preview.lines.map((l) => ({ ...l, accountLabel: l.accountId ? label.get(l.accountId) ?? null : null })) };
}

export async function postSettlementInTx(
  tx: Tx,
  id: string,
  actor: Actor,
  input: { settlementDate: string; lineAccounts?: LineAccounts; cashAccountId?: string | null; reference?: string | null; note?: string | null },
) {
  const { pr, lines, advanceAccountId, narration } = await loadPostingContext(tx, id, input.lineAccounts);
  const decide = checkSettlementDecide(pr, actor);
  if (!decide.ok) throw new BusinessError(decide.error);
  if (decide.step !== 'FINANCE') throw new BusinessError('Pertanggungjawaban belum disetujui atasan.');

  const date = new Date(`${input.settlementDate}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new BusinessError('Tanggal pertanggungjawaban tidak valid.');
  if (pr.paymentDate && date < pr.paymentDate) throw new BusinessError('Tanggal pertanggungjawaban tidak boleh sebelum tanggal pembayaran uang muka.');
  const fiscalYear = await getOpenFiscalYear(tx, date); // closed period → BusinessError

  const advance = new Decimal(pr.totalAmount.toString());
  const needsCash = !computeTotal(lines).eq(advance);
  const cashAccountId = needsCash ? input.cashAccountId ?? null : null;
  if (cashAccountId) await assertCashAccount(tx, cashAccountId);

  const built = buildSettlementJournalLines({ lines, advanceAmount: advance, advanceAccountId, cashAccountId, narration });
  if (!built.ok) throw new BusinessError(built.error);

  // Persist the accounts finance chose (also when they only changed in this step).
  for (const l of lines) await tx.paymentRequestSettlementLine.update({ where: { id: l.id }, data: { expenseAccountId: l.expenseAccountId } });

  const now = new Date();
  await claimSettlement(tx, id, ['PENDING_FINANCE'], {
    settlementStatus: 'SETTLED',
    settledAt: now,
    settlementDate: date,
    settlementRealized: built.preview.realized.toFixed(2),
    settlementCashAccountId: cashAccountId,
    settlementReference: input.reference || null,
    settlementLastNote: input.note?.trim() || null,
  });
  const journal = await postJournalInTx(tx, { date, narration, fiscalYearId: fiscalYear.id, actorId: actor.id, now, lines: built.lines });
  await tx.paymentRequest.update({ where: { id }, data: { settlementJournalId: journal.id } });
  await addHistory(tx, {
    requestId: id,
    action: 'SETTLE_POST',
    actorId: actor.id,
    fromStatus: 'PENDING_FINANCE',
    toStatus: 'SETTLED',
    note: `${journal.entryNumber}${input.reference ? ` · Ref ${input.reference}` : ''}`,
  });
  const updated = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  return { request: updated, journal, preview: built.preview, events: [settlementEvent(updated, 'settlement_settled', actor.id)] };
}

export async function cancelSettlementPostingInTx(tx: Tx, id: string, actor: Actor, reason: string) {
  assertOk(checkReason(reason));
  const pr = await loadRequest(tx, id);
  assertOk(checkCancelSettlementPosting(pr, actor));
  if (pr.settlementJournalId) {
    const je = await tx.journalEntry.findUnique({ where: { id: pr.settlementJournalId }, select: { fiscalYear: { select: { isClosed: true } } } });
    if (je?.fiscalYear.isClosed) throw new BusinessError('Tahun buku jurnal pertanggungjawaban sudah ditutup; posting tidak bisa dibatalkan.');
  }
  await claimSettlement(tx, id, ['SETTLED'], {
    settlementStatus: 'PENDING_FINANCE',
    settledAt: null,
    settlementDate: null,
    settlementCashAccountId: null,
    settlementReference: null,
    settlementLastNote: reason.trim(),
  });
  if (pr.settlementJournalId) {
    await cancelJournalInTx(tx, pr.settlementJournalId);
    await tx.paymentRequest.update({ where: { id }, data: { settlementJournalId: null } });
  }
  await addHistory(tx, { requestId: id, action: 'SETTLE_CANCEL', actorId: actor.id, fromStatus: 'SETTLED', toStatus: 'PENDING_FINANCE', note: reason.trim() });
  const updated = await tx.paymentRequest.findUniqueOrThrow({ where: { id } });
  return { request: updated, events: [settlementEvent(updated, 'settlement_posting_cancelled', actor.id, reason.trim())] };
}
