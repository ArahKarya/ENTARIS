import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreateGoodsReceiptSchema } from '../utils/schemas';
import { handleRouteError } from '../utils/errors';
import { submitGoodsReceiptInTx } from '../services/goodsReceiptSubmit';
import { cancelGoodsReceiptInTx } from '../services/goodsReceiptCancel';
import { logger } from '../lib/logger';

const router = Router();


// ─── GET / list ───────────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const {
      status,
      partyId,
      startDate,
      endDate,
      search,
      includeLegacy,
      page = '1',
      limit = '50',
    } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: Prisma.GoodsReceiptWhereInput = {};
    // Derived "Invoiced" state — STT enum hanya Submitted/Cancelled.
    if (status === 'Invoiced') {
      where.status = 'Submitted';
      where.invoiceId = { not: null };
    } else if (status === 'Submitted') {
      where.status = 'Submitted';
      where.invoiceId = null;
    } else if (status === 'Cancelled') {
      where.status = 'Cancelled';
    }
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
          { sttNumber: { contains: q, mode: 'insensitive' } },
          { supplier: { name: { contains: q, mode: 'insensitive' } } },
        ];
      }
    }
    // By default exclude legacy backfill STTs from main list (they clutter UI;
    // user typically only cares about real STTs going forward).
    if (includeLegacy !== 'true') where.isLegacyBackfill = false;

    const [data, total] = await Promise.all([
      prisma.goodsReceipt.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          purchaseOrder: { select: { id: true, poNumber: true } },
          _count: { select: { items: true } },
        },
        orderBy: [{ date: 'desc' }, { sttNumber: 'desc' }],
        skip,
        take,
      }),
      prisma.goodsReceipt.count({ where }),
    ]);

    return res.json({ data, total, page: Number(page), limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /goods-receipts', 'Gagal mengambil daftar STT/BPB.');
  }
});

// ─── GET /pending — for PI modal to pick STT not yet invoiced ──────────────
router.get('/pending', async (req, res) => {
  try {
    const { partyId } = req.query;
    if (!partyId || typeof partyId !== 'string') {
      return res.status(400).json({ error: 'partyId wajib diisi.' });
    }
    const data = await prisma.goodsReceipt.findMany({
      where: {
        partyId,
        status: 'Submitted',
        invoiceId: null,
        isLegacyBackfill: false,
        // STT barang titipan (repros) tidak pernah di-invoice ke PI.
        isCustomerOwned: false,
      },
      include: {
        items: { include: { inventoryItem: true, warehouse: true } },
        supplier: { select: { id: true, name: true } },
      },
      orderBy: { date: 'asc' },
    });
    return res.json({ data });
  } catch (error) {
    return handleRouteError(res, error, 'GET /goods-receipts/pending', 'Gagal mengambil STT pending.');
  }
});

// ─── GET /:id detail ──────────────────────────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const gr = await prisma.goodsReceipt.findUnique({
      where: { id: req.params.id as string },
      include: {
        items: {
          include: {
            inventoryItem: true,
            warehouse: true,
            stockMovement: true,
            purchaseOrderItem: true,
          },
        },
        supplier: true,
        invoice: { select: { id: true, invoiceNumber: true, status: true, grandTotal: true } },
        purchaseOrder: { select: { id: true, poNumber: true, date: true } },
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!gr) return res.status(404).json({ error: 'STT tidak ditemukan.' });
    return res.json(gr);
  } catch (error) {
    return handleRouteError(res, error, 'GET /goods-receipts/:id', 'Gagal mengambil detail STT.');
  }
});

// ─── POST / submit ────────────────────────────────────────────────────────
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateGoodsReceiptSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(
      (tx) => submitGoodsReceiptInTx(tx, body, req.user!.userId),
      { timeout: 30000 },
    );
    logger.info({ sttId: result.id, userId: req.user!.userId }, 'Goods receipt submitted via API');
    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /goods-receipts', 'Gagal membuat STT.');
  }
});

// ─── POST /:id/cancel ─────────────────────────────────────────────────────
router.post('/:id/cancel', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
  try {
    const allowNegativeStock = req.body?.allowNegativeStock === true;
    const negativeStockReason = typeof req.body?.negativeStockReason === 'string' ? req.body.negativeStockReason : null;
    if (allowNegativeStock && (!negativeStockReason || negativeStockReason.trim().length < 10)) {
      return res.status(400).json({ error: 'Alasan bypass stok minus wajib diisi (minimal 10 karakter).' });
    }
    const result = await prisma.$transaction(
      (tx) => cancelGoodsReceiptInTx(tx, req.params.id as string, req.user!.userId, { allowNegativeStock, negativeStockReason }),
      { timeout: 30000 },
    );
    logger.info({ sttId: result.id, userId: req.user!.userId }, 'Goods receipt cancelled via API');
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /goods-receipts/:id/cancel', 'Gagal membatalkan STT.');
  }
});

export default router;
