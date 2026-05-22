import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreateDeliveryOrderSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { submitDeliveryOrderInTx } from '../services/deliveryOrderSubmit';
import { cancelDeliveryOrderInTx } from '../services/deliveryOrderCancel';
import { editDeliveryOrderInTx } from '../services/deliveryOrderEdit';
import { createDeliveryOrderFromInvoiceInTx } from '../services/deliveryOrderFromInvoice';
import { CreateDOFromInvoiceSchema } from '../utils/schemas';
import { logger } from '../lib/logger';

const router = Router();

const READ_ROLES = ['Admin', 'Accountant', 'StaffProduksi', 'Viewer'];
// StaffProduksi diizinkan create + edit Surat Jalan (mereka yang fisik
// nyetak & hand off ke supir). Cancel tetap Admin-only karena merupakan
// destructive operation yang mengembalikan stok.
const WRITE_ROLES = ['Admin', 'Accountant', 'StaffProduksi'];

// ─── GET / list ───────────────────────────────────────────────────────────
router.get('/', roleMiddleware(READ_ROLES), async (req, res) => {
  try {
    const {
      status,
      partyId,
      startDate,
      endDate,
      search,
      page = '1',
      limit = '50',
    } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: Prisma.DeliveryOrderWhereInput = {};
    // DocumentStatus enum is Draft/Submitted/Cancelled — "Invoiced" is a derived
    // state (status=Submitted + invoiceId set). The UI passes one of:
    //   Submitted (pending invoice), Invoiced (already billed), Cancelled.
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
      if (endDate) {
        (where.date as Prisma.DateTimeFilter).lte = new Date(String(endDate) + 'T23:59:59.999Z');
      }
    }
    if (search) {
      const q = String(search).trim();
      if (q.length > 0) {
        where.OR = [
          { doNumber: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
        ];
      }
    }

    const [data, total] = await Promise.all([
      prisma.deliveryOrder.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          _count: { select: { items: true } },
        },
        // Tanggal terbaru lalu DO number terbesar dalam tanggal yang sama.
        orderBy: [{ date: 'desc' }, { doNumber: 'desc' }],
        skip,
        take,
      }),
      prisma.deliveryOrder.count({ where }),
    ]);

    return res.json({ data, total, page: Number(page), limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /delivery-orders', 'Gagal mengambil daftar surat jalan.');
  }
});

// ─── GET /pending ─────────────────────────────────────────────────────────
// Used by the invoice modal to pick DOs that still need billing.
router.get('/pending', roleMiddleware(READ_ROLES), async (req, res) => {
  try {
    const { partyId } = req.query;
    if (!partyId || typeof partyId !== 'string') {
      return res.status(400).json({ error: 'partyId wajib diisi.' });
    }
    const data = await prisma.deliveryOrder.findMany({
      where: { partyId, status: 'Submitted', invoiceId: null },
      include: {
        items: { include: { inventoryItem: true } },
        customer: { select: { id: true, name: true } },
      },
      orderBy: { date: 'asc' },
    });
    return res.json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /delivery-orders/pending', 'Gagal mengambil daftar surat jalan tertunda.');
  }
});

