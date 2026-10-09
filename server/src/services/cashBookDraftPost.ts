/**
 * Posting a Draft Buku Kas: ONE balanced journal per non-skipped row (DR/CR decided by
 * utils/cashBookRules.ts), all inside one transaction per draft. The draft is claimed
 * atomically (row lock via updateMany + status guard) so a double post is impossible.
 * Human corrections are learned (pattern → account) after the journals are written.
 */
import type { Prisma, PrismaClient } from '@prisma/client';
import { logger } from '../lib/logger';
import { BusinessError } from '../utils/errors';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { buildRowJournalLines, descriptionPattern, isAdvanceType, isTxnType, type JournalLineDraft } from '../utils/cashBookRules';
import { assertCashAccount, postJournalInTx } from './paymentRequestService';
import { EDITABLE_STATUSES, RowErrorsError, dayString } from './cashBookDraft';

type Tx = Prisma.TransactionClient;

export interface PostFailure {
  idx: number;
  error: string;
}

export interface PostResult {
  draftId: string;
  draftNumber: string;
  status: 'Posted' | 'PartiallyPosted';
  postedCount: number;
  failed: PostFailure[];
  journals: Array<{ rowIdx: number; journalEntryId: string; entryNumber: string }>;
  learned: number;
  totalAmount: number;
}

class PostBlockedError extends BusinessError {
  constructor(public readonly failed: PostFailure[]) {
    super(`Posting dibatalkan: ${failed.length} baris bermasalah.`);
    this.name = 'PostBlockedError';
  }
}

const TX_OPTIONS = { timeout: 120_000, maxWait: 15_000 } as const;
const fmt = (f: PostFailure): string => `Baris ${f.idx}: ${f.error}`;

/** Upsert pattern → account for rows whose account the human chose/confirmed. Returns the number of maps touched. */
async function learnFromRows(
  tx: Tx,
  rows: ReadonlyArray<{ description: string; txnType: string; accountId: string | null; userEdited: boolean }>,
  userId: string,
): Promise<number> {
  let touched = 0;
  for (const r of rows) {
    if (!r.userEdited || !r.accountId || !isTxnType(r.txnType) || isAdvanceType(r.txnType)) continue;
    const pattern = descriptionPattern(r.description);
    if (!pattern) continue;
    const existing = await tx.cashBookLearnedMap.findUnique({ where: { pattern_txnType: { pattern, txnType: r.txnType } } });
    if (!existing) {
      await tx.cashBookLearnedMap.create({ data: { pattern, txnType: r.txnType, accountId: r.accountId, hits: 1, updatedBy: userId } });
    } else if (existing.accountId === r.accountId) {
      await tx.cashBookLearnedMap.update({ where: { id: existing.id }, data: { hits: { increment: 1 }, updatedBy: userId } });
    } else {
      // The human chose a different account than what was learned: the newest correction wins, confidence restarts.
      await tx.cashBookLearnedMap.update({ where: { id: existing.id }, data: { accountId: r.accountId, hits: 1, updatedBy: userId } });
    }
    touched += 1;
  }
  return touched;
}

