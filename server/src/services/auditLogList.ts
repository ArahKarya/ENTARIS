/**
 * Query building for the audit trail (GET /api/audit-logs, /summary, /facets).
 *
 * Backward compatible with the legacy endpoint: userId (exact), action (exact),
 * entityType (case-insensitive contains), page/limit (default 50, max 200) and
 * newest-first ordering are unchanged. New: `search` (entity id contains) and
 * `sort`. Dates use the business-day range (localDayRange) like every list.
 *
 * Values are returned as stored: secrets are redacted when the log is written
 * (middleware/auditTrail → utils/redact), never re-hydrated here.
 */
import type { Prisma } from '@prisma/client';
import { firstString, localDayRange, parseDateParam, parseSort, type SortSpec } from '../utils/listQuery';

export const AUDIT_SORT_FIELDS = ['createdAt', 'action', 'entityType'] as const;
export type AuditSortField = (typeof AUDIT_SORT_FIELDS)[number];
export const DEFAULT_AUDIT_SORT: SortSpec<AuditSortField> = { field: 'createdAt', dir: 'desc' };

export type AuditWhereResult = { ok: true; where: Prisma.AuditLogWhereInput } | { ok: false; error: string };

export function buildAuditLogWhere(query: Record<string, unknown>): AuditWhereResult {
  const where: Prisma.AuditLogWhereInput = {};

  const userId = firstString(query.userId);
  if (userId) where.userId = userId;

  const action = firstString(query.action);
  if (action) where.action = action;

  const entityType = firstString(query.entityType);
  if (entityType) where.entityType = { contains: entityType, mode: 'insensitive' };

  const search = firstString(query.search);
  if (search) where.entityId = { contains: search, mode: 'insensitive' };

  const startDate = parseDateParam(query.startDate);
  const endDate = parseDateParam(query.endDate);
  if (startDate === null || endDate === null) {
    return { ok: false, error: 'Format tanggal harus YYYY-MM-DD.' };
  }
  if (startDate || endDate) {
    where.createdAt = { ...localDayRange(startDate, endDate) };
  }

  return { ok: true, where };
}

/**
 * No `sort` param → legacy `{ createdAt: 'desc' }` exactly; an explicit sort
 * adds createdAt/id tie-breakers so pages never shift.
 */
export function buildAuditOrderBy(sortParam: unknown): Prisma.AuditLogOrderByWithRelationInput[] {
  if (firstString(sortParam) === undefined) return [{ createdAt: 'desc' }];
  const sort = parseSort(sortParam, AUDIT_SORT_FIELDS, DEFAULT_AUDIT_SORT);
  const order: Prisma.AuditLogOrderByWithRelationInput[] = [{ [sort.field]: sort.dir }];
  if (sort.field !== 'createdAt') order.push({ createdAt: 'desc' });
  order.push({ id: sort.dir });
  return order;
}

export interface AuditSummary {
  total: number;
  byAction: Record<string, number>;
}

export function summarizeAuditActions(groups: ReadonlyArray<{ action: string; _count: { _all: number } }>): AuditSummary {
  const byAction: Record<string, number> = {};
  let total = 0;
  for (const g of groups) {
    byAction[g.action] = g._count._all;
    total += g._count._all;
  }
  return { total, byAction };
}
