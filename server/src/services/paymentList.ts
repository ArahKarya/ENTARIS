/**
 * Cash & bank ledger (GET /api/payments/ledger[/summary]): one row per cash movement, merged
 * server-side so it pages as a whole. Sources: every Payment, plus each journal line on a non-group
 * 1.1 account of a non-cancelled entry that is not "JV-PAY…" and not linked to a Payment.
 * Money in: Receive / CustomerDeposit / VendorRefund payments and cash debits; the rest is out.
 * Journal kind: "Transfer" (pinbuk) when the entry has a cash line on the other side, else
 * "Expense" (credit) or "JournalIn" (debit). Read-only; SQL parameterized, ORDER BY whitelisted.
 */
import { DocumentStatus, Prisma, PaymentType } from '@prisma/client';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

export const CASH_LEDGER_SORT_FIELDS = ['date', 'number', 'party', 'amount'] as const;
export type CashLedgerSortField = (typeof CASH_LEDGER_SORT_FIELDS)[number];
export const DEFAULT_CASH_LEDGER_SORT: SortSpec<CashLedgerSortField> = { field: 'date', dir: 'desc' };

export const JOURNAL_KINDS = ['Transfer', 'Expense', 'JournalIn'] as const;
export const CASH_LEDGER_KINDS = [...Object.values(PaymentType), ...JOURNAL_KINDS] as const;
export type CashLedgerKind = PaymentType | (typeof JOURNAL_KINDS)[number];

/** Payment types that bring money into a cash/bank account. */
export const INFLOW_PAYMENT_TYPES: readonly PaymentType[] = ['Receive', 'CustomerDeposit', 'VendorRefund'];

export const CASH_LEDGER_DIRECTIONS = ['in', 'out'] as const;
export type CashDirection = (typeof CASH_LEDGER_DIRECTIONS)[number];

const KINDS = new Set<string>(CASH_LEDGER_KINDS);
const DIRECTIONS = new Set<string>(CASH_LEDGER_DIRECTIONS);
const STATUSES = new Set<string>(Object.values(DocumentStatus));

export interface CashLedgerFilter {
  search?: string;
  kind?: CashLedgerKind;
  direction?: CashDirection;
  status?: DocumentStatus;
  partyId?: string;
  accountId?: string;
  date?: { gte?: Date; lt?: Date };
}

export type CashLedgerFilterResult = { ok: true; filter: CashLedgerFilter } | { ok: false; error: string };

/**
 * Filters shared by the paged list and the summary:
 *   type       one of CASH_LEDGER_KINDS
 *   direction  in | out
 *   status     Draft | Submitted | Cancelled
 *   partyId, accountId (cash/bank account; payments also match on split accounts)
 *   startDate/endDate (YYYY-MM-DD, business-local days)
 *   search     number, party name, notes/narration, reference/line memo
 */
export function buildCashLedgerFilter(query: Record<string, unknown>): CashLedgerFilterResult {
  const filter: CashLedgerFilter = {};

  const kind = firstString(query.type);
  if (kind) {
    if (!KINDS.has(kind)) return { ok: false, error: 'Tipe transaksi tidak dikenal.' };
    filter.kind = kind as CashLedgerKind;
  }

  const direction = firstString(query.direction);
  if (direction) {
    if (!DIRECTIONS.has(direction)) return { ok: false, error: 'Arah transaksi harus "in" atau "out".' };
    filter.direction = direction as CashDirection;
  }

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status transaksi tidak dikenal.' };
    filter.status = status as DocumentStatus;
  }

  const partyId = firstString(query.partyId);
  if (partyId) filter.partyId = partyId;

  const accountId = firstString(query.accountId);
  if (accountId) filter.accountId = accountId;

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) {
    return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  }
  if (startDate || endDate) {
    filter.date = { ...localDayRange(startDate, endDate) };
  }

  const search = firstString(query.search);
  if (search) filter.search = search;

  return { ok: true, filter };
}

/** Escape LIKE wildcards so user input matches literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Dates are stored as `timestamp without time zone` holding UTC wall time, so
 * the instant is passed as an ISO string cast to timestamp (deterministic,
 * independent of the DB session time zone).
 */
const ts = (d: Date) => Prisma.sql`${d.toISOString()}::timestamp`;

