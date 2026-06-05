import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreatePurchaseOrderSchema } from '../utils/schemas';
import { handleRouteError } from '../utils/errors';
import { submitPurchaseOrderInTx, cancelPurchaseOrderInTx } from '../services/purchaseOrderSubmit';
import { logger } from '../lib/logger';

const router = Router();

// PO: Admin + Accountant only (sesuai keputusan Phase 1)

// ─── GET / list ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { status, partyId, startDate, endDate, search, page = '1', limit = '50' } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: Prisma.PurchaseOrderWhereInput = {};
    if (status) where.status = status as any;
    if (partyId) where.partyId = partyId as string;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) (where.date as Prisma.DateTimeFilter).gte = new Date(String(startDate));
      if (endDate) (where.date as Prisma.DateTimeFilter).lte = new Date(String(endDate) + 'T23:59:59.999Z');
    }
    if (search) {
      const q = String(search).trim();
      if (q.length > 0) {
        where.OR = [
          { poNumber: { contains: q, mode: 'insensitive' } },
          { supplier: { name: { contains: q, mode: 'insensitive' } } },
        ];
      }
    }

    const [data, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          _count: { select: { items: true, goodsReceipts: true } },
        },
        orderBy: [{ date: 'desc' }, { poNumber: 'desc' }],
        skip,
        take,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    return res.json({ data, total, page: Number(page), limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /purchase-orders', 'Gagal mengambil daftar PO.');
  }
});

// ─── GET /:id detail ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: req.params.id as string },
      include: {
        items: { include: { inventoryItem: true } },
        supplier: true,
        goodsReceipts: {
          where: { status: { not: 'Cancelled' } },
          select: { id: true, sttNumber: true, date: true, status: true, invoiceId: true },
          orderBy: { date: 'desc' },
        },
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!po) return res.status(404).json({ error: 'PO tidak ditemukan.' });
    return res.json(po);
  } catch (error) {
    return handleRouteError(res, error, 'GET /purchase-orders/:id', 'Gagal mengambil detail PO.');
  }
});

// ─── POST / submit ────────────────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreatePurchaseOrderSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(
      (tx) => submitPurchaseOrderInTx(tx, body, req.user!.userId),
      { timeout: 15000 },
    );
    logger.info({ poId: result.id, userId: req.user!.userId }, 'PO submitted via API');
    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /purchase-orders', 'Gagal membuat PO.');
  }
});

// ─── POST /:id/cancel ─────────────────────────────────────────────────────
router.post('/:id/cancel', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(
      (tx) => cancelPurchaseOrderInTx(tx, req.params.id as string),
      { timeout: 15000 },
    );
    logger.info({ poId: result.id, userId: req.user!.userId }, 'PO cancelled via API');
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /purchase-orders/:id/cancel', 'Gagal membatalkan PO.');
  }
});

export default router;
