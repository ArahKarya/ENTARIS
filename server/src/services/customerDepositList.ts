/**
 * Query building, usage state and aggregation for the customer deposit list
 * (GET /api/customer-deposits?page=… and GET /api/customer-deposits/summary).
 *
 * A deposit's usage ("Aktif" / "Terpakai Sebagian" / "Terpakai") depends on
 * amounts computed from its applications and refunds, so it cannot be a plain
 * Prisma filter. The paged list therefore loads a light projection of every
 * deposit matching the DB-level filters, derives the figures here, filters by
 * usage state, sorts and slices — and only then loads full rows for the page.
 * The summary uses the same projection, so KPIs always describe the list.
 *
 * Read-only: nothing here touches GL entries or the customerDepositBalance cache.
 */
import { DocumentStatus, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { firstString, parseDateParam, type SortSpec } from '../utils/listQuery';

/** Remaining below this (rupiah) counts as fully used — same rule as the old page. */
export const REMAINING_EPSILON = 0.01;

/** Usage states derived from the amounts (Cancelled comes from the document status). */
export const DEPOSIT_USAGE_STATES = ['Active', 'PartiallyUsed', 'FullyUsed'] as const;
export type DepositUsageState = (typeof DEPOSIT_USAGE_STATES)[number];
export type DepositState = DepositUsageState | 'Cancelled';

export const CUSTOMER_DEPOSIT_SORT_FIELDS = [
  'date',
  'paymentNumber',
  'customer',
  'amount',
  'totalApplied',
  'remaining',
] as const;
export type CustomerDepositSortField = (typeof CUSTOMER_DEPOSIT_SORT_FIELDS)[number];
export const DEFAULT_CUSTOMER_DEPOSIT_SORT: SortSpec<CustomerDepositSortField> = { field: 'date', dir: 'desc' };

const DOCUMENT_STATUSES = new Set<string>(Object.values(DocumentStatus));
const USAGE_STATES = new Set<string>(DEPOSIT_USAGE_STATES);

export type DepositWhereResult =
  | { ok: true; where: Prisma.PaymentWhereInput; usage: DepositUsageState | null }
  | { ok: false; error: string };

/**
 * Filters for the paged list and the summary:
 *   status   Active | PartiallyUsed | FullyUsed (derived) or a DocumentStatus
 *            (Draft | Submitted | Cancelled)
 *   partyId, startDate/endDate (YYYY-MM-DD), search (number / customer name)
 */
export function buildCustomerDepositWhere(query: Record<string, unknown>): DepositWhereResult {
  const where: Prisma.PaymentWhereInput = { paymentType: 'CustomerDeposit' };
  let usage: DepositUsageState | null = null;

  const status = firstString(query.status);
  if (status) {
    if (USAGE_STATES.has(status)) {
      usage = status as DepositUsageState;
      where.status = { not: DocumentStatus.Cancelled };
    } else if (DOCUMENT_STATUSES.has(status)) {
      where.status = status as DocumentStatus;
    } else {
      return { ok: false, error: 'Status uang muka tidak dikenal.' };
    }
  }

  const partyId = firstString(query.partyId);
  if (partyId) where.partyId = partyId;

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) {
    return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  }
  if (startDate || endDate) {
    where.date = {
      ...(startDate ? { gte: new Date(startDate) } : {}),
      ...(endDate ? { lte: new Date(`${endDate}T23:59:59.999Z`) } : {}),
    };
  }

  const search = firstString(query.search);
  if (search) {
    where.OR = [
      { paymentNumber: { contains: search, mode: 'insensitive' } },
      { party: { name: { contains: search, mode: 'insensitive' } } },
    ];
  }

  return { ok: true, where, usage };
}

type DecimalLike = Prisma.Decimal | Decimal | number | string | null | undefined;

const toDecimal = (v: DecimalLike) => new Decimal(v === null || v === undefined ? 0 : v.toString());

export interface DepositFigures {
  totalApplied: number;
  totalRefunded: number;
  remaining: number;
}

/** Same arithmetic as the legacy list: remaining = amount − applied − refunded. */
export function depositFigures(
  amount: DecimalLike,
  refundedAmount: DecimalLike,
  applications: ReadonlyArray<{ appliedAmount: DecimalLike }>,
): DepositFigures {
  const totalApplied = applications.reduce((sum, app) => sum.plus(toDecimal(app.appliedAmount)), new Decimal(0));
  const refunded = toDecimal(refundedAmount);
  const remaining = toDecimal(amount).minus(totalApplied).minus(refunded);
  return {
    totalApplied: totalApplied.toNumber(),
    totalRefunded: refunded.toNumber(),
    remaining: remaining.toNumber(),
  };
}

