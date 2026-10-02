// GA Assets — physical asset registry (ported from GA Monitor).
//
// Mounted under /api/ga/assets with requirePerm('ga_assets') enforced by
// routes/ga/index.ts — do NOT add auth middleware here.
//
// Asset code auto-numbering: {CATEGORY_PREFIX}-{BRANCH_CODE}-{NNNN}, sequence
// per (category, branch), race-safe via a transaction-scoped advisory lock.
// Each asset gets a unique QR code string (crypto.randomUUID) stored in
// GaAssetQr — clients render the QR image themselves (no `qrcode` npm dep).
//
// NOTE: the XLSX bulk-import / template endpoints from the GA Monitor source
// were OMITTED — they depend on the `xlsx` package which is not an ERP dep
// (only `exceljs` is present). Port separately if bulk import is needed.

import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs/promises';
import multer from 'multer';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';

const router = Router();

const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
const ASSET_PHOTOS_DIR = path.join(UPLOADS_DIR, 'ga', 'assets');

// ─── Validation ────────────────────────────────────────────────────
// `code` is optional on create (server auto-generates from category+branch)
// but must be a non-empty string when explicitly provided.
const AssetSchema = z.object({
  code: z.string().max(100).optional().or(z.literal('')),
  name: z.string().min(1).max(200),
  categoryId: z.string().min(1),
  branchId: z.string().min(1),
  costCenterId: z.string().optional().nullable(),
  picUserId: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  acquisitionDate: z.string().optional().nullable(),
  acquisitionCost: z.number().nonnegative().optional().nullable(),
  status: z.enum(['ACTIVE', 'IN_REPAIR', 'RETIRED', 'LOST']).default('ACTIVE'),
  condition: z.enum(['GOOD', 'FAIR', 'POOR', 'BROKEN']).default('GOOD'),
  location: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  customFields: z.record(z.string(), z.unknown()).optional().nullable(),
});

// ─── Category prefix (ported from GA Monitor lib/categories.ts) ────
const CATEGORY_PREFIX: Record<string, string> = {
  KENDARAAN: 'KND',
  MESIN_PRODUKSI: 'MSN',
  ALAT_TIMBANG: 'ALT',
  IT_EQUIPMENT: 'IT',
  BANGUNAN: 'BLD',
  FURNITURE: 'FRN',
  GUDANG: 'GDG',
  EQUIPMENT: 'EQP',
  TANAH: 'TNH',
  // Kategori warisan merge Aset Tetap (kode FA_*) — selaraskan ke prefix rapi.
  FA_MESIN: 'MSN',
  FA_BANGUNAN: 'BLD',
  FA_TANAH: 'TNH',
  FA_PERALATAN: 'PRL',
};

function getCategoryPrefix(code: string): string {
  if (CATEGORY_PREFIX[code]) return CATEGORY_PREFIX[code];
  const cleaned = code.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return cleaned.slice(0, 3) || 'AST';
}

// ─── Photo upload (memory storage, max 5MB, images only) ───────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});

