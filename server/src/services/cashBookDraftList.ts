/**
 * Read models for Draft Buku Kas: paged list (with counts per status), the slim counter-account
 * catalog (UI + AIRA Engine) and the learned-map list.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { compareAccountNumber } from '../utils/accountSort';
import { firstString, localDayRange, parseDateParam, parseListPaging } from '../utils/listQuery';
import { TXN_TYPES } from '../utils/cashBookRules';
import { DRAFT_STATUSES, dayString } from './cashBookDraft';

type Db = Prisma.TransactionClient | typeof prisma;

export type ListFilter = { ok: true; where: Prisma.CashBookDraftWhereInput } | { ok: false; error: string };

export function buildDraftWhere(query: Record<string, unknown>): ListFilter {
  const status = firstString(query.status);
  if (status && !(DRAFT_STATUSES as readonly string[]).includes(status)) return { ok: false, error: 'Status draft tidak dikenal.' };
  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  // Discarded drafts only show when asked for explicitly.
  const where: Prisma.CashBookDraftWhereInput = { status: status ?? { not: 'Discarded' } };
  if (startDate || endDate) where.entryDate = { ...localDayRange(startDate, endDate) };
  const search = firstString(query.search);
  if (search) {
    const contains = { contains: search, mode: 'insensitive' as const };
    where.OR = [{ draftNumber: contains }, { title: contains }, { sourceNote: contains }];
  }
  return { ok: true, where };
}

export async function listCashBookDrafts(query: Record<string, unknown>, where: Prisma.CashBookDraftWhereInput) {
  const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 25, maxLimit: 200 });
  const [rows, total, grouped] = await Promise.all([
    prisma.cashBookDraft.findMany({ where, orderBy: [{ createdAt: 'desc' }], skip, take }),
    prisma.cashBookDraft.count({ where }),
    prisma.cashBookDraft.groupBy({ by: ['status'], where: { status: { not: 'Discarded' } }, _count: { _all: true } }),
  ]);
  const ids = rows.map((r) => r.id);
  const [sums, review, cashAccounts, creators] = await Promise.all([
    ids.length
      ? prisma.cashBookDraftRow.groupBy({ by: ['draftId', 'direction'], where: { draftId: { in: ids }, skip: false }, _sum: { amount: true }, _count: { _all: true } })
      : [],
    ids.length
      ? prisma.cashBookDraftRow.groupBy({ by: ['draftId'], where: { draftId: { in: ids }, skip: false, needsReview: true, journalEntryId: null }, _count: { _all: true } })
      : [],
    prisma.account.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.cashAccountId))] } }, select: { id: true, accountNumber: true, name: true } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.createdById))] } }, select: { id: true, fullName: true } }),
  ]);
  const cashMap = new Map(cashAccounts.map((a) => [a.id, a]));
  const userMap = new Map(creators.map((u) => [u.id, u.fullName]));
  const reviewMap = new Map(review.map((g) => [g.draftId, g._count._all]));
  const data = rows.map((r) => {
    const mine = sums.filter((s) => s.draftId === r.id);
    const sumOf = (dir: string) => Number(mine.find((s) => s.direction === dir)?._sum.amount ?? 0);
    return {
      id: r.id,
      draftNumber: r.draftNumber,
      status: r.status,
      title: r.title,
      entryDate: dayString(r.entryDate),
      source: r.source,
      createdVia: r.createdVia,
      cashAccount: cashMap.get(r.cashAccountId) ?? null,
      createdBy: { id: r.createdById, fullName: userMap.get(r.createdById) ?? null },
      rowCount: mine.reduce((n, s) => n + s._count._all, 0),
      totalMasuk: sumOf('masuk'),
      totalKeluar: sumOf('keluar'),
      needsReviewCount: reviewMap.get(r.id) ?? 0,
      lastError: r.lastError,
      createdAt: r.createdAt,
      postedAt: r.postedAt,
    };
  });
  const counts = Object.fromEntries(grouped.map((g) => [g.status, g._count._all]));
  return { data, total, page, limit: take, counts };
}

export interface CounterAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  isCash: boolean;
  /** System role this account plays for the cash book rules, if any. */
  role: 'EMPLOYEE_ADVANCE' | 'OTHER_EXPENSE' | 'OTHER_INCOME' | null;
}

