/**
 * Filter + sort parsing for the bank reconciliation list,
 * GET /api/reconciliation?page=…&limit=…&accountId=…&status=…&startDate=…&endDate=…&search=…&sort=…
 * → { data, total, page, limit } (contract unchanged; every param optional).
 *
 * Read-only: nothing here touches matching, completion or ledger data.
 */
import { Prisma } from '@prisma/client';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

export const RECONCILIATION_STATUSES = ['Draft', 'Completed'] as const;
export const RECONCILIATION_SORT_FIELDS = [
  'statementDate',
  'account',
  'bookBalance',
  'statementBalance',
  'createdAt',
] as const;
export type ReconciliationSortField = (typeof RECONCILIATION_SORT_FIELDS)[number];
/** Same order the list has always used. */
export const DEFAULT_RECONCILIATION_SORT: SortSpec<ReconciliationSortField> = { field: 'statementDate', dir: 'desc' };

export type ReconciliationWhereResult =
  | { ok: true; where: Prisma.BankReconciliationWhereInput }
  | { ok: false; error: string };

/**
 * Filters:
 *   accountId               one cash/bank account
 *   status                  Draft | Completed
 *   startDate / endDate     statement date, YYYY-MM-DD, business-time-zone days
 *   search                  account name / number or notes
 */
export function buildReconciliationWhere(query: Record<string, unknown>): ReconciliationWhereResult {
  const where: Prisma.BankReconciliationWhereInput = {};

  const status = firstString(query.status);
  if (status) {
    if (!(RECONCILIATION_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, error: 'Status rekonsiliasi tidak dikenal.' };
    }
    where.status = status;
  }

  const accountId = firstString(query.accountId);
  if (accountId) where.accountId = accountId;

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) {
    return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  }
  if (startDate || endDate) {
    where.statementDate = { ...localDayRange(startDate, endDate) };
  }

  const search = firstString(query.search);
  if (search) {
    where.OR = [
      { account: { name: { contains: search, mode: 'insensitive' } } },
      { account: { accountNumber: { contains: search, mode: 'insensitive' } } },
      { notes: { contains: search, mode: 'insensitive' } },
    ];
  }

  return { ok: true, where };
}

/** Whitelisted ORDER BY with a stable tie-breaker so rows never jump between pages. */
export function reconciliationOrderBy(
  sort: SortSpec<ReconciliationSortField>,
): Prisma.BankReconciliationOrderByWithRelationInput[] {
  const dir = sort.dir;
  const primary: Prisma.BankReconciliationOrderByWithRelationInput =
    sort.field === 'account' ? { account: { name: dir } } : { [sort.field]: dir };
  const tieBreakers: Prisma.BankReconciliationOrderByWithRelationInput[] =
    sort.field === 'statementDate' ? [{ createdAt: dir }] : [{ statementDate: 'desc' }, { createdAt: 'desc' }];
  return [primary, ...tieBreakers, { id: dir }];
}
