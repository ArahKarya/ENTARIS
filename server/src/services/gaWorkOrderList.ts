/**
 * GA work order list. Without `page` it returns the bare array (used by the dashboard and AIRA);
 * with `page` it returns `{ data, total, page, limit }`. /work-orders/summary uses the same filters.
 */
import { Prisma } from '@prisma/client';
import { businessUtcOffset, firstString, localDayRange, parseDateParam, type SortSpec } from '../utils/listQuery';

export const WO_STATUSES = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CLOSED', 'CANCELLED'] as const;
export type WoStatus = (typeof WO_STATUSES)[number];
/** Statuses still needing work (what "aktif" and "terlambat" count). */
export const WO_ACTIVE_STATUSES: readonly WoStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS'];
/** Pseudo status for the list filter: every active status. */
export const WO_STATUS_ACTIVE = 'ACTIVE';

export const WO_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const WO_TYPES = ['PREVENTIVE', 'CORRECTIVE'] as const;
/** overdue: active and past due · dueSoon: active and due within 7 days. */
export const WO_DUE_FILTERS = ['overdue', 'dueSoon'] as const;
export const WO_DUE_SOON_DAYS = 7;

export const WO_SORT_FIELDS = ['code', 'reportedAt', 'dueAt', 'priority', 'status'] as const;
export type WoSortField = (typeof WO_SORT_FIELDS)[number];

const DAY_MS = 24 * 60 * 60 * 1000;

export type WoWhereResult = { ok: true; where: Prisma.GaWorkOrderWhereInput } | { ok: false; error: string };

const isOneOf = <T extends string>(list: readonly T[], v: string): v is T => (list as readonly string[]).includes(v);

/**
 * Filters for the paged list and the summary:
 *   status               OPEN … CANCELLED, or ACTIVE (OPEN + ASSIGNED + IN_PROGRESS)
 *   priority / type      enum values
 *   assetId              exact asset
 *   mine=true            assigned to the current user (wins over assignedToId)
 *   due                  overdue | dueSoon (both imply an active status)
 *   startDate/endDate    report date (YYYY-MM-DD, business time zone)
 *   search               code, title, component, asset code or name
 */
export function buildWorkOrderWhere(
  query: Record<string, unknown>,
  ctx: { userId?: string; now?: Date } = {},
): WoWhereResult {
  const now = ctx.now ?? new Date();
  const and: Prisma.GaWorkOrderWhereInput[] = [];

  const status = firstString(query.status);
  if (status) {
    if (status === WO_STATUS_ACTIVE) and.push({ status: { in: [...WO_ACTIVE_STATUSES] } });
    else if (isOneOf(WO_STATUSES, status)) and.push({ status });
    else return { ok: false, error: 'Status work order tidak dikenal.' };
  }

  const priority = firstString(query.priority);
  if (priority) {
    if (!isOneOf(WO_PRIORITIES, priority)) return { ok: false, error: 'Prioritas tidak dikenal.' };
    and.push({ priority });
  }

  const type = firstString(query.type);
  if (type) {
    if (!isOneOf(WO_TYPES, type)) return { ok: false, error: 'Tipe work order tidak dikenal.' };
    and.push({ type });
  }

  const assetId = firstString(query.assetId);
  if (assetId) and.push({ assetId });

  if (firstString(query.mine) === 'true' && ctx.userId) and.push({ assignedToId: ctx.userId });
  else {
    const assignedToId = firstString(query.assignedToId);
    if (assignedToId) and.push({ assignedToId });
  }

  const due = firstString(query.due);
  if (due) {
    if (!isOneOf(WO_DUE_FILTERS, due)) return { ok: false, error: 'Filter jatuh tempo tidak dikenal.' };
    const active = { status: { in: [...WO_ACTIVE_STATUSES] } };
    if (due === 'overdue') and.push({ ...active, dueAt: { lt: now } });
    else and.push({ ...active, dueAt: { gte: now, lt: new Date(now.getTime() + WO_DUE_SOON_DAYS * DAY_MS) } });
  }

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  if (startDate || endDate) and.push({ reportedAt: { ...localDayRange(startDate, endDate) } });

  const search = firstString(query.search);
  if (search) {
    const contains = { contains: search, mode: 'insensitive' as const };
    and.push({
      OR: [
        { code: contains },
        { title: contains },
        { component: contains },
        { asset: { code: contains } },
        { asset: { name: contains } },
      ],
    });
  }

  return { ok: true, where: and.length ? { AND: and } : {} };
}

/** Legacy order: open work first, most urgent first, newest first. */
export const WO_DEFAULT_ORDER: Prisma.GaWorkOrderOrderByWithRelationInput[] = [
  { status: 'asc' },
  { priority: 'desc' },
  { createdAt: 'desc' },
];

/** Requested sort plus the code as a stable tie-breaker; no sort → legacy order. */
export function workOrderOrderBy(sort: SortSpec<WoSortField> | null): Prisma.GaWorkOrderOrderByWithRelationInput[] {
  if (!sort) return WO_DEFAULT_ORDER;
  const { field, dir } = sort;
  if (field === 'code') return [{ code: dir }];
  if (field === 'dueAt') return [{ dueAt: { sort: dir, nulls: 'last' } }, { code: 'desc' }];
  return [{ [field]: dir }, { code: 'desc' }];
}

/** First instant of the current calendar month and of the next, in the business time zone. */
export function currentMonthRange(now: Date = new Date(), offset: string = businessUtcOffset()): { gte: Date; lt: Date } {
  const sign = offset.startsWith('-') ? -1 : 1;
  const [h, m] = offset.slice(1).split(':').map(Number);
  const local = new Date(now.getTime() + sign * (h * 60 + m) * 60 * 1000);
  const y = local.getUTCFullYear();
  const mo = local.getUTCMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const first = `${y}-${pad(mo + 1)}-01`;
  const next = mo === 11 ? `${y + 1}-01-01` : `${y}-${pad(mo + 2)}-01`;
  return {
    gte: new Date(`${first}T00:00:00.000${offset}`),
    lt: new Date(`${next}T00:00:00.000${offset}`),
  };
}

/** Where clauses for the KPI counts, each narrowing the list filter. */
export function workOrderSummaryWheres(base: Prisma.GaWorkOrderWhereInput, now: Date = new Date()) {
  const active = { status: { in: [...WO_ACTIVE_STATUSES] } };
  return {
    active: { AND: [base, active] },
    overdue: { AND: [base, active, { dueAt: { lt: now } }] },
    doneThisMonth: {
      AND: [base, { status: { in: ['DONE', 'CLOSED'] as WoStatus[] } }, { completedAt: currentMonthRange(now) }],
    },
  } satisfies Record<string, Prisma.GaWorkOrderWhereInput>;
}