/** WHERE clause over the unified `ledger` CTE (alias `l`). */
export function cashLedgerWhereSql(filter: CashLedgerFilter): Prisma.Sql {
  const parts: Prisma.Sql[] = [];
  if (filter.kind) parts.push(Prisma.sql`l.kind = ${filter.kind}`);
  if (filter.direction) parts.push(Prisma.sql`l.direction = ${filter.direction}`);
  if (filter.status) parts.push(Prisma.sql`l.status = ${filter.status}`);
  if (filter.partyId) parts.push(Prisma.sql`l.party_id = ${filter.partyId}`);
  if (filter.accountId) {
    parts.push(Prisma.sql`(l.account_id = ${filter.accountId} OR (l.source = 'payment' AND EXISTS (
      SELECT 1 FROM payment_splits s WHERE s.payment_id = l.id AND s.account_id = ${filter.accountId}
    )))`);
  }
  if (filter.date?.gte) parts.push(Prisma.sql`l.date >= ${ts(filter.date.gte)}`);
  if (filter.date?.lt) parts.push(Prisma.sql`l.date < ${ts(filter.date.lt)}`);
  if (filter.search) {
    const pattern = `%${escapeLike(filter.search)}%`;
    parts.push(Prisma.sql`(l.number ILIKE ${pattern} OR l.party_name ILIKE ${pattern}
      OR l.notes ILIKE ${pattern} OR l.memo ILIKE ${pattern})`);
  }
  return parts.length > 0 ? Prisma.sql`WHERE ${Prisma.join(parts, ' AND ')}` : Prisma.empty;
}

const SORT_COLUMNS: Readonly<Record<CashLedgerSortField, string>> = {
  date: 'l.date',
  number: 'l.number',
  party: 'l.party_name',
  amount: 'l.amount',
};

/** ORDER BY from the whitelist only, with stable tie-breakers. */
export function cashLedgerOrderBySql(sort: SortSpec<CashLedgerSortField>): Prisma.Sql {
  const column = SORT_COLUMNS[sort.field] ?? SORT_COLUMNS.date;
  const dir = sort.dir === 'asc' ? 'ASC' : 'DESC';
  const tieBreak = sort.field === 'number' ? `l.id ${dir}` : `l.number ${dir}, l.id ${dir}`;
  return Prisma.raw(`ORDER BY ${column} ${dir} NULLS LAST, ${tieBreak}`);
}

/** Cash/bank accounts: non-group accounts numbered 1.1… (same rule as before). */
const CASH_ACCOUNT_PREFIX = '1.1%';

/**
 * The unified ledger as a CTE. Columns:
 *   source, id, journal_entry_id, date, number, party_id, party_name,
 *   party_type, kind, direction, amount, status, account_id, account_name,
 *   account_number, notes, memo
 */
export const CASH_LEDGER_CTE = Prisma.sql`
  WITH ledger AS (
    SELECT
      'payment'::text AS source,
      p.id,
      NULL::text AS journal_entry_id,
      p.date,
      p.payment_number AS number,
      p.party_id,
      pt.name AS party_name,
      pt."partyType"::text AS party_type,
      p.payment_type::text AS kind,
      CASE WHEN p.payment_type::text IN (${Prisma.join(INFLOW_PAYMENT_TYPES)}) THEN 'in' ELSE 'out' END AS direction,
      p.amount,
      p.status::text AS status,
      p.account_id,
      a.name AS account_name,
      a."accountNumber" AS account_number,
      p.notes,
      p.reference_number AS memo
    FROM payments p
    JOIN parties pt ON pt.id = p.party_id
    JOIN accounts a ON a.id = p.account_id
    UNION ALL
    SELECT
      'journal'::text,
      ji.id,
      ji.journal_entry_id,
      je.date,
      je.entry_number,
      ji.party_id,
      jp.name,
      jp."partyType"::text,
      CASE
        WHEN EXISTS (
          SELECT 1
          FROM journal_entry_accounts ji2
          JOIN accounts a2 ON a2.id = ji2.account_id
          WHERE ji2.journal_entry_id = ji.journal_entry_id
            AND ji2.id <> ji.id
            AND a2."accountNumber" LIKE ${CASH_ACCOUNT_PREFIX}
            AND a2."isGroup" = false
            AND CASE WHEN ji.credit > 0 THEN ji2.debit > 0 ELSE ji2.credit > 0 END
        ) THEN 'Transfer'
        WHEN ji.credit > 0 THEN 'Expense'
        ELSE 'JournalIn'
      END,
      CASE WHEN ji.credit > 0 THEN 'out' ELSE 'in' END,
      CASE WHEN ji.credit > 0 THEN ji.credit ELSE ji.debit END,
      je.status::text,
      ji.account_id,
      a.name,
      a."accountNumber",
      je.narration,
      ji.description
    FROM journal_entry_accounts ji
    JOIN journal_entries je ON je.id = ji.journal_entry_id
    JOIN accounts a ON a.id = ji.account_id
    LEFT JOIN parties jp ON jp.id = ji.party_id
    WHERE a."accountNumber" LIKE ${CASH_ACCOUNT_PREFIX}
      AND a."isGroup" = false
      AND je.status <> 'Cancelled'
      AND je.entry_number NOT LIKE 'JV-PAY%'
      AND NOT EXISTS (SELECT 1 FROM payments px WHERE px.journal_entry_id = je.id)
  )
`;

type DecimalLike = Prisma.Decimal | number | string | null | undefined;