async function postInTx(tx: Tx, id: string, userId: string, partial: boolean): Promise<PostResult> {
  // Atomic claim: the UPDATE takes the row lock; a concurrent post waits, then fails the status guard.
  const claim = await tx.cashBookDraft.updateMany({ where: { id, status: { in: [...EDITABLE_STATUSES] } }, data: { lastError: null } });
  if (claim.count === 0) {
    const exists = await tx.cashBookDraft.findUnique({ where: { id }, select: { status: true } });
    if (!exists) throw new BusinessError('Draft buku kas tidak ditemukan.');
    throw new BusinessError('Draft sudah diposting atau tidak lagi bisa diposting.');
  }
  const draft = await tx.cashBookDraft.findUniqueOrThrow({ where: { id }, include: { rows: { orderBy: { idx: 'asc' } } } });
  await assertCashAccount(tx, draft.cashAccountId);

  const todo = draft.rows.filter((r) => !r.skip && !r.journalEntryId);
  const alreadyPosted = draft.rows.some((r) => !!r.journalEntryId);
  if (todo.length === 0) {
    if (!alreadyPosted) throw new BusinessError('Tidak ada baris untuk diposting (semua baris dilewati).');
    await tx.cashBookDraft.update({ where: { id }, data: { status: 'Posted', postedAt: new Date(), postedById: userId, lastError: null } });
    return { draftId: id, draftNumber: draft.draftNumber, status: 'Posted', postedCount: 0, failed: [], journals: [], learned: 0, totalAmount: 0 };
  }

  const accountIds = [...new Set(todo.map((r) => r.accountId).filter((a): a is string => !!a))];
  const accounts = await tx.account.findMany({ where: { id: { in: accountIds } }, select: { id: true, isGroup: true, isActive: true, accountNumber: true } });
  const accMap = new Map(accounts.map((a) => [a.id, a]));
  const fyCache = new Map<string, { id: string } | { error: string }>();

  const failed: PostFailure[] = [];
  const valid: Array<{ row: (typeof todo)[number]; lines: JournalLineDraft[]; narration: string; fiscalYearId: string }> = [];
  for (const row of todo) {
    const narration = `Buku Kas ${draft.draftNumber} #${row.idx}: ${row.description}`.slice(0, 250);
    const acc = row.accountId ? accMap.get(row.accountId) : undefined;
    if (row.accountId && (!acc || acc.isGroup || !acc.isActive)) {
      failed.push({ idx: row.idx, error: 'Akun lawan tidak valid (tidak ditemukan, akun grup, atau tidak aktif).' });
      continue;
    }
    const built = buildRowJournalLines(row, draft.cashAccountId, narration);
    if (!built.ok) {
      failed.push({ idx: row.idx, error: built.error });
      continue;
    }
    const day = dayString(row.rowDate);
    if (!fyCache.has(day)) {
      try {
        fyCache.set(day, { id: (await getOpenFiscalYear(tx, row.rowDate)).id });
      } catch (err) {
        if (!(err instanceof BusinessError)) throw err;
        fyCache.set(day, { error: err.message });
      }
    }
    const fy = fyCache.get(day) as { id: string } | { error: string };
    if ('error' in fy) {
      failed.push({ idx: row.idx, error: `Tanggal ${day}: ${fy.error}` });
      continue;
    }
    valid.push({ row, lines: built.value, narration, fiscalYearId: fy.id });
  }
  if (failed.length > 0 && (!partial || valid.length === 0)) throw new PostBlockedError(failed);

  const now = new Date();
  const journals: PostResult['journals'] = [];
  let totalAmount = 0;
  for (const v of valid) {
    const journal = await postJournalInTx(tx, { date: v.row.rowDate, narration: v.narration, fiscalYearId: v.fiscalYearId, actorId: userId, now, lines: v.lines });
    await tx.cashBookDraftRow.update({ where: { id: v.row.id }, data: { journalEntryId: journal.id, postedAt: now, error: null } });
    journals.push({ rowIdx: v.row.idx, journalEntryId: journal.id, entryNumber: journal.entryNumber });
    totalAmount += Number(v.row.amount);
  }
  for (const f of failed) {
    const row = todo.find((r) => r.idx === f.idx);
    if (row) await tx.cashBookDraftRow.update({ where: { id: row.id }, data: { error: f.error } });
  }
  const learned = await learnFromRows(tx, valid.map((v) => v.row), userId);

  const status = failed.length === 0 ? 'Posted' : 'PartiallyPosted';
  await tx.cashBookDraft.update({
    where: { id },
    data: {
      status,
      postedAt: now,
      postedById: userId,
      lastError: failed.length ? `${failed.length} baris belum diposting: ${failed.slice(0, 3).map(fmt).join(' | ')}` : null,
    },
  });
  return { draftId: id, draftNumber: draft.draftNumber, status, postedCount: valid.length, failed, journals, learned, totalAmount: Math.round(totalAmount * 100) / 100 };
}

/**
 * Post a draft. Default is all-or-nothing (any invalid row aborts, nothing is written except the
 * recorded errors); `partial` posts the valid rows and records per-row errors (PartiallyPosted).
 */
export async function postCashBookDraft(db: PrismaClient, id: string, userId: string, opts: { partial?: boolean } = {}): Promise<PostResult> {
  try {
    return await db.$transaction((tx) => postInTx(tx, id, userId, !!opts.partial), TX_OPTIONS);
  } catch (err) {
    if (err instanceof PostBlockedError) {
      await recordPostErrors(db, id, err.failed);
      throw new RowErrorsError(err.failed.map(fmt));
    }
    throw err;
  }
}

/** Persist row errors after a rolled-back post so the review UI can show them (best effort). */
async function recordPostErrors(db: PrismaClient, id: string, failed: PostFailure[]): Promise<void> {
  try {
    await db.$transaction(async (tx) => {
      for (const f of failed) await tx.cashBookDraftRow.updateMany({ where: { draftId: id, idx: f.idx, journalEntryId: null }, data: { error: f.error } });
      await tx.cashBookDraft.updateMany({
        where: { id, status: { in: [...EDITABLE_STATUSES] } },
        data: { lastError: `Posting gagal: ${failed.slice(0, 3).map(fmt).join(' | ')}` },
      });
    });
  } catch (err) {
    logger.warn({ err, draftId: id }, 'Gagal mencatat error posting draft buku kas');
  }
}
