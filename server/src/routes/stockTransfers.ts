import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { handleRouteError } from '../utils/errors';
import { validateBody } from '../utils/validate';
import { submitStockTransferInTx, cancelStockTransferInTx } from '../services/stockTransfer';
import { firstString, parseListPaging, parseSort } from '../utils/listQuery';
import {
  buildStockTransferWhere,
  DEFAULT_STOCK_TRANSFER_SORT,
  STOCK_TRANSFER_SORT_FIELDS,
  stockTransferOrderBy,
} from '../services/stockTransferList';

const router = Router();

const TransferItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive('Qty harus > 0.'),
  description: z.string().nullable().optional(),
  // Phase 5: optional batch picker — lock unitCost to a specific inbound batch
  sourceMovementId: z.string().uuid().nullable().optional(),
});

const CreateTransferSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  fromWarehouseId: z.string().uuid('Gudang asal wajib dipilih.'),
  toWarehouseId: z.string().uuid('Gudang tujuan wajib dipilih.'),
  notes: z.string().nullable().optional(),
  // SJG (Surat Jalan Antar Gudang) physical-delivery metadata. Stok tetap
  // pindah instan, field ini hanya feed PDF cetakan untuk supir.
  nomorMobil: z.string().max(50).nullable().optional(),
  driverName: z.string().max(200).nullable().optional(),
  recipientName: z.string().max(200).nullable().optional(),
  items: z.array(TransferItemSchema).min(1, 'Minimal satu item.'),
}).refine((d) => d.fromWarehouseId !== d.toWarehouseId, {
  message: 'Gudang asal dan tujuan harus berbeda.',
  path: ['toWarehouseId'],
});

const UpdateHeaderSchema = z.object({
  notes: z.string().nullable().optional(),
  nomorMobil: z.string().max(50).nullable().optional(),
  driverName: z.string().max(200).nullable().optional(),
  recipientName: z.string().max(200).nullable().optional(),
});

// GET /api/stock-transfers
// Query: page, limit (default 50, ≤200), status, warehouseId (source or
// destination), startDate, endDate (YYYY-MM-DD), search (number / notes /
// vehicle / driver / recipient / warehouse name), sort (e.g. "-date").
// → { data, total, page, limit }. Without `sort` the legacy order (date desc)
// is kept, so old callers get byte-identical responses.
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 50, maxLimit: 200 });
    const filter = buildStockTransferWhere(query);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { where } = filter;
    const orderBy = firstString(query.sort)
      ? stockTransferOrderBy(parseSort(query.sort, STOCK_TRANSFER_SORT_FIELDS, DEFAULT_STOCK_TRANSFER_SORT))
      : { date: 'desc' as const };

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
        orderBy,
        skip,
        take,
      }),
      prisma.stockTransfer.count({ where }),
    ]);

    return res.json({ data, total, page, limit: take });
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
router.post('/', async (req: AuthRequest, res) => {
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

// PATCH /:id — edit header fields only (notes, mobil, supir, penerima)
router.patch('/:id', async (req: AuthRequest, res) => {
  const body = validateBody(UpdateHeaderSchema, req.body, res);
  if (!body) return;
  try {
    const existing = await prisma.stockTransfer.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ error: 'Transfer tidak ditemukan.' });
    if (existing.status !== 'Submitted') {
      return res.status(400).json({ error: 'Hanya transfer status Submitted yang bisa diedit.' });
    }
    const updated = await prisma.stockTransfer.update({
      where: { id: req.params.id as string },
      data: {
        notes: body.notes ?? existing.notes,
        nomorMobil: body.nomorMobil ?? existing.nomorMobil,
        driverName: body.driverName ?? existing.driverName,
        recipientName: body.recipientName ?? existing.recipientName,
        updatedAt: new Date(),
      },
    });
    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /stock-transfers/:id', 'Gagal edit transfer.');
  }
});

// POST /:id/mark-printed — set printedAt timestamp (tracks when SJG dicetak)
router.post('/:id/mark-printed', async (req: AuthRequest, res) => {
  try {
    const updated = await prisma.stockTransfer.update({
      where: { id: req.params.id as string },
      data: { printedAt: new Date() },
    });
    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'POST /stock-transfers/:id/mark-printed', 'Gagal update timestamp print.');
  }
});

// PATCH /:id/cancel — reverse the transfer
router.patch('/:id/cancel', async (req: AuthRequest, res) => {
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