// ─── Helpers ───────────────────────────────────────────────────────
function buildAssetWhere(query: AuthRequest['query']): Prisma.GaAssetWhereInput {
  const where: Prisma.GaAssetWhereInput = {};
  // Support comma-separated multi-category filter (e.g. Gedung & Sewa page
  // groups Bangunan + Gudang under one view). Single id keeps working as-is.
  if (query.categoryId) {
    const ids = String(query.categoryId).split(',').map((s) => s.trim()).filter(Boolean);
    where.categoryId = ids.length > 1 ? { in: ids } : ids[0];
  }
  if (query.branchId) where.branchId = String(query.branchId);
  if (query.costCenterId) where.costCenterId = String(query.costCenterId);
  if (query.picUserId) where.picUserId = String(query.picUserId);
  if (query.status) where.status = query.status as Prisma.GaAssetWhereInput['status'];
  if (query.condition) where.condition = query.condition as Prisma.GaAssetWhereInput['condition'];

  if (query.acquisitionFrom || query.acquisitionTo) {
    const range: { gte?: Date; lte?: Date } = {};
    if (query.acquisitionFrom) {
      const d = new Date(String(query.acquisitionFrom));
      if (!isNaN(d.getTime())) range.gte = d;
    }
    if (query.acquisitionTo) {
      const d = new Date(String(query.acquisitionTo));
      if (!isNaN(d.getTime())) {
        d.setHours(23, 59, 59, 999);
        range.lte = d;
      }
    }
    if (Object.keys(range).length > 0) where.acquisitionDate = range;
  }

  if (query.q) {
    const q = String(query.q);
    where.OR = [
      { code: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { serialNumber: { contains: q, mode: 'insensitive' } },
      { location: { contains: q, mode: 'insensitive' } },
    ];
  }
  return where;
}

/**
 * Build the asset-code prefix `{CATEGORY_PREFIX}-{BRANCH_CODE}-` from
 * category + branch. Returns null if either is not found.
 */
async function resolveAssetCodePrefix(
  tx: Prisma.TransactionClient,
  categoryId: string,
  branchId: string,
): Promise<string | null> {
  const [category, branch] = await Promise.all([
    tx.gaAssetCategory.findUnique({ where: { id: categoryId }, select: { code: true } }),
    tx.gaBranch.findUnique({ where: { id: branchId }, select: { code: true } }),
  ]);
  if (!category || !branch) return null;
  const catPrefix = getCategoryPrefix(category.code);
  const brPrefix = branch.code.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 6) || 'BR';
  return `${catPrefix}-${brPrefix}-`;
}

/**
 * Compute the next sequential asset code for a given prefix, holding a
 * transaction-scoped advisory lock so concurrent generators serialize.
 * Caller must already be inside a transaction.
 */
