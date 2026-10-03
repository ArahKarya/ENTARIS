/**
 * Query building, usage state and aggregation for the vendor deposit list
 * (GET /api/vendor-deposits?page=… and GET /api/vendor-deposits/summary).
 *
 * Mirrors services/customerDepositList: a deposit's usage ("Aktif" /
 * "Terpakai Sebagian" / "Terpakai") depends on amounts computed from its
 * applications to purchase invoices and its cash refunds, so it cannot be a
 * plain Prisma filter. The paged list loads a light projection of every
 * deposit matching the DB-level filters, derives the figures here, filters by
 * usage state, sorts and slices — and only then loads full rows for the page.
 * The summary uses the same projection, so KPIs always describe the list.
 *
 * The amount arithmetic and badge rules are shared with customer deposits
 * (depositFigures / deriveDepositState) so both lists behave identically.
 *
 * Read-only: nothing here touches GL entries or the vendor depositBalance cache.
 */
import { DocumentStatus, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';
import {
  DEPOSIT_USAGE_STATES,
  REMAINING_EPSILON,
  depositFigures,
  deriveDepositState,
  type DepositFigures,
  type DepositState,
  type DepositUsageState,
} from './customerDepositList';

export { REMAINING_EPSILON, depositFigures, deriveDepositState };
export type { DepositState, DepositUsageState };

export const VENDOR_DEPOSIT_SORT_FIELDS = [
  'date',
  'paymentNumber',
  'supplier',
  'amount',
  'totalApplied',
  'remaining',
] as const;
export type VendorDepositSortField = (typeof VENDOR_DEPOSIT_SORT_FIELDS)[number];
export const DEFAULT_VENDOR_DEPOSIT_SORT: SortSpec<VendorDepositSortField> = { field: 'date', dir: 'desc' };

const DOCUMENT_STATUSES = new Set<string>(Object.values(DocumentStatus));
const USAGE_STATES = new Set<string>(DEPOSIT_USAGE_STATES);

export type VendorDepositWhereResult =
  | { ok: true; where: Prisma.PaymentWhereInput; usage: DepositUsageState | null }
  | { ok: false; error: string };

/**
 * Filters for the paged list and the summary:
 *   status   Active | PartiallyUsed | FullyUsed (derived) or a DocumentStatus
 *            (Draft | Submitted | Cancelled)
 *   partyId, startDate/endDate (YYYY-MM-DD), search (number / supplier name)
 */
export function buildVendorDepositWhere(query: Record<string, unknown>): VendorDepositWhereResult {
  const where: Prisma.PaymentWhereInput = { paymentType: 'VendorDeposit' };
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
    where.date = { ...localDayRange(startDate, endDate) };
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

/** Light projection used to filter, sort, page and summarise. */
export interface VendorDepositLightRow extends DepositFigures {
  id: string;
  paymentNumber: string;
  date: Date;
  status: string;
  amount: number;
  supplierName: string;
  state: DepositState;
}

export interface VendorDepositLightSource {
  id: string;
  paymentNumber: string;
  date: Date;
  status: string;
  amount: DecimalLike;
  refundedAmount: DecimalLike;
  party: { name: string } | null;
  depositApplications: ReadonlyArray<{ appliedAmount: DecimalLike }>;
}

export function toVendorLightRow(src: VendorDepositLightSource): VendorDepositLightRow {
  const figures = depositFigures(src.amount, src.refundedAmount, src.depositApplications);
  return {
    id: src.id,
    paymentNumber: src.paymentNumber,
    date: src.date,
    status: src.status,
    amount: toDecimal(src.amount).toNumber(),
    supplierName: src.party?.name ?? '',
    ...figures,
    state: deriveDepositState(src.status, figures.totalApplied, figures.remaining),
  };
}

export function filterVendorByUsage(
  rows: readonly VendorDepositLightRow[],
  usage: DepositUsageState | null,
): VendorDepositLightRow[] {
  return usage ? rows.filter((r) => r.state === usage) : [...rows];
}

function compareField(a: VendorDepositLightRow, b: VendorDepositLightRow, field: VendorDepositSortField): number {
  switch (field) {
    case 'date':
      return a.date.getTime() - b.date.getTime();
    case 'paymentNumber':
      return a.paymentNumber.localeCompare(b.paymentNumber);
    case 'supplier':
      return a.supplierName.localeCompare(b.supplierName, 'id', { sensitivity: 'base' });
    default:
      return a[field] - b[field];
  }
}

/** Sorted copy; ties broken by document number in the same direction so pages never shift. */
export function sortVendorDeposits(
  rows: readonly VendorDepositLightRow[],
  sort: SortSpec<VendorDepositSortField>,
): VendorDepositLightRow[] {
  const sign = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const primary = compareField(a, b, sort.field);
    if (primary !== 0) return primary * sign;
    return a.paymentNumber.localeCompare(b.paymentNumber) * sign;
  });
}

/** Filter by usage, sort and slice one page. `total` counts every matching row. */
export function pageVendorDeposits(
  rows: readonly VendorDepositLightRow[],
  options: { usage: DepositUsageState | null; sort: SortSpec<VendorDepositSortField>; skip: number; limit: number },
): { ids: string[]; total: number } {
  const matching = sortVendorDeposits(filterVendorByUsage(rows, options.usage), options.sort);
  return {
    ids: matching.slice(options.skip, options.skip + options.limit).map((r) => r.id),
    total: matching.length,
  };
}

export interface VendorDepositSummary {
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

export function summarizeVendorDeposits(rows: readonly VendorDepositLightRow[]): VendorDepositSummary {
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