const RULE_ROLES = ['EMPLOYEE_ADVANCE', 'OTHER_EXPENSE', 'OTHER_INCOME'] as const;

/** Slim list of usable (active, detail) accounts with cash flag + the rule roles; sorted by account number. */
export async function listCounterAccounts(db: Db = prisma): Promise<CounterAccount[]> {
  const [accounts, cashMaps, roleMaps] = await Promise.all([
    db.account.findMany({ where: { isGroup: false, isActive: true }, select: { id: true, accountNumber: true, name: true, accountType: true } }),
    db.systemAccountMapping.findMany({ where: { role: 'CASH' }, select: { accountId: true } }),
    db.systemAccountMapping.findMany({ where: { role: { in: [...RULE_ROLES] } }, orderBy: { sortOrder: 'asc' }, select: { role: true, accountId: true } }),
  ]);
  const cashIds = new Set(cashMaps.map((m) => m.accountId));
  const roleOf = new Map<string, CounterAccount['role']>();
  for (const m of roleMaps) if (!roleOf.has(m.accountId)) roleOf.set(m.accountId, m.role as CounterAccount['role']);
  return accounts
    .map((a) => ({
      id: a.id,
      code: a.accountNumber,
      name: a.name,
      type: a.accountType,
      isCash: a.accountType === 'ASSET' && (cashIds.has(a.id) || a.accountNumber.startsWith('1.1')),
      role: roleOf.get(a.id) ?? null,
    }))
    .sort((a, b) => compareAccountNumber(a.code, b.code));
}

export async function listLearnedMaps(limit = 300, db: Db = prisma) {
  const maps = await db.cashBookLearnedMap.findMany({ orderBy: [{ hits: 'desc' }, { updatedAt: 'desc' }], take: limit });
  const accs = await db.account.findMany({ where: { id: { in: [...new Set(maps.map((m) => m.accountId))] } }, select: { id: true, accountNumber: true, name: true } });
  const accMap = new Map(accs.map((a) => [a.id, a]));
  return maps.map((m) => ({
    id: m.id,
    pattern: m.pattern,
    txnType: m.txnType,
    accountId: m.accountId,
    accountCode: accMap.get(m.accountId)?.accountNumber ?? null,
    accountName: accMap.get(m.accountId)?.name ?? null,
    hits: m.hits,
    updatedAt: m.updatedAt,
  }));
}

/** Rules table returned to the engine so it classifies with the same vocabulary the server enforces. */
export const TXN_TYPE_GUIDE: ReadonlyArray<{ txnType: (typeof TXN_TYPES)[number]; direction: string; journal: string; accountRule: string }> = [
  { txnType: 'pengeluaran', direction: 'keluar', journal: 'DR akun lawan (beban) / CR kas', accountRule: 'pilih akun beban/aset yang tepat dari katalog' },
  { txnType: 'pemasukan', direction: 'masuk', journal: 'DR kas / CR akun lawan (sumber)', accountRule: 'pilih akun pendapatan/sumber dana dari katalog' },
  { txnType: 'uang_muka', direction: 'keluar', journal: 'DR Uang Muka Karyawan / CR kas', accountRule: 'akun ditetapkan server (role EMPLOYEE_ADVANCE); kasbon/uang muka untuk karyawan' },
  { txnType: 'terima_kasbon', direction: 'masuk', journal: 'DR kas / CR Uang Muka Karyawan', accountRule: 'akun ditetapkan server (role EMPLOYEE_ADVANCE); karyawan mengembalikan kasbon' },
  { txnType: 'lainnya', direction: 'keluar atau masuk', journal: 'keluar: DR akun usulan / CR kas; masuk: DR kas / CR akun usulan', accountRule: 'tidak yakin; selalu ditinjau manusia' },
];
