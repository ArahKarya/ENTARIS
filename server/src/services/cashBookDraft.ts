/**
 * Draft Buku Kas (dari nota / halaman buku kas). The AIRA Engine (or a human, via
 * paste/CSV) proposes rows; Entaris owns storage, validation, the deterministic
 * DR/CR rules (utils/cashBookRules.ts), review and posting (cashBookDraftPost.ts).
 * A draft has NO effect on the GL/ledger/balances until it is posted.
 */
import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import {
  ROW_LIMIT,
  applyRowEdit,
  balanceCheck,
  checkRowCount,
  classifyRow,
  collapseSpaces,
  computeTotals,
  duplicateKey,
  matchLearned,
  mergeReasons,
  normalizeDateInput,
  normalizeRowInput,
  parseMoney,
  roundMoney,
  MAX_DESCRIPTION,
  type Direction,
  type LearnedMapEntry,
  type RawRowInput,
  type TxnType,
} from '../utils/cashBookRules';
import { assertCashAccount, resolveAdvanceAccountId } from './paymentRequestService';

type Tx = Prisma.TransactionClient;

export const DRAFT_STATUSES = ['Draft', 'PartiallyPosted', 'Posted', 'Discarded'] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];
/** Statuses in which header/rows can still be edited (only rows without a journal). */
export const EDITABLE_STATUSES: readonly string[] = ['Draft', 'PartiallyPosted'];
export const DUPLICATE_REASON = 'kemungkinan duplikat';
export const NOT_EDITABLE = 'Draft hanya bisa diubah selama berstatus Draft atau Sebagian Diposting.';

/** One or more rows failed validation. `rowErrors` lists every problem (row-indexed). */
export class RowErrorsError extends BusinessError {
  constructor(public readonly rowErrors: string[]) {
    super(`Ada ${rowErrors.length} kesalahan pada baris: ${rowErrors.slice(0, 5).join(' | ')}${rowErrors.length > 5 ? ' | …' : ''}`);
    this.name = 'RowErrorsError';
  }
}

export interface EngineRowInput extends RawRowInput {
  txnType?: unknown;
  accountCode?: unknown;
  accountId?: unknown;
  confidence?: unknown;
  reason?: unknown;
}

export interface CreateDraftInput {
  title?: string | null;
  entryDate: string;
  cashAccountId: string;
  openingBalance?: number | string | null;
  closingBalance?: number | string | null;
  source: 'manual' | 'aira';
  sourceRef?: string | null;
  sourceNote?: string | null;
  rows: EngineRowInput[];
}

export interface DraftActor {
  userId: string;
  via: 'mcp' | 'ui';
}

const toDay = (d: string): Date => new Date(`${d}T00:00:00.000Z`);
export const dayString = (d: Date): string => d.toISOString().slice(0, 10);

interface AccountLite {
  id: string;
  accountNumber: string;
  name: string;
  isGroup: boolean;
  isActive: boolean;
}

const accountLabel = (a: Pick<AccountLite, 'accountNumber' | 'name'>): string => `${a.accountNumber} ${a.name}`;

const ACCOUNT_SELECT = { id: true, accountNumber: true, name: true, isGroup: true, isActive: true } as const;

/** Problem text when an account cannot be a counter account, else null. */
function counterAccountProblem(a: AccountLite | null | undefined, ref: string): string | null {
  if (!a) return `akun "${ref}" tidak ditemukan`;
  if (a.isGroup) return `akun ${accountLabel(a)} adalah akun grup (pilih akun detail)`;
  if (!a.isActive) return `akun ${accountLabel(a)} tidak aktif`;
  return null;
}

export async function assertCounterAccount(tx: Tx, accountId: string, cashAccountId: string): Promise<AccountLite> {
  const a = await tx.account.findUnique({ where: { id: accountId }, select: ACCOUNT_SELECT });
  const problem = counterAccountProblem(a, accountId);
  if (problem || !a) throw new BusinessError(`Akun lawan tidak valid: ${problem}.`);
  if (a.id === cashAccountId) throw new BusinessError('Akun lawan tidak boleh sama dengan akun kas.');
  return a;
}

