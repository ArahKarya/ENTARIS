import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { roleMiddleware } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import {
  CreateProductionCostStandardSchema,
  UpdateProductionCostStandardSchema,
} from '../../utils/schemas';
import { handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';

const router = Router();

// GET /api/inventory/production-cost-standards
// Filters: ?active=true|false, ?costSide=InputSide|OutputSide, ?itemId=<uuid>
router.get('/', async (req, res) => {
  try {
    const where: any = {};
    if (req.query.active !== undefined) {
      where.isActive = req.query.active === 'true';
    }
    if (typeof req.query.costSide === 'string') {
      where.costSide = req.query.costSide;
    }
    if (typeof req.query.itemId === 'string') {
      // Items get standards specific to them OR global standards (itemId null)
      where.OR = [{ itemId: req.query.itemId }, { itemId: null }];
    }

    const standards = await prisma.productionCostStandard.findMany({
      where,
      include: {
        costAccount: { select: { id: true, accountNumber: true, name: true } },
        item: { select: { id: true, code: true, name: true, unit: true } },
      },
      orderBy: [{ costSide: 'asc' }, { name: 'asc' }],
    });

    return res.json({ data: standards });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/production-cost-standards error');
    return res.status(500).json({ error: 'Gagal mengambil standar biaya produksi.' });
  }
});

// POST /api/inventory/production-cost-standards
router.post(
  '/',
  roleMiddleware(['Admin', 'Accountant']),
  async (req, res) => {
    const body = validateBody(CreateProductionCostStandardSchema, req.body, res);
    if (!body) return;

    try {
      const standard = await prisma.productionCostStandard.create({
        data: {
          name: body.name,
          description: body.description ?? null,
          costSide: body.costSide,
          basis: body.basis,
          defaultRate: body.defaultRate,
          costAccountId: body.costAccountId ?? null,
          itemId: body.itemId ?? null,
        },
        include: {
          costAccount: { select: { id: true, accountNumber: true, name: true } },
          item: { select: { id: true, code: true, name: true, unit: true } },
        },
      });
      return res.status(201).json(standard);
    } catch (error: any) {
      return handleRouteError(
        res,
        error,
        'POST /inventory/production-cost-standards',
        'Gagal membuat standar biaya produksi.',
      );
    }
  },
);

// PUT /api/inventory/production-cost-standards/:id
router.put(
  '/:id',
  roleMiddleware(['Admin', 'Accountant']),
  async (req, res) => {
    const body = validateBody(UpdateProductionCostStandardSchema, req.body, res);
    if (!body) return;

    try {
      const standard = await prisma.productionCostStandard.update({
        where: { id: req.params.id as string },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.description !== undefined ? { description: body.description } : {}),
          ...(body.costSide !== undefined ? { costSide: body.costSide } : {}),
          ...(body.basis !== undefined ? { basis: body.basis } : {}),
          ...(body.defaultRate !== undefined ? { defaultRate: body.defaultRate } : {}),
          ...(body.costAccountId !== undefined ? { costAccountId: body.costAccountId } : {}),
          ...(body.itemId !== undefined ? { itemId: body.itemId } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
        },
        include: {
          costAccount: { select: { id: true, accountNumber: true, name: true } },
          item: { select: { id: true, code: true, name: true, unit: true } },
        },
      });
      return res.json(standard);
    } catch (error: any) {
      if (error.code === 'P2025') {
        return res
          .status(404)
          .json({ error: 'Standar biaya produksi tidak ditemukan.' });
      }
      return handleRouteError(
        res,
        error,
        'PUT /inventory/production-cost-standards/:id',
        'Gagal memperbarui standar biaya produksi.',
      );
    }
  },
);

// DELETE /api/inventory/production-cost-standards/:id
// Soft-delete approach: if standard already used by a run, deactivate.
// Otherwise hard delete.
router.delete('/:id', roleMiddleware(['Admin']), async (req, res) => {
  const id = req.params.id as string;
  try {
    const usageCount = await prisma.productionRunCost.count({
      where: { standardId: id },
    });

    if (usageCount > 0) {
      await prisma.productionCostStandard.update({
        where: { id },
        data: { isActive: false },
      });
      return res.json({
        message: `Standar dinonaktifkan karena sudah dipakai di ${usageCount} produksi.`,
        deactivated: true,
      });
    }

    await prisma.productionCostStandard.delete({ where: { id } });
    return res.json({ message: 'Standar biaya produksi dihapus.', deleted: true });
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res
        .status(404)
        .json({ error: 'Standar biaya produksi tidak ditemukan.' });
    }
    return handleRouteError(
      res,
      error,
      'DELETE /inventory/production-cost-standards/:id',
      'Gagal menghapus standar biaya produksi.',
    );
  }
});

export default router;
