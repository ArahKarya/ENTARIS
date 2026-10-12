// Data uji coba lintas modul (mode eksklusif). Pembuatan berjalan di latar lewat handler API asli;
// penghapusan mengosongkan seluruh tabel transaksi dan master yang dibuat demo.

import { Router, Response } from 'express';
import { z } from 'zod';
import { AuthRequest, requirePerm } from '../../middleware/auth';
import { logger } from '../../lib/logger';
import { hasCap } from '../../services/permissionService';
import { activeDemoBatch, countUserChangesSince, findNonEmptyDataTables, hasLegacyDummyData } from '../../services/demoData/guard';
import { DemoStartBlocked, startDemoGeneration } from '../../services/demoData/runner';
import { wipeDemoData } from '../../services/demoData/wipe';

const router = Router();

/** Generating and deleting demo data both rewrite every transaction table: same gate for both. */
async function canManageDemo(req: AuthRequest, res: Response): Promise<boolean> {
  if (await hasCap(req.user!.role, 'approval.bypass')) return true;
  res.status(403).json({ error: 'Hanya pengguna yang boleh melewati persetujuan yang dapat mengelola data uji coba.' });
  return false;
}

const BLOCK_MESSAGES = {
  demo_exists: 'Data uji coba sudah ada. Hapus terlebih dahulu sebelum membuat ulang.',
  legacy_dummy: 'Data dummy versi lama masih ada. Hapus data dummy lama terlebih dahulu.',
  not_empty: 'Data uji coba hanya bisa dibuat saat belum ada transaksi.',
} as const;

// GET /api/settings/demo-data: status batch terakhir + apakah pembuatan bisa dimulai.
router.get('/demo-data', requirePerm('settings'), async (_req, res: Response) => {
  try {
    const [batch, legacy, blockingTables] = await Promise.all([activeDemoBatch(), hasLegacyDummyData(), findNonEmptyDataTables()]);
    const userChanges = batch ? await countUserChangesSince(batch.startedAt) : 0;
    return res.json({ batch, legacy: legacy && !batch, blockingTables: batch ? [] : blockingTables, userChanges });
  } catch (error) {
    logger.error({ error }, 'GET /settings/demo-data error');
    return res.status(500).json({ error: 'Gagal memuat status data uji coba.' });
  }
});

// POST /api/settings/demo-data/generate: mulai pembuatan di latar (202 + batchId).
router.post('/demo-data/generate', requirePerm('settings'), async (req: AuthRequest, res: Response) => {
  const user = req.user!;
  if (!(await canManageDemo(req, res))) return;
  try {
    const batchId = await startDemoGeneration({ id: user.userId, role: user.role });
    return res.status(202).json({ batchId });
  } catch (error) {
    if (error instanceof DemoStartBlocked) {
      const { block } = error;
      return res.status(409).json({ error: BLOCK_MESSAGES[block.code], code: block.code, ...(block.code === 'not_empty' ? { tables: block.tables } : {}) });
    }
    logger.error({ error }, 'POST /settings/demo-data/generate error');
    return res.status(500).json({ error: 'Gagal memulai pembuatan data uji coba.' });
  }
});

const DeleteSchema = z.object({ confirmation: z.literal('HAPUS') });

// POST /api/settings/demo-data/delete: kosongkan semua transaksi + master demo (ketik HAPUS).
router.post('/demo-data/delete', requirePerm('settings'), async (req: AuthRequest, res: Response) => {
  if (!(await canManageDemo(req, res))) return;
  if (!DeleteSchema.safeParse(req.body).success) {
    return res.status(400).json({ error: 'Ketik HAPUS untuk mengonfirmasi.' });
  }
  try {
    const batch = await activeDemoBatch();
    if (!batch) return res.status(404).json({ error: 'Tidak ada data uji coba.' });
    if (batch.status === 'running') return res.status(409).json({ error: 'Data uji coba masih dibuat. Tunggu sampai selesai.' });
    const result = await wipeDemoData();
    logger.info({ result, userId: req.user!.userId }, 'Demo data deleted');
    return res.json({ message: 'Data uji coba dihapus.', result });
  } catch (error) {
    logger.error({ error }, 'POST /settings/demo-data/delete error');
    return res.status(500).json({ error: 'Gagal menghapus data uji coba.' });
  }
});

export default router;