/** System-mapped accounts used by the rules (resolved via COA mappings, never by hardcoded numbers). */
export async function resolveRuleAccounts(tx: Tx) {
  const advanceAccountId = await resolveAdvanceAccountId(tx);
  const pick = async (role: string) =>
    (await tx.systemAccountMapping.findFirst({ where: { role }, orderBy: { sortOrder: 'asc' }, select: { accountId: true } }))?.accountId ?? null;
  const [defaultExpenseAccountId, defaultIncomeAccountId] = await Promise.all([pick('OTHER_EXPENSE'), pick('OTHER_INCOME')]);
  return { advanceAccountId, defaultExpenseAccountId, defaultIncomeAccountId };
}

async function loadLearnedMaps(tx: Tx): Promise<LearnedMapEntry[]> {
  return tx.cashBookLearnedMap.findMany({
    select: { pattern: true, txnType: true, accountId: true, hits: true },
    orderBy: [{ hits: 'desc' }, { updatedAt: 'desc' }],
    take: 3000,
  });
}

export interface RowInsert {
  idx: number;
  rowDate: Date;
  description: string;
  amount: Decimal;
  direction: Direction;
  txnType: TxnType;
  accountId: string | null;
  accountCode: string | null;
  accountLabel: string | null;
  confidence: number;
  needsReview: boolean;
  reason: string | null;
  userEdited: boolean;
}

interface PrepareContext {
  cashAccountId: string;
  fallbackDate: string;
  startIdx: number;
  /** excludes rows of this draft when searching duplicates */
  draftId?: string;
  userProvidedAccounts: boolean;
}

/** Validate + classify raw rows into insertable rows. Throws RowErrorsError listing ALL structural problems. */
async function prepareRows(tx: Tx, raw: readonly EngineRowInput[], ctx: PrepareContext): Promise<RowInsert[]> {
  const errors: string[] = [];
  const normalized: Array<{ n: Extract<ReturnType<typeof normalizeRowInput>, { ok: true }>['value']; src: EngineRowInput }> = [];
  raw.forEach((src, i) => {
    const r = normalizeRowInput(src, ctx.startIdx + i, ctx.fallbackDate);
    if (r.ok) normalized.push({ n: r.value, src });
    else errors.push(r.error);
  });
  if (errors.length > 0) throw new RowErrorsError(errors);

  const codes = new Set<string>();
  const ids = new Set<string>();
  for (const { src } of normalized) {
    if (typeof src.accountCode === 'string' && src.accountCode.trim()) {
      const c = src.accountCode.trim();
      codes.add(c);
      const first = c.split(/\s+/)[0];
      if (first) codes.add(first);
    }
    if (typeof src.accountId === 'string' && src.accountId) ids.add(src.accountId);
  }
  const accounts = await tx.account.findMany({
    where: { OR: [{ accountNumber: { in: [...codes] } }, { id: { in: [...ids] } }] },
    select: ACCOUNT_SELECT,
  });
  const byCode = new Map(accounts.map((a) => [a.accountNumber, a]));
  const byId = new Map(accounts.map((a) => [a.id, a]));

  const [rules, learnedMaps] = await Promise.all([resolveRuleAccounts(tx), loadLearnedMaps(tx)]);
  const learnedAccountIds = [...new Set(learnedMaps.map((m) => m.accountId))].filter((id) => !byId.has(id));
  if (learnedAccountIds.length > 0) {
    for (const a of await tx.account.findMany({ where: { id: { in: learnedAccountIds } }, select: ACCOUNT_SELECT })) byId.set(a.id, a);
  }
  const labelOf = (id: string | null | undefined): string | null => {
    const a = id ? byId.get(id) : undefined;
    return a ? accountLabel(a) : null;
  };

  const existingKeys = await loadExistingDuplicateKeys(tx, normalized.map((x) => x.n.date), ctx.cashAccountId, ctx.draftId);
  const seenInBatch = new Map<string, number>();

  const out: RowInsert[] = [];
  for (const { n, src } of normalized) {
    let engineAccount: AccountLite | null = null;
    let accountProblem: string | null = null;
    const codeRef = typeof src.accountCode === 'string' ? src.accountCode.trim() : '';
    const idRef = typeof src.accountId === 'string' ? src.accountId : '';
    if (idRef) {
      engineAccount = byId.get(idRef) ?? null;
      accountProblem = counterAccountProblem(engineAccount, idRef);
    } else if (codeRef) {
      engineAccount = byCode.get(codeRef) ?? byCode.get(codeRef.split(/\s+/)[0] ?? '') ?? null;
      accountProblem = counterAccountProblem(engineAccount, codeRef);
    }
    if (accountProblem) engineAccount = null;

    const learned = matchLearned(n.description, n.direction, learnedMaps);
    const engineType = src.txnType;
    // Rows entered by a human (paste/CSV/UI) are not "engine suggestions": no confidence ⇒ needs review unless an account is explicit.
    const confidence = ctx.userProvidedAccounts && engineAccount && src.confidence === undefined ? 1 : src.confidence;
    const result = classifyRow({
      direction: n.direction,
      engine: { txnType: engineType, accountId: engineAccount?.id ?? null, accountProblem, confidence, reason: src.reason },
      learned,
      learnedAccountLabel: labelOf(learned?.accountId),
      engineAccountLabel: engineAccount ? accountLabel(engineAccount) : null,
      cashAccountId: ctx.cashAccountId,
      advanceAccountId: rules.advanceAccountId,
      defaultExpenseAccountId: rules.defaultExpenseAccountId,
      defaultIncomeAccountId: rules.defaultIncomeAccountId,
    });

    let needsReview = result.needsReview;
    let reason = result.reason;
    const key = duplicateKey(n.date, n.amount, n.direction, n.description);
    const earlier = existingKeys.get(key);
    const inBatch = seenInBatch.get(key);
    if (earlier || inBatch !== undefined) {
      needsReview = true;
      reason = mergeReasons([reason, earlier ? `${DUPLICATE_REASON} (sudah ada di ${earlier})` : `${DUPLICATE_REASON} (sama dengan baris ${inBatch})`]);
    }
    if (inBatch === undefined) seenInBatch.set(key, n.idx);

    const acc = result.accountId ? byId.get(result.accountId) ?? null : null;
    const advanceLabel = result.accountId && result.accountId === rules.advanceAccountId ? labelOf(result.accountId) : null;
    out.push({
      idx: n.idx,
      rowDate: toDay(n.date),
      description: n.description,
      amount: n.amount,
      direction: n.direction,
      txnType: result.txnType,
      accountId: result.accountId,
      accountCode: acc?.accountNumber ?? null,
      accountLabel: acc ? accountLabel(acc) : advanceLabel,
      confidence: result.confidence,
      needsReview,
      reason,
      userEdited: false,
    });
  }
  await fillMissingAccountLabels(tx, out);
  return out;
}