// ─── GET /:id detail ──────────────────────────────────────────────────────
router.get('/:id', roleMiddleware(READ_ROLES), async (req, res) => {
  try {
    const deliveryOrder = await prisma.deliveryOrder.findUnique({
      where: { id: req.params.id as string },
      include: {
        items: {
          include: {
            inventoryItem: true,
            warehouse: true,
            stockMovement: true,
          },
        },
        customer: true,
        invoice: { select: { id: true, invoiceNumber: true, status: true, grandTotal: true } },
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!deliveryOrder) return res.status(404).json({ error: 'Surat jalan tidak ditemukan.' });
    return res.json(deliveryOrder);
  } catch (error) {
    return handleRouteError(res, error, 'GET /delivery-orders/:id', 'Gagal mengambil detail surat jalan.');
  }
});

// ─── POST / submit ────────────────────────────────────────────────────────
router.post('/', roleMiddleware(WRITE_ROLES), async (req: AuthRequest, res) => {
  const body = validateBody(CreateDeliveryOrderSchema, req.body, res);
  if (!body) return;

  // Strict mode + Admin-only bypass: cuma Admin yang boleh allowNegativeStock.
  if (body.allowNegativeStock && req.user!.role !== 'Admin') {
    return res.status(403).json({ error: 'Hanya Admin yang dapat bypass validasi stok.' });
  }

  try {
    const result = await prisma.$transaction(
      (tx) => submitDeliveryOrderInTx(tx, body, req.user!.userId),
      { timeout: 15000 },
    );
    logger.info({ doId: result?.id, userId: req.user!.userId, negativeBypass: body.allowNegativeStock }, 'Delivery order submitted');
    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /delivery-orders', 'Gagal membuat surat jalan.');
  }
});

// ─── POST /from-invoice/:invoiceId — retroactive DO ────────────────────────
// Used when an invoice was entered first (direct-sale) and the physical DO
// paperwork comes later. No stock movements; links to invoice's existing SM.
router.post('/from-invoice/:invoiceId', roleMiddleware(WRITE_ROLES), async (req: AuthRequest, res) => {
  const body = validateBody(CreateDOFromInvoiceSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(
      (tx) => createDeliveryOrderFromInvoiceInTx(
        tx,
        { ...body, invoiceId: req.params.invoiceId as string },
        req.user!.userId,
      ),
      { timeout: 15000 },
    );
    logger.info(
      { doId: result.id, invoiceId: req.params.invoiceId, userId: req.user!.userId },
      'Delivery order created from invoice',
    );
    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /delivery-orders/from-invoice/:invoiceId', 'Gagal membuat surat jalan dari invoice.');
  }
});

// ─── PATCH /:id edit header ───────────────────────────────────────────────
// Only header fields (notes, nomorMobil, driverName, recipientName) — quantities
// and items can't change once stock has moved. Status must still be Submitted.
router.patch('/:id', roleMiddleware(WRITE_ROLES), async (req: AuthRequest, res) => {
  try {
    const existing = await prisma.deliveryOrder.findUnique({
      where: { id: req.params.id as string },
    });
    if (!existing) return res.status(404).json({ error: 'Surat jalan tidak ditemukan.' });
    if (existing.status !== 'Submitted') {
      throw new BusinessError('Hanya surat jalan berstatus Submitted yang bisa diedit.');
    }

    const { notes, nomorMobil, driverName, recipientName } = req.body ?? {};
    const updated = await prisma.deliveryOrder.update({
      where: { id: existing.id },
      data: {
        notes: notes === undefined ? existing.notes : notes,
        nomorMobil: nomorMobil === undefined ? existing.nomorMobil : nomorMobil,
        driverName: driverName === undefined ? existing.driverName : driverName,
        recipientName: recipientName === undefined ? existing.recipientName : recipientName,
      },
    });
    return res.json(updated);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /delivery-orders/:id', 'Gagal memperbarui surat jalan.');
  }
});

// ─── PUT /:id full edit — reverse old movements, re-apply new items ────────
// Allowed only when DO is Submitted and not yet linked to an invoice.
// doNumber is preserved.
router.put('/:id', roleMiddleware(WRITE_ROLES), async (req: AuthRequest, res) => {
  const body = validateBody(CreateDeliveryOrderSchema, req.body, res);
  if (!body) return;
  if (body.allowNegativeStock && req.user!.role !== 'Admin') {
    return res.status(403).json({ error: 'Hanya Admin yang dapat bypass validasi stok.' });
  }
  try {
    const result = await prisma.$transaction(
      (tx) => editDeliveryOrderInTx(tx, req.params.id as string, body, req.user!.userId),
      { timeout: 15000 },
    );
    logger.info({ doId: req.params.id, userId: req.user!.userId, negativeBypass: body.allowNegativeStock }, 'Delivery order edited');
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /delivery-orders/:id', 'Gagal mengedit surat jalan.');
  }
});

// ─── POST /:id/cancel — Admin only ────────────────────────────────────────
router.post('/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(
      (tx) => cancelDeliveryOrderInTx(tx, req.params.id as string),
      { timeout: 15000 },
    );
    logger.info({ doId: req.params.id, userId: req.user!.userId }, 'Delivery order cancelled');
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /delivery-orders/:id/cancel', 'Gagal membatalkan surat jalan.');
  }
});

export default router;
