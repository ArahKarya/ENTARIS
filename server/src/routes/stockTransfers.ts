import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { handleRouteError } from '../utils/errors';
import { validateBody } from '../utils/validate';
import { submitStockTransferInTx, cancelStockTransferInTx } from '../services/stockTransfer';

const router = Router();

const TransferItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive('Qty harus > 0.'),
  description: z.string().nullable().optional(),
});

const CreateTransferSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  fromWarehouseId: z.string().uuid('Gudang asal wajib dipilih.'),
  toWarehouseId: z.string().uuid('Gudang tujuan wajib dipilih.'),
  notes: z.string().nullable().optional(),
  items: z.array(TransferItemSchema).min(1, 'Minimal satu item.'),
}).refine((d) => d.fromWarehouseId !== d.toWarehouseId, {
  message: 'Gudang asal dan tujuan harus berbeda.',
  path: ['toWarehouseId'],
});

// GET /api/stock-transfers
router.get('/', async (req, res) => {
  try {
    const { status, page = '1', limit = '50' } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;
    const where: Prisma.StockTransferWhereInput = {};
    if (status) where.status = status as any;

    const [data, total] = await Promise.all([
      prisma.stockTransfer.findMany({
        where,
        include: {
          fromWarehouse: { select: { id: true, code: true, name: true } },
          toWarehouse: { select: { id: true, code: true, name: true } },
          items: {
            include: { item: { select: { id: true, code: true, name: true, unit: true } } },
          },
          user: { select: { id: true, fullName: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.stockTransfer.count({ where }),
    ]);

    return res.json({ data, total, page: Number(page), limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /stock-transfers', 'Gagal mengambil daftar transfer.');
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: req.params.id as string },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        items: { include: { item: true } },
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!transfer) return res.status(404).json({ error: 'Transfer tidak ditemukan.' });
    return res.json(transfer);
  } catch (error) {
    return handleRouteError(res, error, 'GET /stock-transfers/:id', 'Gagal mengambil detail transfer.');
  }
});

// POST / — create + submit (single step for now)
router.post('/', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateTransferSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(
      (tx) => submitStockTransferInTx(tx, body, req.user!.userId),
      { timeout: 30000 },
    );
    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /stock-transfers', 'Gagal membuat transfer stok.');
  }
});

// PATCH /:id/cancel — reverse the transfer
router.patch('/:id/cancel', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(
      (tx) => cancelStockTransferInTx(tx, req.params.id as string),
    );
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /stock-transfers/:id/cancel', 'Gagal membatalkan transfer.');
  }
});

export default router;