/** Fill code/label snapshots for accounts picked by the rules (advance/default accounts) that were not preloaded. */
async function fillMissingAccountLabels(tx: Tx, rows: RowInsert[]): Promise<void> {
  const missing = [...new Set(rows.filter((r) => r.accountId && !r.accountLabel).map((r) => r.accountId as string))];
  if (missing.length === 0) return;
  const accs = await tx.account.findMany({ where: { id: { in: missing } }, select: ACCOUNT_SELECT });
  const map = new Map(accs.map((a) => [a.id, a]));
  for (const r of rows) {
    const a = r.accountId ? map.get(r.accountId) : undefined;
    if (a && !r.accountLabel) {
      r.accountCode = a.accountNumber;
      r.accountLabel = accountLabel(a);
    }
  }
}

/** Keys of rows already present in Posted/open drafts of the same cash account (value = draft number). */
async function loadExistingDuplicateKeys(tx: Tx, dates: string[], cashAccountId: string, excludeDraftId?: string): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (dates.length === 0) return map;
  const sorted = [...dates].sort();
  const rows = await tx.cashBookDraftRow.findMany({
    where: {
      rowDate: { gte: toDay(sorted[0]), lte: toDay(sorted[sorted.length - 1]) },
      skip: false,
      ...(excludeDraftId ? { draftId: { not: excludeDraftId } } : {}),
      draft: { status: { in: ['Draft', 'PartiallyPosted', 'Posted'] }, cashAccountId },
    },
    select: { rowDate: true, amount: true, direction: true, description: true, draft: { select: { draftNumber: true } } },
    take: 5000,
  });
  for (const r of rows) {
    map.set(duplicateKey(dayString(r.rowDate), r.amount.toString(), r.direction as Direction, r.description), r.draft.draftNumber);
  }
  return map;
}

