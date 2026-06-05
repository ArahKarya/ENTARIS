import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { requireCap } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreateServiceItemSchema, UpdateServiceItemSchema } from '../utils/schemas';
import { handleRouteError } from '../utils/errors';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/service-items
router.get('/', async (req, res) => {
  try {
    const { search, isActive } = req.query;

    const where: Record<string, unknown> = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { code: { contains: search as string, mode: 'insensitive' } },
        { name: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const items = await prisma.serviceItem.findMany({
      where,
      include: { account: { select: { id: true, accountNumber: true, name: true } } },
      orderBy: { code: 'asc' },
    });

    return res.json({ data: items });
  } catch (error) {
    logger.error({ error }, 'GET /service-items error');
    return res.status(500).json({ error: 'Gagal mengambil data layanan.' });
  }
});

// POST /api/service-items
router.post('/', async (req, res) => {
  const body = validateBody(CreateServiceItemSchema, req.body, res);
  if (!body) return;

  try {
    const item = await prisma.serviceItem.create({
      data: {
        code: body.code,
        name: body.name,
        unit: body.unit,
        defaultRate: body.defaultRate,
        accountId: body.accountId,
        description: body.description,
      },
      include: { account: { select: { id: true, accountNumber: true, name: true } } },
    });

    return res.status(201).json(item);
  } catch (error: unknown) {
    return handleRouteError(res, error, 'POST /service-items', 'Gagal menyimpan layanan.');
  }
});

// PATCH /api/service-items/:id
router.patch('/:id', async (req, res) => {
  const body = validateBody(UpdateServiceItemSchema, req.body, res);
  if (!body) return;

  try {
    const item = await prisma.serviceItem.update({
      where: { id: req.params.id as string },
      data: body,
      include: { account: { select: { id: true, accountNumber: true, name: true } } },
    });

    return res.json(item);
  } catch (error: unknown) {
    return handleRouteError(res, error, 'PATCH /service-items/:id', 'Gagal mengubah layanan.');
  }
});

// DELETE /api/service-items/:id (soft delete)
router.delete('/:id', requireCap('doc.cancel'), async (req, res) => {
  try {
    await prisma.serviceItem.update({
      where: { id: req.params.id as string },
      data: { isActive: false },
    });

    return res.json({ success: true });
  } catch (error: unknown) {
    return handleRouteError(res, error, 'DELETE /service-items/:id', 'Gagal menghapus layanan.');
  }
});

export default router;
