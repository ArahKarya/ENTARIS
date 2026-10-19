import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { handleRouteError } from '../utils/errors';
import { parseListPaging } from '../utils/listQuery';
import { buildAuditLogWhere, buildAuditOrderBy, summarizeAuditActions } from '../services/auditLogList';

const router = Router();

const USER_INCLUDE = { user: { select: { fullName: true, email: true } } } as const;

// GET /api/audit-logs — paginated list, filterable (gated by requirePerm('audit') in index.ts)
// Legacy contract kept: ?page&limit(default 50, max 200)&userId&action&entityType&startDate&endDate
// → { data, total, page, limit }. New optional params: search (entity id), sort.
router.get('/', async (req, res) => {
  try {
    const built = buildAuditLogWhere(req.query);
    if (!built.ok) return res.status(400).json({ error: built.error });
    const { page, limit: take, skip } = parseListPaging(req.query, { defaultLimit: 50, maxLimit: 200 });

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where: built.where,
        include: USER_INCLUDE,
        orderBy: buildAuditOrderBy(req.query.sort),
        skip,
        take,
      }),
      prisma.auditLog.count({ where: built.where }),
    ]);

    return res.json({ data, total, page, limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /audit-logs', 'Gagal mengambil data audit log.');
  }
});

// GET /api/audit-logs/summary — counts per action with the same filters as the list
router.get('/summary', async (req, res) => {
  try {
    const built = buildAuditLogWhere(req.query);
    if (!built.ok) return res.status(400).json({ error: built.error });
    const groups = await prisma.auditLog.groupBy({
      by: ['action'],
      where: built.where,
      _count: { _all: true },
    });
    return res.json(summarizeAuditActions(groups));
  } catch (error) {
    return handleRouteError(res, error, 'GET /audit-logs/summary', 'Gagal mengambil ringkasan audit log.');
  }
});

// GET /api/audit-logs/facets — filter options: actions, entity types and users that appear in the log
router.get('/facets', async (_req, res) => {
  try {
    const [actions, entityTypes, userIds] = await Promise.all([
      prisma.auditLog.findMany({ distinct: ['action'], select: { action: true }, orderBy: { action: 'asc' } }),
      prisma.auditLog.findMany({ distinct: ['entityType'], select: { entityType: true }, orderBy: { entityType: 'asc' } }),
      prisma.auditLog.findMany({ distinct: ['userId'], select: { userId: true } }),
    ]);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds.map((u) => u.userId) } },
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    return res.json({
      actions: actions.map((a) => a.action),
      entityTypes: entityTypes.map((e) => e.entityType),
      users,
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /audit-logs/facets', 'Gagal mengambil opsi filter audit log.');
  }
});

// GET /api/audit-logs/:id — one entry (deep link ?log=<id> on the audit page)
router.get('/:id', async (req, res) => {
  try {
    const log = await prisma.auditLog.findUnique({ where: { id: String(req.params.id) }, include: USER_INCLUDE });
    if (!log) return res.status(404).json({ error: 'Catatan audit tidak ditemukan.' });
    return res.json(log);
  } catch (error) {
    return handleRouteError(res, error, 'GET /audit-logs/:id', 'Gagal mengambil catatan audit.');
  }
});

export default router;