function parseBalance(v: number | string | null | undefined, label: string): Decimal | null {
  if (v === null || v === undefined) return null;
  const d = parseMoney(v);
  if (d === null) throw new BusinessError(`${label} bukan angka yang valid.`);
  return d;
}

export async function createCashBookDraft(tx: Tx, input: CreateDraftInput, actor: DraftActor) {
  const countError = checkRowCount(0, input.rows.length);
  if (countError) throw new BusinessError(countError);
  const entry = normalizeDateInput(input.entryDate);
  if (!entry) throw new BusinessError('Tanggal halaman buku kas tidak valid (format YYYY-MM-DD).');
  await assertCashAccount(tx, input.cashAccountId);
  const opening = parseBalance(input.openingBalance, 'Saldo awal');
  const closing = parseBalance(input.closingBalance, 'Saldo akhir');

  const rows = await prepareRows(tx, input.rows, {
    cashAccountId: input.cashAccountId,
    fallbackDate: entry,
    startIdx: 1,
    userProvidedAccounts: input.source === 'manual',
  });

  const draftNumber = await generateDocumentNumber(tx, 'DKB', new Date(), '');
  const draft = await tx.cashBookDraft.create({
    data: {
      draftNumber,
      status: 'Draft',
      title: collapseSpaces(input.title ?? '').slice(0, 200) || `Buku kas ${entry}`,
      entryDate: toDay(entry),
      cashAccountId: input.cashAccountId,
      openingBalance: opening,
      closingBalance: closing,
      source: input.source,
      sourceRef: input.sourceRef ? input.sourceRef.slice(0, 200) : null,
      sourceNote: input.sourceNote ? input.sourceNote.slice(0, 1000) : null,
      createdById: actor.userId,
      createdVia: actor.via,
    },
  });
  await tx.cashBookDraftRow.createMany({ data: rows.map((r) => ({ ...r, draftId: draft.id })) });
  return { draft, rowCount: rows.length, needsReviewCount: rows.filter((r) => r.needsReview).length };
}

/** Lock-free guard: the draft must be editable; returns it. */
async function loadEditable(tx: Tx, id: string) {
  const draft = await tx.cashBookDraft.findUnique({ where: { id } });
  if (!draft) throw new BusinessError('Draft buku kas tidak ditemukan.');
  if (!EDITABLE_STATUSES.includes(draft.status)) throw new BusinessError(NOT_EDITABLE);
  return draft;
}

export interface HeaderPatch {
  title?: string;
  entryDate?: string;
  cashAccountId?: string;
  openingBalance?: number | string | null;
  closingBalance?: number | string | null;
  sourceNote?: string | null;
}

export async function updateDraftHeader(tx: Tx, id: string, patch: HeaderPatch) {
  const draft = await loadEditable(tx, id);
  const data: Prisma.CashBookDraftUpdateInput = {};
  if (patch.title !== undefined) data.title = collapseSpaces(patch.title).slice(0, 200) || draft.title;
  if (patch.entryDate !== undefined) {
    const d = normalizeDateInput(patch.entryDate);
    if (!d) throw new BusinessError('Tanggal halaman buku kas tidak valid (format YYYY-MM-DD).');
    data.entryDate = toDay(d);
  }
  if (patch.cashAccountId !== undefined && patch.cashAccountId !== draft.cashAccountId) {
    await assertCashAccount(tx, patch.cashAccountId);
    const clash = await tx.cashBookDraftRow.count({ where: { draftId: id, accountId: patch.cashAccountId, journalEntryId: null } });
    if (clash > 0) throw new BusinessError('Ada baris yang akun lawannya sama dengan akun kas yang baru. Ubah akun baris tersebut dulu.');
    if (draft.status === 'PartiallyPosted') throw new BusinessError('Akun kas tidak bisa diganti setelah sebagian baris diposting.');
    data.cashAccountId = patch.cashAccountId;
  }
  if (patch.openingBalance !== undefined) data.openingBalance = parseBalance(patch.openingBalance, 'Saldo awal');
  if (patch.closingBalance !== undefined) data.closingBalance = parseBalance(patch.closingBalance, 'Saldo akhir');
  if (patch.sourceNote !== undefined) data.sourceNote = patch.sourceNote ? patch.sourceNote.slice(0, 1000) : null;
  return tx.cashBookDraft.update({ where: { id }, data: { ...data, lastError: null } });
}

