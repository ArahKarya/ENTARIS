// GA master data CRUD — ported from GA Monitor (server/src/routes/master.ts).
// Entities: branches, cost centers, asset categories, document types,
// inventory categories, locations.
//
// Mounted by index.ts under /api/ga/master with requirePerm (GET=view,
// writes=edit), so NO auth middleware inside this file.

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';

const router = Router();

// ── Zod schemas (mirrors GA utils/schemas.ts) ──────────────────────
const CodeNameSchema = z.object({
  code: z.string().min(1, 'Kode wajib diisi.').max(50),
  name: z.string().min(1, 'Nama wajib diisi.').max(200),
  isActive: z.boolean().default(true),
});

const BranchSchema = CodeNameSchema.extend({
  address: z.string().optional().nullable(),
});

const CostCenterSchema = CodeNameSchema.extend({
  branchId: z.string().min(1, 'Cabang wajib dipilih.'),
});

const AssetCategorySchema = CodeNameSchema.extend({
  customFieldsSchema: z.record(z.string(), z.unknown()).optional().nullable(),
  maintenanceChecklistSchema: z.record(z.string(), z.unknown()).optional().nullable(),
});

const DocumentTypeSchema = CodeNameSchema.extend({
  category: z.string().optional().nullable(),
  customFieldsSchema: z.record(z.string(), z.unknown()).optional().nullable(),
});

const InventoryCategorySchema = CodeNameSchema.extend({
  type: z.enum(['SPAREPART', 'CONSUMABLE']),
}).omit({ isActive: true });

const LocationSchema = CodeNameSchema.omit({ isActive: true }).extend({
  branchId: z.string().min(1, 'Cabang wajib dipilih.'),
});

function asJson(value: unknown): Prisma.InputJsonValue | undefined {
  return (value as Prisma.InputJsonValue | undefined) ?? undefined;
}

// ── Branches ───────────────────────────────────────────────────────
router.get('/branches', async (_req, res) => {
  try {
    const data = await prisma.gaBranch.findMany({ orderBy: { code: 'asc' } });
    return res.json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/master/branches', 'Gagal mengambil data cabang.');
  }
});

router.post('/branches', async (req: AuthRequest, res) => {
  const input = validateBody(BranchSchema, req.body, res);
  if (!input) return;
  try {
    const created = await prisma.gaBranch.create({ data: input });
    return res.status(201).json(created);
  } catch (error) {
    logger.error({ error }, 'Create GA branch error');
    return handleRouteError(res, error, 'POST /ga/master/branches', 'Gagal membuat cabang.');
  }
});

router.put('/branches/:id', async (req: AuthRequest, res) => {
  const input = validateBody(BranchSchema.partial(), req.body, res);
  if (!input) return;
  try {
    const updated = await prisma.gaBranch.update({
      where: { id: String(req.params.id) },
      data: input,
    });
    return res.json(updated);
  } catch (error) {
    logger.error({ error }, 'Update GA branch error');
    return handleRouteError(res, error, 'PUT /ga/master/branches/:id', 'Gagal update cabang.');
  }
});

router.delete('/branches/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.gaBranch.delete({ where: { id: String(req.params.id) } });
    return res.json({ message: 'Cabang dihapus.' });
  } catch (error) {
    logger.error({ error }, 'Delete GA branch error');
    return handleRouteError(res, error, 'DELETE /ga/master/branches/:id', 'Gagal menghapus cabang.');
  }
});

// ── Cost Centers ───────────────────────────────────────────────────
router.get('/cost-centers', async (_req, res) => {
  try {
    const data = await prisma.gaCostCenter.findMany({
      orderBy: { code: 'asc' },
      include: { branch: { select: { code: true, name: true } } },
    });
    return res.json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/master/cost-centers', 'Gagal mengambil data cost center.');
  }
});

router.post('/cost-centers', async (req: AuthRequest, res) => {
  const input = validateBody(CostCenterSchema, req.body, res);
  if (!input) return;
  try {
    const created = await prisma.gaCostCenter.create({ data: input });
    return res.status(201).json(created);
  } catch (error) {
    logger.error({ error }, 'Create GA cost center error');
    return handleRouteError(res, error, 'POST /ga/master/cost-centers', 'Gagal membuat cost center.');
  }
});

