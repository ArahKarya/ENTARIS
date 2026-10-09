import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, requirePerm } from '../middleware/auth';
import { logger } from '../lib/logger';
import { runNotificationChecks } from '../services/notificationService';
import { firstString, parseListPaging } from '../utils/listQuery';

const router = Router();

/** Params that switch GET /api/notifications into the paged list mode. */
const NOTIFICATION_LIST_PARAMS = ['page', 'limit', 'isRead', 'type', 'search'] as const;

// GET /api/notifications — list for current user
//  • No params (NotificationBell): latest 50 + unreadCount — unchanged.
//  • With page / limit / isRead (true|false) / type / search (title, message): paged
//    { data, total, page, limit, unreadCount } for the /notifications page.
router.get('/', async (req: AuthRequest, res) => {
  const query = req.query as Record<string, unknown>;
  if (NOTIFICATION_LIST_PARAMS.some((key) => firstString(query[key]) !== undefined)) {
    try {
      const userId = req.user!.userId;
      const isRead = firstString(query.isRead);
      if (isRead && isRead !== 'true' && isRead !== 'false') {
        return res.status(400).json({ error: 'Filter status baca tidak valid.' });
      }
      const type = firstString(query.type);
      const search = firstString(query.search);
      const where: Prisma.NotificationWhereInput = {
        userId,
        ...(isRead ? { isRead: isRead === 'true' } : {}),
        ...(type ? { type } : {}),
        ...(search
          ? {
              OR: [
                { title: { contains: search, mode: 'insensitive' } },
                { message: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      };
      const { page, limit, skip } = parseListPaging(query, { defaultLimit: 25, maxLimit: 100 });
      const [notifications, total, unreadCount] = await Promise.all([
        prisma.notification.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip,
          take: limit,
        }),
        prisma.notification.count({ where }),
        prisma.notification.count({ where: { userId, isRead: false } }),
      ]);
      return res.json({ data: notifications, total, page, limit, unreadCount });
    } catch (error) {
      logger.error({ error }, 'GET /notifications (list) error');
      return res.status(500).json({ error: 'Gagal mengambil notifikasi.' });
    }
  }

  try {
    const userId = req.user!.userId;
    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.notification.count({
        where: { userId, isRead: false },
      }),
    ]);
    return res.json({ data: notifications, unreadCount });
  } catch (error) {
    logger.error({ error }, 'GET /notifications error');
    return res.status(500).json({ error: 'Gagal mengambil notifikasi.' });
  }
});

// GET /api/notifications/types — notification types present for the current
// user, with counts (feeds the type filter on /notifications).
router.get('/types', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const groups = await prisma.notification.groupBy({
      by: ['type'],
      where: { userId },
      _count: { _all: true },
      orderBy: { type: 'asc' },
    });
    return res.json({ data: groups.map((g) => ({ type: g.type, count: g._count._all })) });
  } catch (error) {
    logger.error({ error }, 'GET /notifications/types error');
    return res.status(500).json({ error: 'Gagal mengambil jenis notifikasi.' });
  }
});

// GET /api/notifications/unread-count
router.get('/unread-count', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const count = await prisma.notification.count({
      where: { userId, isRead: false },
    });
    return res.json({ count });
  } catch (error) {
    logger.error({ error }, 'GET /notifications/unread-count error');
    return res.status(500).json({ error: 'Gagal mengambil jumlah notifikasi.' });
  }
});

// PATCH /api/notifications/:id/read — mark single as read
router.patch('/:id/read', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    const notification = await prisma.notification.updateMany({
      where: { id: req.params.id as string, userId },
      data: { isRead: true },
    });
    if (notification.count === 0) {
      return res.status(404).json({ error: 'Notifikasi tidak ditemukan.' });
    }
    return res.json({ message: 'Notifikasi ditandai sudah dibaca.' });
  } catch (error) {
    logger.error({ error }, 'PATCH /notifications/:id/read error');
    return res.status(500).json({ error: 'Gagal menandai notifikasi.' });
  }
});

// PATCH /api/notifications/read-all — mark all as read for current user
router.patch('/read-all', async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.userId;
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
    return res.json({ message: 'Semua notifikasi ditandai sudah dibaca.' });
  } catch (error) {
    logger.error({ error }, 'PATCH /notifications/read-all error');
    return res.status(500).json({ error: 'Gagal menandai semua notifikasi.' });
  }
});

// POST /api/notifications/check: run notification checks manually (requires audit permission).
// Logic lives in notificationService.runNotificationChecks (shared with the daily cron).
router.post('/check', requirePerm('audit'), async (_req: AuthRequest, res) => {
  try {
    const { created } = await runNotificationChecks();
    return res.json({ message: `Pengecekan selesai. ${created} notifikasi baru dibuat.`, created });
  } catch (error) {
    logger.error({ error }, 'POST /notifications/check error');
    return res.status(500).json({ error: 'Gagal menjalankan pengecekan notifikasi.' });
  }
});

export default router;