async function nextAssetCodeInTx(tx: Prisma.TransactionClient, prefix: string): Promise<string> {
  let h = 0;
  for (let i = 0; i < prefix.length; i++) {
    h = ((h << 5) - h + prefix.charCodeAt(i)) | 0;
  }
  const lockKey = (h & 0x7fffffff) || 1;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey})`;

  const latest = await tx.gaAsset.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });

  const lastSeq = latest ? parseInt(latest.code.slice(prefix.length), 10) : 0;
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

function generateQrCode(): string {
  return `GA-${crypto.randomUUID()}`;
}

async function resolvePicNames(picUserIds: Array<string | null>): Promise<Map<string, string>> {
  const ids = [...new Set(picUserIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true },
  });
  return new Map(users.map((u) => [u.id, u.fullName]));
}

// ─── List ──────────────────────────────────────────────────────────
router.get('/', async (req: AuthRequest, res) => {
  try {
    const where = buildAssetWhere(req.query);
    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '100'), 10) || 100, 1), 500);
    const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
    const skip = (page - 1) * limit;

    const [items, total] = await prisma.$transaction([
      prisma.gaAsset.findMany({
        where,
        orderBy: { code: 'asc' },
        skip,
        take: limit,
        include: {
          category: { select: { code: true, name: true } },
          branch: { select: { code: true, name: true } },
          costCenter: { select: { code: true, name: true } },
          qr: { select: { qrCode: true } },
          fixedAsset: { select: { id: true, assetNumber: true, bookValue: true } },
          vehicleData: { select: { noPlat: true } },
        },
      }),
      prisma.gaAsset.count({ where }),
    ]);

    const picNames = await resolvePicNames(items.map((a) => a.picUserId));
    const data = items.map((a) => ({
      ...a,
      pic: a.picUserId ? { id: a.picUserId, fullName: picNames.get(a.picUserId) ?? null } : null,
    }));

    if (req.query.paginated === '1') {
      return res.json({ data, total, page, limit });
    }
    return res.json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/assets', 'Gagal mengambil data aset.');
  }
});

// ─── Next-code suggestion (must precede /:id) ──────────────────────
router.get('/_next-code', async (req: AuthRequest, res) => {
  const categoryId = String(req.query.categoryId ?? '');
  const branchId = String(req.query.branchId ?? '');
  if (!categoryId || !branchId) {
    return res.status(400).json({ error: 'categoryId & branchId wajib diisi.' });
  }

  try {
    const prefix = await resolveAssetCodePrefix(prisma, categoryId, branchId);
    if (!prefix) return res.status(404).json({ error: 'Kategori atau cabang tidak ditemukan.' });
    const code = await prisma.$transaction((tx) => nextAssetCodeInTx(tx, prefix));
    return res.json({ code });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/assets/_next-code', 'Gagal generate kode.');
  }
});

// ─── Detail ────────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const asset = await prisma.gaAsset.findUnique({
      where: { id: String(req.params.id) },
      include: {
        category: true,
        branch: true,
        costCenter: true,
        qr: true,
        photos: { orderBy: { orderIdx: 'asc' } },
        fixedAsset: true, // profil keuangan/penyusutan (EAM)
      },
    });
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan.' });

    const picNames = await resolvePicNames([asset.picUserId]);
    return res.json({
      ...asset,
      pic: asset.picUserId
        ? { id: asset.picUserId, fullName: picNames.get(asset.picUserId) ?? null }
        : null,
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/assets/:id', 'Gagal mengambil detail aset.');
  }
});

// ─── Create ────────────────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res) => {
  const input = validateBody(AssetSchema, req.body, res);
  if (!input) return;

  try {
    const asset = await prisma.$transaction(async (tx) => {
      // If client omits code (or sends empty), generate atomically inside this
      // transaction so concurrent creates can't collide on the same suggestion.
      let code = input.code?.trim() ?? '';
      if (!code) {
        const prefix = await resolveAssetCodePrefix(tx, input.categoryId, input.branchId);
        if (!prefix) {
          throw new Error('Kategori atau cabang tidak ditemukan untuk auto-generate kode.');
        }
        code = await nextAssetCodeInTx(tx, prefix);
      }

      const created = await tx.gaAsset.create({
        data: {
          code,
          name: input.name,
          categoryId: input.categoryId,
          branchId: input.branchId,
          costCenterId: input.costCenterId || null,
          picUserId: input.picUserId || null,
          serialNumber: input.serialNumber || null,
          acquisitionDate: input.acquisitionDate ? new Date(input.acquisitionDate) : null,
          acquisitionCost: input.acquisitionCost ?? null,
          status: input.status,
          condition: input.condition,
          location: input.location || null,
          notes: input.notes || null,
          customFields: (input.customFields as Prisma.InputJsonValue | undefined) ?? undefined,
        },
      });

      await tx.gaAssetQr.create({ data: { assetId: created.id, qrCode: generateQrCode() } });

      return created;
    });

    return res.status(201).json({ id: asset.id, code: asset.code });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/assets', 'Gagal membuat aset.');
  }
});

// ─── Update ────────────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const input = validateBody(AssetSchema.partial(), req.body, res);
  if (!input) return;

  try {
    const updated = await prisma.gaAsset.update({
      where: { id: String(req.params.id) },
      data: {
        code: input.code || undefined,
        name: input.name,
        categoryId: input.categoryId,
        branchId: input.branchId,
        costCenterId: input.costCenterId ?? null,
        picUserId: input.picUserId ?? null,
        serialNumber: input.serialNumber ?? null,
        acquisitionDate: input.acquisitionDate ? new Date(input.acquisitionDate) : null,
        acquisitionCost: input.acquisitionCost ?? null,
        status: input.status,
        condition: input.condition,
        location: input.location ?? null,
        notes: input.notes ?? null,
        customFields: (input.customFields as Prisma.InputJsonValue | undefined) ?? undefined,
      },
    });
    return res.json({ id: updated.id });
  } catch (error) {
    return handleRouteError(res, error, 'PUT /ga/assets/:id', 'Gagal update aset.');
  }
});

// ─── Bulk update ───────────────────────────────────────────────────
router.patch('/bulk/update', async (req: AuthRequest, res) => {
  const { ids, data } = req.body as { ids?: string[]; data?: Record<string, unknown> };
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids wajib berupa array non-kosong.' });
  }
  if (ids.length > 200) {
    return res.status(400).json({ error: 'Maksimal 200 aset per batch.' });
  }
  if (!data || typeof data !== 'object' || Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'data wajib berisi field yang akan diupdate.' });
  }

  const allowedFields = ['status', 'condition', 'branchId', 'costCenterId', 'picUserId', 'location'];
  const updateData: Record<string, unknown> = {};
  for (const key of Object.keys(data)) {
    if (!allowedFields.includes(key)) {
      return res.status(400).json({ error: `Field '${key}' tidak diizinkan untuk bulk update.` });
    }
    updateData[key] = data[key] ?? null;
  }

  try {
    const result = await prisma.gaAsset.updateMany({
      where: { id: { in: ids } },
      data: updateData,
    });
    return res.json({ updated: result.count });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/assets/bulk/update', 'Gagal bulk update aset.');
  }
});

// ─── Bulk delete ───────────────────────────────────────────────────
router.post('/bulk/delete', async (req: AuthRequest, res) => {
  const { ids } = req.body as { ids?: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids wajib berupa array non-kosong.' });
  }
  if (ids.length > 200) {
    return res.status(400).json({ error: 'Maksimal 200 aset per batch.' });
  }

  try {
    // Photo & QR rows cascade on asset delete (onDelete: Cascade), but we
    // delete photo files from disk first to avoid orphans.
    const photos = await prisma.gaAssetPhoto.findMany({
      where: { assetId: { in: ids } },
      select: { filePath: true },
    });
    await Promise.all(
      photos.map((p) => fs.unlink(path.join(UPLOADS_DIR, p.filePath)).catch(() => undefined)),
    );
    await prisma.gaAsset.deleteMany({ where: { id: { in: ids } } });
    return res.json({ deleted: ids.length });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/assets/bulk/delete', 'Gagal bulk delete aset.');
  }
});

// ─── PIC condition update ──────────────────────────────────────────
// Assigned PIC OR any user with ga_assets write permission (enforced by the
// mount). Since the mount already gates write access, we additionally allow
// the assigned PIC to update condition even without broader rights.
router.patch('/:id/condition', async (req: AuthRequest, res) => {
  const id = String(req.params.id);
  const condition = String(req.body?.condition || '');
  const rawNotes = req.body?.notes ? String(req.body.notes) : null;
  const notes = rawNotes ? rawNotes.slice(0, 2000) : null;

  const allowed = ['GOOD', 'FAIR', 'POOR', 'BROKEN'];
  if (!allowed.includes(condition)) {
    return res.status(400).json({ error: 'Kondisi tidak valid.' });
  }

  try {
    const asset = await prisma.gaAsset.findUnique({ where: { id }, select: { id: true } });
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan.' });

    const updated = await prisma.gaAsset.update({
      where: { id },
      data: {
        condition: condition as 'GOOD' | 'FAIR' | 'POOR' | 'BROKEN',
        notes: notes ?? undefined,
      },
    });
    return res.json({ id: updated.id, condition: updated.condition });
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /ga/assets/:id/condition', 'Gagal update kondisi.');
  }
});

// ─── Photo upload ──────────────────────────────────────────────────
router.post('/:id/photos', upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File wajib diupload.' });

  try {
    const asset = await prisma.gaAsset.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true },
    });
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan.' });

    await fs.mkdir(ASSET_PHOTOS_DIR, { recursive: true });
    const ext = req.file.mimetype === 'image/png' ? '.png' : req.file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const name = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(ASSET_PHOTOS_DIR, name), req.file.buffer);

    const photo = await prisma.gaAssetPhoto.create({
      data: {
        assetId: asset.id,
        filePath: path.join('ga', 'assets', name),
        caption: (req.body.caption as string) || null,
      },
    });

    return res.status(201).json(photo);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/assets/:id/photos', 'Gagal upload foto.');
  }
});

// ─── Photo delete ──────────────────────────────────────────────────
router.delete('/:id/photos/:photoId', async (req, res) => {
  try {
    const photo = await prisma.gaAssetPhoto.findUnique({ where: { id: String(req.params.photoId) } });
    if (photo) {
      await fs.unlink(path.join(UPLOADS_DIR, photo.filePath)).catch(() => undefined);
      await prisma.gaAssetPhoto.delete({ where: { id: String(req.params.photoId) } });
    }
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/assets/:id/photos/:photoId', 'Gagal menghapus foto.');
  }
});

export default router;