export interface CashLedgerRawRow {
  source: string;
  id: string;
  journal_entry_id: string | null;
  date: Date | string;
  number: string;
  party_id: string | null;
  party_name: string | null;
  party_type: string | null;
  kind: string;
  direction: string;
  amount: DecimalLike;
  status: string;
  account_id: string;
  account_name: string | null;
  account_number: string | null;
  notes: string | null;
  memo: string | null;
}

export interface CashLedgerRow {
  /** Payment id (source "payment") or journal line id (source "journal"). */
  id: string;
  source: 'payment' | 'journal';
  journalEntryId: string | null;
  date: string;
  number: string;
  partyId: string | null;
  partyName: string | null;
  partyType: string | null;
  kind: CashLedgerKind;
  direction: CashDirection;
  amount: number;
  status: string;
  accountId: string;
  accountName: string | null;
  accountNumber: string | null;
  /** Payment notes or journal narration. */
  notes: string | null;
  /** Payment reference number or journal line description. */
  memo: string | null;
}

function dec(value: DecimalLike): Prisma.Decimal {
  return new Prisma.Decimal(value ?? 0);
}

const money = (d: Prisma.Decimal) => d.toDecimalPlaces(2).toNumber();

export function mapCashLedgerRow(r: CashLedgerRawRow): CashLedgerRow {
  return {
    id: r.id,
    source: r.source === 'journal' ? 'journal' : 'payment',
    journalEntryId: r.journal_entry_id,
    date: (r.date instanceof Date ? r.date : new Date(r.date)).toISOString(),
    number: r.number,
    partyId: r.party_id,
    partyName: r.party_name,
    partyType: r.party_type,
    kind: r.kind as CashLedgerKind,
    direction: r.direction === 'in' ? 'in' : 'out',
    amount: money(dec(r.amount)),
    status: r.status,
    accountId: r.account_id,
    accountName: r.account_name,
    accountNumber: r.account_number,
    notes: r.notes,
    memo: r.memo,
  };
}

export interface CashLedgerGroupRow {
  direction: string;
  status: string;
  count: number | bigint;
  amount: DecimalLike;
}

export interface CashLedgerSummary {
  /** Every row matching the filters, cancelled ones included. */
  count: number;
  cancelledCount: number;
  /** Money in / out, excluding cancelled rows. */
  inCount: number;
  inTotal: number;
  outCount: number;
  outTotal: number;
  /** inTotal − outTotal. */
  net: number;
}

export function summarizeCashLedger(groups: readonly CashLedgerGroupRow[]): CashLedgerSummary {
  let count = 0;
  let cancelledCount = 0;
  let inCount = 0;
  let outCount = 0;
  let inTotal = new Prisma.Decimal(0);
  let outTotal = new Prisma.Decimal(0);

  for (const g of groups) {
    const n = Number(g.count);
    count += n;
    if (g.status === DocumentStatus.Cancelled) {
      cancelledCount += n;
      continue;
    }
    if (g.direction === 'in') {
      inCount += n;
      inTotal = inTotal.plus(dec(g.amount));
    } else {
      outCount += n;
      outTotal = outTotal.plus(dec(g.amount));
    }
  }

  return {
    count,
    cancelledCount,
    inCount,
    inTotal: money(inTotal),
    outCount,
    outTotal: money(outTotal),
    net: money(inTotal.minus(outTotal)),
  };
}

type RawClient = { $queryRaw<T = unknown>(query: Prisma.Sql): Prisma.PrismaPromise<T> };

export async function listCashLedger(
  db: RawClient,
  filter: CashLedgerFilter,
  sort: SortSpec<CashLedgerSortField>,
  paging: { skip: number; take: number },
): Promise<{ rows: CashLedgerRow[]; total: number }> {
  const where = cashLedgerWhereSql(filter);
  const [rows, counted] = await Promise.all([
    db.$queryRaw<CashLedgerRawRow[]>(Prisma.sql`
      ${CASH_LEDGER_CTE}
      SELECT l.* FROM ledger l
      ${where}
      ${cashLedgerOrderBySql(sort)}
      LIMIT ${paging.take} OFFSET ${paging.skip}
    `),
    db.$queryRaw<Array<{ total: number | bigint }>>(Prisma.sql`
      ${CASH_LEDGER_CTE}
      SELECT count(*)::int AS total FROM ledger l
      ${where}
    `),
  ]);
  return { rows: rows.map(mapCashLedgerRow), total: Number(counted[0]?.total ?? 0) };
}

export async function summarizeCashLedgerQuery(db: RawClient, filter: CashLedgerFilter): Promise<CashLedgerSummary> {
  const groups = await db.$queryRaw<CashLedgerGroupRow[]>(Prisma.sql`
    ${CASH_LEDGER_CTE}
    SELECT l.direction, l.status, count(*)::int AS count, COALESCE(sum(l.amount), 0) AS amount
    FROM ledger l
    ${cashLedgerWhereSql(filter)}
    GROUP BY l.direction, l.status
  `);
  return summarizeCashLedger(groups);
}
