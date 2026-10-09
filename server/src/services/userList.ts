/**
 * Query building for GET /api/users and /api/users/summary. Without role/status/sort the result
 * matches the legacy endpoint (search on fullName/email/username, newest first).
 * Never selects passwordHash; the route reduces telegramChatId to a boolean.
 */
import type { Prisma } from '@prisma/client';
import { firstString, parseSort, type SortSpec } from '../utils/listQuery';

export const USER_STATUSES = ['active', 'inactive'] as const;
export type UserStatusFilter = (typeof USER_STATUSES)[number];

export const USER_SORT_FIELDS = ['fullName', 'username', 'email', 'role', 'lastLoginAt', 'createdAt'] as const;
export type UserSortField = (typeof USER_SORT_FIELDS)[number];
export const DEFAULT_USER_SORT: SortSpec<UserSortField> = { field: 'createdAt', dir: 'desc' };

export type UserWhereResult = { ok: true; where: Prisma.UserWhereInput } | { ok: false; error: string };

/**
 * Filters:
 *   search  fullName / email / username (case-insensitive contains) — legacy
 *   role    exact role key
 *   status  active | inactive (isActive)
 */
export function buildUserWhere(query: Record<string, unknown>): UserWhereResult {
  const where: Prisma.UserWhereInput = {};

  // Legacy route used the raw (untrimmed) string when it had non-blank content.
  const rawSearch = query.search;
  if (typeof rawSearch === 'string' && rawSearch.trim()) {
    where.OR = [
      { fullName: { contains: rawSearch, mode: 'insensitive' } },
      { email: { contains: rawSearch, mode: 'insensitive' } },
      { username: { contains: rawSearch, mode: 'insensitive' } },
    ];
  }

  const role = firstString(query.role);
  if (role) where.role = role as Prisma.UserWhereInput['role'];

  const status = firstString(query.status);
  if (status) {
    if (!(USER_STATUSES as readonly string[]).includes(status)) {
      return { ok: false, error: 'Status pengguna tidak dikenal.' };
    }
    where.isActive = status === 'active';
  }

  return { ok: true, where };
}

/**
 * Prisma orderBy. No `sort` param → the legacy `{ createdAt: 'desc' }` exactly;
 * an explicit sort adds `id` as tie-breaker so pages never shift.
 */
export function buildUserOrderBy(sortParam: unknown): Prisma.UserOrderByWithRelationInput[] {
  if (firstString(sortParam) === undefined) return [{ createdAt: 'desc' }];
  const sort = parseSort(sortParam, USER_SORT_FIELDS, DEFAULT_USER_SORT);
  const primary: Prisma.UserOrderByWithRelationInput =
    sort.field === 'lastLoginAt'
      ? { lastLoginAt: { sort: sort.dir, nulls: 'last' } }
      : { [sort.field]: sort.dir };
  return [primary, { id: sort.dir }];
}

export interface UserSummary {
  total: number;
  active: number;
  inactive: number;
  telegramLinked: number;
}

/** KPI counts under the list filters (status filter applies too). */
export function summarizeUsers(
  rows: ReadonlyArray<{ isActive: boolean; telegramChatId: string | null }>,
): UserSummary {
  let active = 0;
  let telegramLinked = 0;
  for (const r of rows) {
    if (r.isActive) active += 1;
    if (r.telegramChatId) telegramLinked += 1;
  }
  return { total: rows.length, active, inactive: rows.length - active, telegramLinked };
}
