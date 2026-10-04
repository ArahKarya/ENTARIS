/**
 * Query building for the journal list (GET /api/journals, page "Jurnal Umum").
 *
 * Response contract is unchanged ({ data, total, page, limit }, each row with
 * its lines + account and creator); this module only adds filters and a
 * whitelisted sort:
 *   status     Draft | Submitted | Cancelled
 *   accountId  entries with at least one line on that account
 *   startDate/endDate (YYYY-MM-DD, business-local calendar days)
 *   search     entry number, narration, line description, account name/number
 *   hideCancelled=true (legacy flag, still honoured)
 *   sort       date | entryNumber, "-" prefix for descending (default -date)
 *
 * Read-only: nothing here touches posting, balances or cancellation.
 */
import { DocumentStatus, Prisma } from '@prisma/client';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

export const JOURNAL_SORT_FIELDS = ['date', 'entryNumber'] as const;
export type JournalSortField = (typeof JOURNAL_SORT_FIELDS)[number];
export const DEFAULT_JOURNAL_SORT: SortSpec<JournalSortField> = { field: 'date', dir: 'desc' };

const STATUSES = new Set<string>(Object.values(DocumentStatus));

export type JournalWhereResult =
  | { ok: true; where: Prisma.JournalEntryWhereInput }
  | { ok: false; error: string };

export function buildJournalWhere(query: Record<string, unknown>): JournalWhereResult {
  const where: Prisma.JournalEntryWhereInput = {};

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status jurnal tidak dikenal.' };
    where.status = status as DocumentStatus;
  } else if (firstString(query.hideCancelled) === 'true') {
    where.status = { not: DocumentStatus.Cancelled };
  }

  const accountId = firstString(query.accountId);
  if (accountId) where.items = { some: { accountId } };

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) {
    return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  }
  if (startDate || endDate) {
    where.date = { ...localDayRange(startDate, endDate) };
  }

  // Server-side search keeps pagination consistent. Matches the header
  // (number, narration) and the lines (description, account name/number), so
  // "piutang karyawan" also finds entries whose narration says "Kasbon".
  const search = firstString(query.search);
  if (search) {
    where.OR = [
      { entryNumber: { contains: search, mode: 'insensitive' } },
      { narration: { contains: search, mode: 'insensitive' } },
      { items: { some: { description: { contains: search, mode: 'insensitive' } } } },
      { items: { some: { account: { name: { contains: search, mode: 'insensitive' } } } } },
      { items: { some: { account: { accountNumber: { contains: search, mode: 'insensitive' } } } } },
    ];
  }

  return { ok: true, where };
}

/** ORDER BY from the whitelist, with entryNumber (unique) as tie-breaker. */
export function journalOrderBy(sort: SortSpec<JournalSortField>): Prisma.JournalEntryOrderByWithRelationInput[] {
  const { field, dir } = sort;
  if (field === 'entryNumber') return [{ entryNumber: dir }];
  return [{ date: dir }, { entryNumber: dir }];
}