export async function appendDraftRows(tx: Tx, id: string, rows: EngineRowInput[]) {
  const draft = await loadEditable(tx, id);
  const last = await tx.cashBookDraftRow.aggregate({ where: { draftId: id }, _max: { idx: true }, _count: { _all: true } });
  const countError = checkRowCount(last._count._all, rows.length);
  if (countError) throw new BusinessError(countError);
  const prepared = await prepareRows(tx, rows, {
    cashAccountId: draft.cashAccountId,
    fallbackDate: dayString(draft.entryDate),
    startIdx: (last._max.idx ?? 0) + 1,
    draftId: id,
    userProvidedAccounts: draft.source === 'manual',
  });
  await tx.cashBookDraftRow.createMany({ data: prepared.map((r) => ({ ...r, draftId: id })) });
  await tx.cashBookDraft.update({ where: { id }, data: { lastError: null } });
  return { added: prepared.length, needsReviewCount: prepared.filter((r) => r.needsReview).length };
}

export interface RowPatch {
  id: string;
  description?: string;
  amount?: number | string;
  date?: string;
  direction?: Direction;
  txnType?: TxnType;
  accountId?: string | null;
  skip?: boolean;
  /** Human confirms the row as it is (clears needsReview; teaches the pattern on post). */
  reviewed?: boolean;
}

