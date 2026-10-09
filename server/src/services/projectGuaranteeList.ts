/**
 * Project guarantee list and summary (GET /api/project-guarantees). List and KPI cards share
 * buildProjectGuaranteeWhere. Sorting by remaining balance needs settlement-derived amounts, so a
 * light projection is sorted and sliced here before full rows load. Read-only.
 */
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { GUARANTEE_TYPES } from '../utils/schemas';
import { businessUtcOffset, firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

/** Stored statuses (plain strings, see prisma/schema.prisma). */
export const GUARANTEE_STATUSES = ['Disetor', 'Selesai', 'Dibatalkan'] as const;
export type GuaranteeStatus = (typeof GUARANTEE_STATUSES)[number];
const OPEN_STATUS: GuaranteeStatus = 'Disetor';
const CANCELLED_STATUS: GuaranteeStatus = 'Dibatalkan';

/** A guarantee still out (Disetor) whose expected return date is near or past. */
export const DUE_STATES = ['overdue', 'dueSoon'] as const;
export type DueState = (typeof DUE_STATES)[number];
/** "Segera jatuh tempo": expected back today or within this many days. */
export const DUE_SOON_DAYS = 30;

export const PROJECT_GUARANTEE_SORT_FIELDS = [
  'date',
  'guaranteeNumber',
  'party',
  'projectName',
  'expectedReturnDate',
  'amount',
  'outstanding',
] as const;
export type ProjectGuaranteeSortField = (typeof PROJECT_GUARANTEE_SORT_FIELDS)[number];
export const DEFAULT_PROJECT_GUARANTEE_SORT: SortSpec<ProjectGuaranteeSortField> = { field: 'date', dir: 'desc' };

const STATUSES = new Set<string>(GUARANTEE_STATUSES);
const TYPES = new Set<string>(GUARANTEE_TYPES);
const DUE = new Set<string>(DUE_STATES);
const DAY_MS = 24 * 60 * 60 * 1000;

/** Today's calendar date (YYYY-MM-DD) in the business time zone. */
export function businessToday(now: Date, offset: string = businessUtcOffset()): string {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  const shifted = new Date(now.getTime() + sign * (h * 60 + m) * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

export interface DueBoundaries {
  /** Start of today (business time zone): due before this = overdue. */
  todayStart: Date;
  /** End of the "due soon" window (exclusive): today + DUE_SOON_DAYS, inclusive of that day. */
  soonEnd: Date;
}

export function dueBoundaries(now: Date, offset: string = businessUtcOffset()): DueBoundaries {
  const { gte } = localDayRange(businessToday(now, offset), undefined, offset);
  const todayStart = gte as Date;
  return { todayStart, soonEnd: new Date(todayStart.getTime() + (DUE_SOON_DAYS + 1) * DAY_MS) };
}

/** Same rule as the `due` filter: only open (Disetor) guarantees can be overdue / due soon. */
export function deriveDueState(
  status: string,
  expectedReturnDate: Date | null | undefined,
  bounds: DueBoundaries,
): DueState | null {
  if (status !== OPEN_STATUS || !expectedReturnDate) return null;
  const t = expectedReturnDate.getTime();
  if (t < bounds.todayStart.getTime()) return 'overdue';
  if (t < bounds.soonEnd.getTime()) return 'dueSoon';
  return null;
}

function dueWhere(due: DueState, bounds: DueBoundaries): Prisma.ProjectGuaranteeWhereInput {
  return due === 'overdue'
    ? { status: OPEN_STATUS, expectedReturnDate: { lt: bounds.todayStart } }
    : { status: OPEN_STATUS, expectedReturnDate: { gte: bounds.todayStart, lt: bounds.soonEnd } };
}

export type GuaranteeWhereResult =
  | { ok: true; where: Prisma.ProjectGuaranteeWhereInput }
  | { ok: false; error: string };

/**
 * Filters for the paged list and the summary:
 *   status        Disetor | Selesai | Dibatalkan
 *   due           overdue | dueSoon (open guarantees only)
 *   partyId, guaranteeType (Penawaran | Pelaksanaan | Pemeliharaan | Lainnya)
 *   startDate/endDate (YYYY-MM-DD, deposit date in the business time zone)
 *   search        number, party, project name or reference number
 */
export function buildProjectGuaranteeWhere(
  query: Record<string, unknown>,
  now: Date = new Date(),
): GuaranteeWhereResult {
  const and: Prisma.ProjectGuaranteeWhereInput[] = [];

  const status = firstString(query.status);
  if (status) {
    if (!STATUSES.has(status)) return { ok: false, error: 'Status uang jaminan tidak dikenal.' };
    and.push({ status });
  }

  const due = firstString(query.due);
  if (due) {
    if (!DUE.has(due)) return { ok: false, error: 'Filter jatuh tempo tidak dikenal.' };
    and.push(dueWhere(due as DueState, dueBoundaries(now)));
  }

  const guaranteeType = firstString(query.guaranteeType);
  if (guaranteeType) {
    if (!TYPES.has(guaranteeType)) return { ok: false, error: 'Jenis jaminan tidak dikenal.' };
    and.push({ guaranteeType });
  }

  const partyId = firstString(query.partyId);
  if (partyId) and.push({ partyId });

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) {
    return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  }
  if (startDate || endDate) {
    and.push({ date: { ...localDayRange(startDate, endDate) } });
  }

  const search = firstString(query.search);
  if (search) {
    and.push({
      OR: [
        { guaranteeNumber: { contains: search, mode: 'insensitive' } },
        { party: { name: { contains: search, mode: 'insensitive' } } },
        { projectName: { contains: search, mode: 'insensitive' } },
        { referenceNo: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  return { ok: true, where: and.length ? { AND: and } : {} };
}

type DecimalLike = Prisma.Decimal | Decimal | number | string | null | undefined;
const toDecimal = (v: DecimalLike) => new Decimal(v === null || v === undefined ? 0 : v.toString());

export interface GuaranteeFigures {
  totalReturned: number;
  totalForfeited: number;
  outstanding: number;
}

export interface SettlementAmounts {
  returnAmount: DecimalLike;
  forfeitAmount: DecimalLike;
  isCancelled: boolean;
}

/** Same arithmetic as the legacy list: outstanding = amount − Σ active settlements (0 when cancelled). */
export function guaranteeFigures(
  amount: DecimalLike,
  status: string,
  settlements: readonly SettlementAmounts[],
): GuaranteeFigures {
  const active = settlements.filter((s) => !s.isCancelled);
  const totalReturned = active.reduce((sum, s) => sum.plus(toDecimal(s.returnAmount)), new Decimal(0));
  const totalForfeited = active.reduce((sum, s) => sum.plus(toDecimal(s.forfeitAmount)), new Decimal(0));
  const outstanding =
    status === CANCELLED_STATUS ? new Decimal(0) : toDecimal(amount).minus(totalReturned).minus(totalForfeited);
  return {
    totalReturned: totalReturned.toNumber(),
    totalForfeited: totalForfeited.toNumber(),
    outstanding: outstanding.toNumber(),
  };
}

/** Light projection used to sort, page and summarise. */
export interface GuaranteeLightRow extends GuaranteeFigures {
  id: string;
  guaranteeNumber: string;
  date: Date;
  expectedReturnDate: Date | null;
  status: string;
  amount: number;
  partyName: string;
  projectName: string;
  dueState: DueState | null;
}

export interface GuaranteeLightSource {
  id: string;
  guaranteeNumber: string;
  date: Date;
  expectedReturnDate: Date | null;
  status: string;
  amount: DecimalLike;
  projectName: string;
  party: { name: string } | null;
  settlements: readonly SettlementAmounts[];
}

export function toGuaranteeLightRow(src: GuaranteeLightSource, bounds: DueBoundaries): GuaranteeLightRow {
  return {
    id: src.id,
    guaranteeNumber: src.guaranteeNumber,
    date: src.date,
    expectedReturnDate: src.expectedReturnDate,
    status: src.status,
    amount: toDecimal(src.amount).toNumber(),
    partyName: src.party?.name ?? '',
    projectName: src.projectName,
    ...guaranteeFigures(src.amount, src.status, src.settlements),
    dueState: deriveDueState(src.status, src.expectedReturnDate, bounds),
  };
}

const text = (a: string, b: string) => a.localeCompare(b, 'id', { sensitivity: 'base' });

function compareField(a: GuaranteeLightRow, b: GuaranteeLightRow, field: ProjectGuaranteeSortField): number {
  switch (field) {
    case 'date':
      return a.date.getTime() - b.date.getTime();
    case 'expectedReturnDate':
      return (a.expectedReturnDate?.getTime() ?? 0) - (b.expectedReturnDate?.getTime() ?? 0);
    case 'guaranteeNumber':
      return a.guaranteeNumber.localeCompare(b.guaranteeNumber);
    case 'party':
      return text(a.partyName, b.partyName);
    case 'projectName':
      return text(a.projectName, b.projectName);
    default:
      return a[field] - b[field];
  }
}

/**
 * Sorted copy. Rows without an expected return date always go last when
 * sorting by it; ties are broken by document number in the same direction so
 * rows never jump between pages.
 */
export function sortGuarantees(
  rows: readonly GuaranteeLightRow[],
  sort: SortSpec<ProjectGuaranteeSortField>,
): GuaranteeLightRow[] {
  const sign = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (sort.field === 'expectedReturnDate') {
      const aNull = a.expectedReturnDate === null;
      const bNull = b.expectedReturnDate === null;
      if (aNull !== bNull) return aNull ? 1 : -1;
    }
    const primary = compareField(a, b, sort.field);
    if (primary !== 0) return primary * sign;
    return a.guaranteeNumber.localeCompare(b.guaranteeNumber) * sign;
  });
}

/** Sort and slice one page. `total` counts every matching row. */
export function pageGuarantees(
  rows: readonly GuaranteeLightRow[],
  options: { sort: SortSpec<ProjectGuaranteeSortField>; skip: number; limit: number },
): { ids: string[]; total: number } {
  const sorted = sortGuarantees(rows, options.sort);
  return {
    ids: sorted.slice(options.skip, options.skip + options.limit).map((r) => r.id),
    total: sorted.length,
  };
}

export interface ProjectGuaranteeSummary {
  /** Every guarantee matching the filters, cancelled ones included. */
  count: number;
  cancelledCount: number;
  /** Open guarantees (status Disetor) — same as the legacy `activeCount`. */
  activeCount: number;
  /** Fully settled guarantees (status Selesai). */
  settledCount: number;
  /** Sums below exclude cancelled guarantees (same as the legacy summary). */
  totalDeposited: number;
  totalReturned: number;
  totalForfeited: number;
  totalOutstanding: number;
  overdueCount: number;
  overdueOutstanding: number;
  dueSoonCount: number;
  dueSoonOutstanding: number;
}

const money = (d: Decimal) => d.toDecimalPlaces(2).toNumber();

export function summarizeProjectGuarantees(rows: readonly GuaranteeLightRow[]): ProjectGuaranteeSummary {
  let totalDeposited = new Decimal(0);
  let totalReturned = new Decimal(0);
  let totalForfeited = new Decimal(0);
  let totalOutstanding = new Decimal(0);
  let overdueOutstanding = new Decimal(0);
  let dueSoonOutstanding = new Decimal(0);
  let cancelledCount = 0;
  let activeCount = 0;
  let settledCount = 0;
  let overdueCount = 0;
  let dueSoonCount = 0;

  for (const r of rows) {
    if (r.status === CANCELLED_STATUS) {
      cancelledCount += 1;
      continue;
    }
    if (r.status === OPEN_STATUS) activeCount += 1;
    else if (r.status === 'Selesai') settledCount += 1;
    totalDeposited = totalDeposited.plus(r.amount);
    totalReturned = totalReturned.plus(r.totalReturned);
    totalForfeited = totalForfeited.plus(r.totalForfeited);
    totalOutstanding = totalOutstanding.plus(r.outstanding);
    if (r.dueState === 'overdue') {
      overdueCount += 1;
      overdueOutstanding = overdueOutstanding.plus(r.outstanding);
    } else if (r.dueState === 'dueSoon') {
      dueSoonCount += 1;
      dueSoonOutstanding = dueSoonOutstanding.plus(r.outstanding);
    }
  }

  return {
    count: rows.length,
    cancelledCount,
    activeCount,
    settledCount,
    totalDeposited: money(totalDeposited),
    totalReturned: money(totalReturned),
    totalForfeited: money(totalForfeited),
    totalOutstanding: money(totalOutstanding),
    overdueCount,
    overdueOutstanding: money(overdueOutstanding),
    dueSoonCount,
    dueSoonOutstanding: money(dueSoonOutstanding),
  };
}
