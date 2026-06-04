import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { UpdateTelegramConfigSchema, TestTelegramSchema } from '../utils/schemas';
import { handleRouteError } from '../utils/errors';
import { invalidateTelegramConfigCache, sendTelegramRaw } from '../services/telegramService';
import { logger } from '../lib/logger';

const router = Router();
const SLUG = 'default';

// GET /api/telegram/config — Admin. Token TIDAK pernah dikembalikan (hasToken saja).
router.get('/config', roleMiddleware(['Admin']), async (_req: AuthRequest, res) => {
  try {
    const cfg = await prisma.telegramConfig.findUnique({ where: { slug: SLUG } });
    return res.json({
      enabled: cfg?.enabled ?? false,
      chatId: cfg?.chatId ?? '',
      hasToken: !!cfg?.botToken,
      notifyApproval: cfg?.notifyApproval ?? true,
      notifyInvoiceOverdue: cfg?.notifyInvoiceOverdue ?? true,
      notifyLowStock: cfg?.notifyLowStock ?? true,
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /telegram/config', 'Gagal mengambil konfigurasi Telegram.');
  }
});

// PUT /api/telegram/config — Admin. botToken hanya di-update bila dikirim non-kosong.
router.put('/config', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  const body = validateBody(UpdateTelegramConfigSchema, req.body, res);
  if (!body) return;
  try {
    const data: any = {
      ...(body.enabled !== undefined && { enabled: body.enabled }),
      ...(body.chatId !== undefined && { chatId: body.chatId || null }),
      ...(body.notifyApproval !== undefined && { notifyApproval: body.notifyApproval }),
      ...(body.notifyInvoiceOverdue !== undefined && { notifyInvoiceOverdue: body.notifyInvoiceOverdue }),
      ...(body.notifyLowStock !== undefined && { notifyLowStock: body.notifyLowStock }),
      updatedBy: req.user!.userId,
    };
    // Token: hanya ubah jika string non-kosong dikirim (kosong = pertahankan).
    if (typeof body.botToken === 'string' && body.botToken.trim().length > 0) {
      data.botToken = body.botToken.trim();
    }
    await prisma.telegramConfig.upsert({
      where: { slug: SLUG },
      update: data,
      create: { slug: SLUG, ...data },
    });
    invalidateTelegramConfigCache();
    logger.info({ userId: req.user!.userId }, 'Telegram config updated');
    return res.json({ message: 'Konfigurasi Telegram disimpan.' });
  } catch (error) {
    return handleRouteError(res, error, 'PUT /telegram/config', 'Gagal menyimpan konfigurasi Telegram.');
  }
});

// POST /api/telegram/test — Admin. Kirim pesan uji (token/chatId dari body bila
// ada — untuk menguji nilai yang baru diketik — else pakai yang tersimpan).
router.post('/test', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  const body = validateBody(TestTelegramSchema, req.body, res);
  if (!body) return;
  try {
    const cfg = await prisma.telegramConfig.findUnique({ where: { slug: SLUG } });
    const token = (body.botToken && body.botToken.trim()) || cfg?.botToken || '';
    const chatId = (body.chatId && body.chatId.trim()) || cfg?.chatId || '';
    if (!token || !chatId) {
      return res.status(400).json({ error: 'Bot token dan Chat ID wajib diisi untuk tes.' });
    }
    const result = await sendTelegramRaw(
      token,
      chatId,
      '<b>✅ Tes Notifikasi</b>\nKoneksi Telegram berhasil. Notifikasi sistem akan dikirim ke chat ini.',
    );
    if (!result.ok) {
      return res.status(400).json({ error: `Gagal kirim: ${result.error}` });
    }
    return res.json({ message: 'Pesan uji terkirim ke Telegram.' });
  } catch (error) {
    return handleRouteError(res, error, 'POST /telegram/test', 'Gagal mengirim pesan uji.');
  }
});

export default router;
