import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { requireCap } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import {
  CreateProductionProcessSchema,
  UpdateProductionProcessSchema,
} from '../../utils/schemas';
import { handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';

const router = Router();

// GET /api/inventory/production-processes
// Filter: ?active=true|false (default: returns all)
router.get('/', async (req, res) => {
  try {
    const where: any = {};
    if (req.query.active !== undefined) {
      where.isActive = req.query.active === 'true';
    }
    const processes = await prisma.productionProcess.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return res.json({ data: processes });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/production-processes error');
    return res.status(500).json({ error: 'Gagal mengambil daftar proses produksi.' });
  }
});

// POST /api/inventory/production-processes
router.post(
  '/',
  async (req, res) => {
    const body = validateBody(CreateProductionProcessSchema, req.body, res);
    if (!body) return;
    try {
      const process = await prisma.productionProcess.create({
        data: {
          name: body.name.trim(),
          description: body.description ?? null,
          sortOrder: body.sortOrder ?? 0,
        },
      });
      return res.status(201).json(process);
    } catch (error: any) {
      if (error.code === 'P2002') {
        return res.status(409).json({ error: `Proses "${req.body?.name}" sudah ada.` });
      }
      return handleRouteError(
        res, error,
        'POST /inventory/production-processes',
        'Gagal membuat proses produksi.',
      );
    }
  },
);

// PUT /api/inventory/production-processes/:id
router.put(
  '/:id',
  async (req, res) => {
    const body = validateBody(UpdateProductionProcessSchema, req.body, res);
    if (!body) return;
    try {
      const process = await prisma.productionProcess.update({
        where: { id: req.params.id as string },
        data: {
          ...(body.name !== undefined ? { name: body.name.trim() } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
      });
      return res.json(process);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res.status(404).json({ error: 'Proses produksi tidak ditemukan.' });
      }
      if (error.code === 'P2002') {
        return res.status(409).json({ error: `Proses "${req.body?.name}" sudah ada.` });
      }
      return handleRouteError(
        res, error,
        'PUT /inventory/production-processes/:id',
        'Gagal memperbarui proses produksi.',
      );
    }
  },
);

// DELETE /api/inventory/production-processes/:id
// Soft-delete approach: if process already used by any run, deactivate it
// (preserves historical traceability). Otherwise hard delete.
router.delete('/:id', requireCap('doc.cancel'), async (req, res) => {
  const id = req.params.id as string;
  try {
    const usageCount = await prisma.productionRunProcess.count({
      where: { processId: id },
    });
    if (usageCount > 0) {
      await prisma.productionProcess.update({
        where: { id },
        data: { isActive: false },
      });
      return res.json({
        message: `Proses dinonaktifkan karena sudah dipakai di ${usageCount} run produksi.`,
        deactivated: true,
      });
    }
    await prisma.productionProcess.delete({ where: { id } });
    return res.json({ message: 'Proses produksi dihapus.', deleted: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Proses produksi tidak ditemukan.' });
    }
    return handleRouteError(
      res, error,
      'DELETE /inventory/production-processes/:id',
      'Gagal menghapus proses produksi.',
    );
  }
});

export default router;
