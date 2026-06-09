// GA Public QR — PUBLIC, no auth (ported from GA Monitor).
//
// Mounted at /api/ga/public by routes/ga/index.ts. Scanning an asset QR code
// resolves to limited, non-sensitive asset info plus a photo proxy that only
// serves photos belonging to the scanned QR's asset.
//
// IMPORTANT: this router is intentionally UNAUTHENTICATED. Only expose
// non-sensitive fields here — never acquisitionCost, customFields, notes that
// could leak internal data, or any internal IDs beyond what is needed to load
// photos.

import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { prisma } from '../../lib/prisma';
import { handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';

const router = Router();

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');

// ─── Public asset info by QR code ──────────────────────────────────
router.get('/:qrCode', async (req, res) => {
  try {
    const qr = await prisma.gaAssetQr.findUnique({
      where: { qrCode: String(req.params.qrCode) },
      include: {
        asset: {
          include: {
            category: { select: { code: true, name: true } },
            branch: { select: { name: true } },
            photos: {
              orderBy: { orderIdx: 'asc' },
              select: { id: true, caption: true },
            },
          },
        },
      },
    });

    if (!qr || !qr.asset) {
      return res.status(404).json({ error: 'Aset tidak ditemukan.' });
    }

    const a = qr.asset;
    return res.json({
      code: a.code,
      name: a.name,
      category: a.category?.name ?? null,
      categoryCode: a.category?.code ?? null,
      branch: a.branch?.name ?? null,
      status: a.status,
      condition: a.condition,
      location: a.location,
      photos: a.photos.map((p) => ({
        id: p.id,
        url: `/api/ga/public/${qr.qrCode}/photos/${p.id}.jpg`,
        caption: p.caption,
      })),
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/public/:qrCode', 'Gagal mengambil info aset.');
  }
});

// ─── Photo proxy: only photos belonging to this QR's asset are served ──
router.get('/:qrCode/photos/:photoId.:ext', async (req, res) => {
  try {
    const code = String(req.params.qrCode);
    const photoId = String(req.params.photoId);

    const qr = await prisma.gaAssetQr.findUnique({
      where: { qrCode: code },
      select: { assetId: true },
    });
    if (!qr) return res.status(404).end();

    const photo = await prisma.gaAssetPhoto.findFirst({
      where: { id: photoId, assetId: qr.assetId },
      select: { filePath: true },
    });
    if (!photo) return res.status(404).end();

    const full = path.normalize(path.join(UPLOADS_DIR, photo.filePath));
    // Path-traversal guard: resolved file must stay inside UPLOADS_DIR.
    if (!full.startsWith(UPLOADS_DIR + path.sep)) return res.status(400).end();
    if (!fs.existsSync(full)) return res.status(404).end();

    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.sendFile(full);
  } catch (error) {
    logger.error({ error }, 'GET /ga/public/:qrCode/photos error');
    return res.status(500).end();
  }
});

export default router;