router.put('/cost-centers/:id', async (req: AuthRequest, res) => {
  const input = validateBody(CostCenterSchema.partial(), req.body, res);
  if (!input) return;
  try {
    const updated = await prisma.gaCostCenter.update({
      where: { id: String(req.params.id) },
      data: input,
    });
    return res.json(updated);
  } catch (error) {
    logger.error({ error }, 'Update GA cost center error');
    return handleRouteError(res, error, 'PUT /ga/master/cost-centers/:id', 'Gagal update cost center.');
  }
});

router.delete('/cost-centers/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.gaCostCenter.delete({ where: { id: String(req.params.id) } });
    return res.json({ message: 'Cost center dihapus.' });
  } catch (error) {
    logger.error({ error }, 'Delete GA cost center error');
    return handleRouteError(res, error, 'DELETE /ga/master/cost-centers/:id', 'Gagal menghapus cost center.');
  }
});

// ── Asset Categories ───────────────────────────────────────────────
router.get('/asset-categories', async (_req, res) => {
  try {
    const data = await prisma.gaAssetCategory.findMany({ orderBy: { code: 'asc' } });
    return res.json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/master/asset-categories', 'Gagal mengambil kategori aset.');
  }
});

router.post('/asset-categories', async (req: AuthRequest, res) => {
  const input = validateBody(AssetCategorySchema, req.body, res);
  if (!input) return;
  try {
    const created = await prisma.gaAssetCategory.create({
      data: {
        code: input.code,
        name: input.name,
        isActive: input.isActive,
        customFieldsSchema: asJson(input.customFieldsSchema),
        maintenanceChecklistSchema: asJson(input.maintenanceChecklistSchema),
      },
    });
    return res.status(201).json(created);
  } catch (error) {
    logger.error({ error }, 'Create GA asset category error');
    return handleRouteError(res, error, 'POST /ga/master/asset-categories', 'Gagal membuat kategori aset.');
  }
});

router.put('/asset-categories/:id', async (req: AuthRequest, res) => {
  const input = validateBody(AssetCategorySchema.partial(), req.body, res);
  if (!input) return;
  try {
    const updated = await prisma.gaAssetCategory.update({
      where: { id: String(req.params.id) },
      data: {
        code: input.code,
        name: input.name,
        isActive: input.isActive,
        customFieldsSchema: asJson(input.customFieldsSchema),
        maintenanceChecklistSchema: asJson(input.maintenanceChecklistSchema),
      },
    });
    return res.json(updated);
  } catch (error) {
    logger.error({ error }, 'Update GA asset category error');
    return handleRouteError(res, error, 'PUT /ga/master/asset-categories/:id', 'Gagal update kategori aset.');
  }
});

router.delete('/asset-categories/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.gaAssetCategory.delete({ where: { id: String(req.params.id) } });
    return res.json({ message: 'Kategori aset dihapus.' });
  } catch (error) {
    logger.error({ error }, 'Delete GA asset category error');
    return handleRouteError(res, error, 'DELETE /ga/master/asset-categories/:id', 'Gagal menghapus kategori aset.');
  }
});

// ── Document Types ─────────────────────────────────────────────────
router.get('/document-types', async (_req, res) => {
  try {
    const data = await prisma.gaDocumentType.findMany({ orderBy: { code: 'asc' } });
    return res.json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/master/document-types', 'Gagal mengambil jenis dokumen.');
  }
});

router.post('/document-types', async (req: AuthRequest, res) => {
  const input = validateBody(DocumentTypeSchema, req.body, res);
  if (!input) return;
  try {
    const created = await prisma.gaDocumentType.create({
      data: {
        code: input.code,
        name: input.name,
        category: input.category ?? null,
        isActive: input.isActive,
        customFieldsSchema: asJson(input.customFieldsSchema),
      },
    });
    return res.status(201).json(created);
  } catch (error) {
    logger.error({ error }, 'Create GA document type error');
    return handleRouteError(res, error, 'POST /ga/master/document-types', 'Gagal membuat jenis dokumen.');
  }
});