export async function updateDraftRows(tx: Tx, id: string, patches: RowPatch[]) {
  const draft = await loadEditable(tx, id);
  if (patches.length === 0) throw new BusinessError('Tidak ada perubahan baris.');
  if (patches.length > ROW_LIMIT) throw new BusinessError(`Maksimal ${ROW_LIMIT} perubahan baris per permintaan.`);
  const rows = await tx.cashBookDraftRow.findMany({ where: { id: { in: patches.map((p) => p.id) }, draftId: id } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const { advanceAccountId } = await resolveRuleAccounts(tx);
  const errors: string[] = [];
  const updates: Array<{ id: string; data: Prisma.CashBookDraftRowUpdateInput }> = [];

  for (const p of patches) {
    const row = byId.get(p.id);
    if (!row) {
      errors.push(`Baris ${p.id} tidak ditemukan di draft ini.`);
      continue;
    }
    const at = `Baris ${row.idx}`;
    if (row.journalEntryId) {
      errors.push(`${at}: sudah diposting dan tidak bisa diubah.`);
      continue;
    }
    const data: Prisma.CashBookDraftRowUpdateInput = {};
    if (p.description !== undefined) {
      const d = collapseSpaces(p.description);
      if (!d || d.length > MAX_DESCRIPTION) {
        errors.push(`${at}: keterangan wajib diisi (maksimal ${MAX_DESCRIPTION} karakter).`);
        continue;
      }
      data.description = d;
    }
    if (p.amount !== undefined) {
      const a = parseMoney(p.amount);
      if (a === null || !a.gt(0)) {
        errors.push(`${at}: nominal harus angka lebih dari 0.`);
        continue;
      }
      data.amount = roundMoney(a);
    }
    if (p.date !== undefined) {
      const d = normalizeDateInput(p.date);
      if (!d) {
        errors.push(`${at}: tanggal tidak valid.`);
        continue;
      }
      data.rowDate = toDay(d);
    }
    if (p.skip !== undefined) data.skip = p.skip;

    const accountTouched = p.accountId !== undefined || p.txnType !== undefined || p.direction !== undefined;
    if (accountTouched) {
      const edit = applyRowEdit(
        { direction: row.direction as Direction, txnType: row.txnType as TxnType, accountId: row.accountId },
        { direction: p.direction, txnType: p.txnType, accountId: p.accountId },
        advanceAccountId,
      );
      if (!edit.ok) {
        errors.push(`${at}: ${edit.error}`);
        continue;
      }
      const next = edit.value;
      let acc: AccountLite | null = null;
      if (next.accountId) {
        const found = await tx.account.findUnique({ where: { id: next.accountId }, select: ACCOUNT_SELECT });
        const problem = counterAccountProblem(found, next.accountId);
        if (problem || !found) {
          errors.push(`${at}: ${problem}.`);
          continue;
        }
        if (found.id === draft.cashAccountId) {
          errors.push(`${at}: akun lawan tidak boleh sama dengan akun kas.`);
          continue;
        }
        acc = found;
      }
      data.direction = next.direction;
      data.txnType = next.txnType;
      data.accountId = acc?.id ?? null;
      data.accountCode = acc?.accountNumber ?? null;
      data.accountLabel = acc ? accountLabel(acc) : null;
      data.userEdited = true;
      data.needsReview = !acc;
      if (acc) data.confidence = 1;
    }
    if (p.reviewed) {
      data.userEdited = true;
      data.needsReview = false;
    }
    updates.push({ id: p.id, data: { ...data, error: null } });
  }
  if (errors.length > 0) throw new RowErrorsError(errors);
  for (const u of updates) await tx.cashBookDraftRow.update({ where: { id: u.id }, data: u.data });
  await tx.cashBookDraft.update({ where: { id }, data: { lastError: null } });
  return { updated: updates.length };
}

export async function discardCashBookDraft(tx: Tx, id: string) {
  const res = await tx.cashBookDraft.updateMany({ where: { id, status: 'Draft' }, data: { status: 'Discarded' } });
  if (res.count === 0) throw new BusinessError('Hanya draft berstatus Draft yang bisa dibuang.');
}

// Read model

export async function getCashBookDraftDetail(db: Tx | typeof import('../lib/prisma').prisma, id: string) {
  const draft = await db.cashBookDraft.findUnique({ where: { id }, include: { rows: { orderBy: { idx: 'asc' } } } });
  if (!draft) return null;
  const [cash, creator] = await Promise.all([
    db.account.findUnique({ where: { id: draft.cashAccountId }, select: { id: true, accountNumber: true, name: true } }),
    db.user.findUnique({ where: { id: draft.createdById }, select: { id: true, fullName: true } }),
  ]);
  const journalIds = draft.rows.map((r) => r.journalEntryId).filter((j): j is string => !!j);
  const journals = journalIds.length
    ? await db.journalEntry.findMany({ where: { id: { in: journalIds } }, select: { id: true, entryNumber: true } })
    : [];
  const jMap = new Map(journals.map((j) => [j.id, j.entryNumber]));
  const rows = draft.rows.map((r) => ({
    id: r.id,
    idx: r.idx,
    rowDate: dayString(r.rowDate),
    description: r.description,
    amount: Number(r.amount),
    direction: r.direction,
    txnType: r.txnType,
    accountId: r.accountId,
    accountCode: r.accountCode,
    accountLabel: r.accountLabel,
    confidence: Number(r.confidence),
    needsReview: r.needsReview,
    reason: r.reason,
    isDuplicate: !!r.reason && r.reason.includes(DUPLICATE_REASON),
    skip: r.skip,
    userEdited: r.userEdited,
    journalEntryId: r.journalEntryId,
    journalNumber: r.journalEntryId ? jMap.get(r.journalEntryId) ?? null : null,
    postedAt: r.postedAt,
    error: r.error,
  }));
  const pending = rows.filter((r) => !r.skip && !r.journalEntryId);
  const { rows: _omit, ...head } = draft;
  return {
    ...head,
    openingBalance: draft.openingBalance === null ? null : Number(draft.openingBalance),
    closingBalance: draft.closingBalance === null ? null : Number(draft.closingBalance),
    entryDate: dayString(draft.entryDate),
    cashAccount: cash,
    createdBy: creator,
    rows,
    totals: computeTotals(rows),
    needsReviewCount: pending.filter((r) => r.needsReview).length,
    duplicateCount: pending.filter((r) => r.isDuplicate).length,
    balance: balanceCheck(draft.openingBalance?.toString() ?? null, draft.closingBalance?.toString() ?? null, rows),
  };
}
