import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { handleRouteError } from '../utils/errors';

const router = Router();

// GET /api/audit-logs — paginated list, filterable (Admin only)
router.get('/', async (req, res) => {
  try {
    const {
      page = '1',
      limit = '50',
      userId,
      action,
      entityType,
      startDate,
      endDate,
    } = req.query;

    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: any = {};

    if (typeof userId === 'string' && userId) {
      where.userId = userId;
    }
    if (typeof action === 'string' && action) {
      where.action = action;
    }
    if (typeof entityType === 'string' && entityType) {
      where.entityType = { contains: entityType, mode: 'insensitive' };
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (typeof startDate === 'string' && startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (typeof endDate === 'string' && endDate) {
        // End of the day for endDate
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    const [data, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              fullName: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return res.json({ data, total, page: Number(page), limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /audit-logs', 'Gagal mengambil data audit log.');
  }
});

export default router;