router.put('/document-types/:id', async (req: AuthRequest, res) => {
  const input = validateBody(DocumentTypeSchema.partial(), req.body, res);
  if (!input) return;
  try {
    const updated = await prisma.gaDocumentType.update({
      where: { id: String(req.params.id) },
      data: {
        code: input.code,
        name: input.name,
        category: input.category ?? null,
        isActive: input.isActive,
        customFieldsSchema: asJson(input.customFieldsSchema),
      },
    });
    return res.json(updated);
  } catch (error) {
    logger.error({ error }, 'Update GA document type error');
    return handleRouteError(res, error, 'PUT /ga/master/document-types/:id', 'Gagal update jenis dokumen.');
  }
});

router.delete('/document-types/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.gaDocumentType.delete({ where: { id: String(req.params.id) } });
    return res.json({ message: 'Jenis dokumen dihapus.' });
  } catch (error) {
    logger.error({ error }, 'Delete GA document type error');
    return handleRouteError(res, error, 'DELETE /ga/master/document-types/:id', 'Gagal menghapus jenis dokumen.');
  }
});

// ── Inventory Categories ───────────────────────────────────────────
router.get('/inventory-categories', async (_req, res) => {
  try {
    const data = await prisma.gaInventoryCategory.findMany({ orderBy: { code: 'asc' } });
    return res.json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/master/inventory-categories', 'Gagal mengambil kategori inventory.');
  }
});

router.post('/inventory-categories', async (req: AuthRequest, res) => {
  const input = validateBody(InventoryCategorySchema, req.body, res);
  if (!input) return;
  try {
    const created = await prisma.gaInventoryCategory.create({ data: input });
    return res.status(201).json(created);
  } catch (error) {
    logger.error({ error }, 'Create GA inventory category error');
    return handleRouteError(res, error, 'POST /ga/master/inventory-categories', 'Gagal membuat kategori inventory.');
  }
});

router.put('/inventory-categories/:id', async (req: AuthRequest, res) => {
  const input = validateBody(InventoryCategorySchema.partial(), req.body, res);
  if (!input) return;
  try {
    const updated = await prisma.gaInventoryCategory.update({
      where: { id: String(req.params.id) },
      data: input,
    });
    return res.json(updated);
  } catch (error) {
    logger.error({ error }, 'Update GA inventory category error');
    return handleRouteError(res, error, 'PUT /ga/master/inventory-categories/:id', 'Gagal update kategori inventory.');
  }
});

router.delete('/inventory-categories/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.gaInventoryCategory.delete({ where: { id: String(req.params.id) } });
    return res.json({ message: 'Kategori inventory dihapus.' });
  } catch (error) {
    logger.error({ error }, 'Delete GA inventory category error');
    return handleRouteError(res, error, 'DELETE /ga/master/inventory-categories/:id', 'Gagal menghapus kategori inventory.');
  }
});

// ── Locations ──────────────────────────────────────────────────────
router.get('/locations', async (_req, res) => {
  try {
    const data = await prisma.gaLocation.findMany({
      orderBy: { code: 'asc' },
      include: { branch: { select: { code: true, name: true } } },
    });
    return res.json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/master/locations', 'Gagal mengambil data lokasi.');
  }
});

router.post('/locations', async (req: AuthRequest, res) => {
  const input = validateBody(LocationSchema, req.body, res);
  if (!input) return;
  try {
    const created = await prisma.gaLocation.create({ data: input });
    return res.status(201).json(created);
  } catch (error) {
    logger.error({ error }, 'Create GA location error');
    return handleRouteError(res, error, 'POST /ga/master/locations', 'Gagal membuat lokasi.');
  }
});

router.put('/locations/:id', async (req: AuthRequest, res) => {
  const input = validateBody(LocationSchema.partial(), req.body, res);
  if (!input) return;
  try {
    const updated = await prisma.gaLocation.update({
      where: { id: String(req.params.id) },
      data: input,
    });
    return res.json(updated);
  } catch (error) {
    logger.error({ error }, 'Update GA location error');
    return handleRouteError(res, error, 'PUT /ga/master/locations/:id', 'Gagal update lokasi.');
  }
});

router.delete('/locations/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.gaLocation.delete({ where: { id: String(req.params.id) } });
    return res.json({ message: 'Lokasi dihapus.' });
  } catch (error) {
    logger.error({ error }, 'Delete GA location error');
    return handleRouteError(res, error, 'DELETE /ga/master/locations/:id', 'Gagal menghapus lokasi.');
  }
});

export default router;
