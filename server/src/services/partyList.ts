/**
 * Query building and aggregation for the "Pelanggan & Vendor" list
 * (GET /api/parties with list params, and GET /api/parties/summary).
 *
 * Backward compatibility: GET /api/parties is also used by every party picker
 * (`?type=Customer&limit=…`). Those calls carry none of the list-only params
 * (search, sort, isActive, hasOutstanding), so `isPartyListQuery` returns false
 * and the route keeps its legacy code path byte for byte.
 *
 * Read-only: nothing here touches outstandingAmount / deposit balance caches.
 */
import { PartyType, Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { firstString, parseSort, type SortSpec } from '../utils/listQuery';

/** Params that switch GET /api/parties into the paged list mode. */
export const PARTY_LIST_ONLY_PARAMS = ['search', 'sort', 'isActive', 'hasOutstanding'] as const;

export function isPartyListQuery(query: Record<string, unknown>): boolean {
  return PARTY_LIST_ONLY_PARAMS.some((key) => firstString(query[key]) !== undefined);
}

export const PARTY_SORT_FIELDS = ['name', 'outstanding', 'deposit'] as const;
export type PartySortField = (typeof PARTY_SORT_FIELDS)[number];
export const DEFAULT_PARTY_SORT: SortSpec<PartySortField> = { field: 'name', dir: 'asc' };

const PARTY_TYPES = new Set<string>(Object.values(PartyType));

export type PartyWhereResult =
  | { ok: true; where: Prisma.PartyWhereInput; type: PartyType | null }
  | { ok: false; error: string };

/**
 * Filters shared by the list and the summary:
 *   type            Customer | Supplier (both include partyType Both, as the
 *                   pickers do) or Both (only "Pelanggan & Vendor")
 *   isActive        true | false
 *   hasOutstanding  true → outstandingAmount > 0
 *   search          name, email, phone or NPWP (taxId), case-insensitive
 */
export function buildPartyWhere(query: Record<string, unknown>): PartyWhereResult {
  const and: Prisma.PartyWhereInput[] = [];

  const rawType = firstString(query.type);
  let type: PartyType | null = null;
  if (rawType) {
    if (!PARTY_TYPES.has(rawType)) return { ok: false, error: 'Jenis mitra tidak dikenal.' };
    type = rawType as PartyType;
    and.push(
      type === PartyType.Both
        ? { partyType: PartyType.Both }
        : { partyType: { in: [type, PartyType.Both] } },
    );
  }

  const isActive = firstString(query.isActive);
  if (isActive) {
    if (isActive !== 'true' && isActive !== 'false') {
      return { ok: false, error: 'Filter status mitra tidak valid.' };
    }
    and.push({ isActive: isActive === 'true' });
  }

  const hasOutstanding = firstString(query.hasOutstanding);
  if (hasOutstanding === 'true') and.push({ outstandingAmount: { gt: 0 } });
  else if (hasOutstanding === 'false') and.push({ outstandingAmount: { lte: 0 } });
  else if (hasOutstanding) return { ok: false, error: 'Filter saldo terutang tidak valid.' };

  const search = firstString(query.search);
  if (search) {
    and.push({
      OR: [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { taxId: { contains: search, mode: 'insensitive' } },
      ],
    });
  }

  return { ok: true, where: and.length > 0 ? { AND: and } : {}, type };
}

export function parsePartySort(value: unknown): SortSpec<PartySortField> {
  return parseSort(value, PARTY_SORT_FIELDS, DEFAULT_PARTY_SORT);
}

/**
 * Prisma orderBy for a sort spec. "deposit" uses the balance that matches the
 * tab (vendor deposit on the Vendor tab, customer deposit otherwise), then the
 * other one. Ties fall back to name, then id, so pages never shift.
 */
export function partyOrderBy(
  sort: SortSpec<PartySortField>,
  type: PartyType | null,
): Prisma.PartyOrderByWithRelationInput[] {
  const dir = sort.dir;
  const tail: Prisma.PartyOrderByWithRelationInput[] = [{ name: 'asc' }, { id: 'asc' }];
  switch (sort.field) {
    case 'outstanding':
      return [{ outstandingAmount: dir }, ...tail];
    case 'deposit':
      return type === PartyType.Supplier
        ? [{ depositBalance: dir }, { customerDepositBalance: dir }, ...tail]
        : [{ customerDepositBalance: dir }, { depositBalance: dir }, ...tail];
    default:
      return [{ name: dir }, { id: dir }];
  }
}

type DecimalLike = Prisma.Decimal | Decimal | number | string | null | undefined;
const toDecimal = (v: DecimalLike) => new Decimal(v === null || v === undefined ? 0 : v.toString());
const money = (d: Decimal) => d.toDecimalPlaces(2).toNumber();

export interface PartySummarySource {
  partyType: PartyType | string;
  isActive: boolean;
  outstandingAmount: DecimalLike;
  depositBalance: DecimalLike;
  customerDepositBalance: DecimalLike;
}

export interface PartySummary {
  total: number;
  activeCount: number;
  inactiveCount: number;
  byType: { Customer: number; Supplier: number; Both: number };
  /** Positive outstanding of Customer + Both parties (same rule as /dashboard). */
  totalReceivable: number;
  /** Positive outstanding of Supplier + Both parties (same rule as /dashboard). */
  totalPayable: number;
  /** Uang muka pelanggan (customerDepositBalance) of Customer + Both. */
  totalCustomerDeposit: number;
  /** Uang muka vendor (depositBalance) of Supplier + Both. */
  totalVendorDeposit: number;
  /** Parties with outstandingAmount > 0. */
  withOutstandingCount: number;
}

export function summarizeParties(rows: readonly PartySummarySource[]): PartySummary {
  const byType = { Customer: 0, Supplier: 0, Both: 0 };
  let receivable = new Decimal(0);
  let payable = new Decimal(0);
  let customerDeposit = new Decimal(0);
  let vendorDeposit = new Decimal(0);
  let activeCount = 0;
  let withOutstandingCount = 0;

  for (const r of rows) {
    if (r.partyType in byType) byType[r.partyType as keyof typeof byType] += 1;
    if (r.isActive) activeCount += 1;
    const outstanding = toDecimal(r.outstandingAmount);
    const positive = Decimal.max(outstanding, 0);
    if (outstanding.gt(0)) withOutstandingCount += 1;
    const isCustomer = r.partyType === PartyType.Customer || r.partyType === PartyType.Both;
    const isSupplier = r.partyType === PartyType.Supplier || r.partyType === PartyType.Both;
    if (isCustomer) {
      receivable = receivable.plus(positive);
      customerDeposit = customerDeposit.plus(toDecimal(r.customerDepositBalance));
    }
    if (isSupplier) {
      payable = payable.plus(positive);
      vendorDeposit = vendorDeposit.plus(toDecimal(r.depositBalance));
    }
  }

  return {
    total: rows.length,
    activeCount,
    inactiveCount: rows.length - activeCount,
    byType,
    totalReceivable: money(receivable),
    totalPayable: money(payable),
    totalCustomerDeposit: money(customerDeposit),
    totalVendorDeposit: money(vendorDeposit),
    withOutstandingCount,
  };
}