/** Badge state shown on the list (identical rules to the previous page). */
export function deriveDepositState(status: string, totalApplied: number, remaining: number): DepositState {
  if (status === DocumentStatus.Cancelled) return 'Cancelled';
  if (remaining < REMAINING_EPSILON) return 'FullyUsed';
  return totalApplied > 0 ? 'PartiallyUsed' : 'Active';
}

/** Light projection used to filter, sort, page and summarise. */
export interface DepositLightRow extends DepositFigures {
  id: string;
  paymentNumber: string;
  date: Date;
  status: string;
  amount: number;
  customerName: string;
  state: DepositState;
}

export interface DepositLightSource {
  id: string;
  paymentNumber: string;
  date: Date;
  status: string;
  amount: DecimalLike;
  refundedAmount: DecimalLike;
  party: { name: string } | null;
  customerDepositApplications: ReadonlyArray<{ appliedAmount: DecimalLike }>;
}

export function toLightRow(src: DepositLightSource): DepositLightRow {
  const figures = depositFigures(src.amount, src.refundedAmount, src.customerDepositApplications);
  return {
    id: src.id,
    paymentNumber: src.paymentNumber,
    date: src.date,
    status: src.status,
    amount: toDecimal(src.amount).toNumber(),
    customerName: src.party?.name ?? '',
    ...figures,
    state: deriveDepositState(src.status, figures.totalApplied, figures.remaining),
  };
}

export function filterByUsage(rows: readonly DepositLightRow[], usage: DepositUsageState | null): DepositLightRow[] {
  return usage ? rows.filter((r) => r.state === usage) : [...rows];
}

function compareField(a: DepositLightRow, b: DepositLightRow, field: CustomerDepositSortField): number {
  switch (field) {
    case 'date':
      return a.date.getTime() - b.date.getTime();
    case 'paymentNumber':
      return a.paymentNumber.localeCompare(b.paymentNumber);
    case 'customer':
      return a.customerName.localeCompare(b.customerName, 'id', { sensitivity: 'base' });
    default:
      return a[field] - b[field];
  }
}

/** Sorted copy; ties broken by document number in the same direction so pages never shift. */
export function sortDeposits(
  rows: readonly DepositLightRow[],
  sort: SortSpec<CustomerDepositSortField>,
): DepositLightRow[] {
  const sign = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const primary = compareField(a, b, sort.field);
    if (primary !== 0) return primary * sign;
    return a.paymentNumber.localeCompare(b.paymentNumber) * sign;
  });
}

/** Filter by usage, sort and slice one page. `total` counts every matching row. */
export function pageDeposits(
  rows: readonly DepositLightRow[],
  options: { usage: DepositUsageState | null; sort: SortSpec<CustomerDepositSortField>; skip: number; limit: number },
): { ids: string[]; total: number } {
  const matching = sortDeposits(filterByUsage(rows, options.usage), options.sort);
  return {
    ids: matching.slice(options.skip, options.skip + options.limit).map((r) => r.id),
    total: matching.length,
  };
}

export interface CustomerDepositSummary {
  /** Every deposit matching the filters, cancelled ones included. */
  count: number;
  cancelledCount: number;
  /** Sums below exclude cancelled deposits (same as the previous KPI cards). */
  totalDeposit: number;
  totalApplied: number;
  totalRefunded: number;
  totalRemaining: number;
  /** Non-cancelled deposits with a usable remaining balance. */
  activeCount: number;
  byState: Record<DepositState, number>;
}

const money = (d: Decimal) => d.toDecimalPlaces(2).toNumber();

export function summarizeCustomerDeposits(rows: readonly DepositLightRow[]): CustomerDepositSummary {
  let totalDeposit = new Decimal(0);
  let totalApplied = new Decimal(0);
  let totalRefunded = new Decimal(0);
  let totalRemaining = new Decimal(0);
  let activeCount = 0;
  const byState: Record<DepositState, number> = { Active: 0, PartiallyUsed: 0, FullyUsed: 0, Cancelled: 0 };

  for (const r of rows) {
    byState[r.state] += 1;
    if (r.state === 'Cancelled') continue;
    totalDeposit = totalDeposit.plus(r.amount);
    totalApplied = totalApplied.plus(r.totalApplied);
    totalRefunded = totalRefunded.plus(r.totalRefunded);
    totalRemaining = totalRemaining.plus(r.remaining);
    if (r.remaining > REMAINING_EPSILON) activeCount += 1;
  }

  return {
    count: rows.length,
    cancelledCount: byState.Cancelled,
    totalDeposit: money(totalDeposit),
    totalApplied: money(totalApplied),
    totalRefunded: money(totalRefunded),
    totalRemaining: money(totalRemaining),
    activeCount,
    byState,
  };
}
