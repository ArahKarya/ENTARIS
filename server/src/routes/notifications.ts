import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { logger } from '../lib/logger';
import { runNotificationChecks } from '../services/notificationService';

const router = Router();

// GET /api/notifications — list for current user
router.get('/', async (req: AuthRequest, res) => {
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

// POST /api/notifications/check — Admin: trigger notification checks manually.
// Logika dipindah ke notificationService.runNotificationChecks (dipakai juga
// oleh cron harian).
router.post('/check', roleMiddleware(['Admin']), async (_req: AuthRequest, res) => {
  try {
    const { created } = await runNotificationChecks();
    return res.json({ message: `Pengecekan selesai. ${created} notifikasi baru dibuat.`, created });
  } catch (error) {
    logger.error({ error }, 'POST /notifications/check error');
    return res.status(500).json({ error: 'Gagal menjalankan pengecekan notifikasi.' });
  }
});

export default router;
