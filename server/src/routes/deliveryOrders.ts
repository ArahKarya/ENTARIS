import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { hasCap } from '../services/permissionService';
import { validateBody } from '../utils/validate';
import { CreateDeliveryOrderSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { submitDeliveryOrderInTx } from '../services/deliveryOrderSubmit';
import { cancelDeliveryOrderInTx } from '../services/deliveryOrderCancel';
import { editDeliveryOrderInTx } from '../services/deliveryOrderEdit';
import { createDeliveryOrderFromInvoiceInTx } from '../services/deliveryOrderFromInvoice';
import { CreateDOFromInvoiceSchema } from '../utils/schemas';
import { logger } from '../lib/logger';
import { parseListPaging, parseSort } from '../utils/listQuery';
import {
  buildDeliveryOrderWhere,
  DEFAULT_DELIVERY_ORDER_SORT,
  DELIVERY_ORDER_SORT_FIELDS,
  deliveryOrderOrderBy,
} from '../services/deliveryOrderList';
import { queueApproval, approvalsLink } from '../services/approvalGate';
import { notifyAdmins } from '../services/notificationService';

const router = Router();

// Akses modul 'delivery_order' di-enforce di mount (index.ts). Cancel = capability
// 'doc.cancel'; bypass stok minus = capability 'inventory.negative_stock'.

// GET / list
// Query: page, limit (≤200), status (Submitted | Invoiced | Cancelled | Draft —
// see services/deliveryOrderList), partyId, startDate, endDate (YYYY-MM-DD),
// search (DO number / customer name / no. mobil), sort (e.g. "-date").
// → { data, total, page, limit }
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 50, maxLimit: 200 });
    const filter = buildDeliveryOrderWhere(query);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { where } = filter;
    const sort = parseSort(query.sort, DELIVERY_ORDER_SORT_FIELDS, DEFAULT_DELIVERY_ORDER_SORT);

    const [data, total] = await Promise.all([
      prisma.deliveryOrder.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          invoice: { select: { id: true, invoiceNumber: true } },
          // Pesanan asal → No. PO pelanggan (customerRefNo) & No. SO tampil di daftar Surat Jalan.
          salesOrder: { select: { id: true, soNumber: true, customerRefNo: true } },
          _count: { select: { items: true } },
        },
        // Default: tanggal terbaru lalu DO number terbesar dalam tanggal yang sama.
        orderBy: deliveryOrderOrderBy(sort),
        skip,
        take,
      }),
      prisma.deliveryOrder.count({ where }),
    ]);

    return res.json({ data, total, page, limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /delivery-orders', 'Gagal mengambil daftar surat jalan.');
  }
});

// GET /pending
// Used by the invoice modal to pick DOs that still need billing.
router.get('/pending', async (req, res) => {
  try {
    const { partyId } = req.query;
    if (!partyId || typeof partyId !== 'string') {
      return res.status(400).json({ error: 'partyId wajib diisi.' });
    }
    const data = await prisma.deliveryOrder.findMany({
      where: { partyId, status: 'Submitted', invoiceId: null },
      include: {
        // salesOrderItem → harga jual & diskon dari SO, supaya baris invoice
        // dari Surat Jalan terisi otomatis (bukan rate 0).
        items: { include: { inventoryItem: true, salesOrderItem: { select: { rate: true, discount: true } } } },
        customer: { select: { id: true, name: true } },
        // salesOrder → No. PO pelanggan (customerRefNo) / No. SO utk auto-isi ref invoice.
        salesOrder: { select: { soNumber: true, customerRefNo: true } },
      },
      orderBy: { date: 'asc' },
    });
    return res.json(data);
  } catch (error) {
    return handleRouteError(res, error, 'GET /delivery-orders/pending', 'Gagal mengambil daftar surat jalan tertunda.');
  }
});

// GET /:id detail
router.get('/:id', async (req, res) => {
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
        // Pesanan asal → No. PO pelanggan & No. SO untuk detail dan PDF Surat Jalan.
        salesOrder: { select: { id: true, soNumber: true, customerRefNo: true } },
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!deliveryOrder) return res.status(404).json({ error: 'Surat jalan tidak ditemukan.' });
    return res.json(deliveryOrder);
  } catch (error) {
    return handleRouteError(res, error, 'GET /delivery-orders/:id', 'Gagal mengambil detail surat jalan.');
  }
});

// POST / submit
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateDeliveryOrderSchema, req.body, res);
  if (!body) return;

  // Stok minus: punya capability → bypass langsung. Tidak punya → tidak lagi
  // diblok, tapi MASUK ANTRIAN APPROVAL (staf tetap bisa buat SJ, manajer
  // setujui). Dokumen dibuat saat approve (dgn bypass). Lihat approvalDecision.
  if (body.allowNegativeStock && !(await hasCap(req.user!.role, 'inventory.negative_stock'))) {
    try {
      const request = await prisma.$transaction((tx) =>
        queueApproval(tx, {
          documentType: 'DeliveryOrder',
          payload: req.body,
          amount: 0,
          requestedBy: req.user!.userId,
          label: 'Surat Jalan (menunggu approval, stok minus)',
        }),
      );
      const requester = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { fullName: true } });
      const link = approvalsLink(request.id);
      await notifyAdmins({
        type: 'approval_pending',
        title: '🔔 Persetujuan: Surat Jalan (stok minus)',
        message: `Surat Jalan dari ${requester?.fullName ?? 'staf'} butuh persetujuan karena stok minus.${body.negativeStockReason ? `\nAlasan: ${body.negativeStockReason}` : ''}${link ? `\n\n🔗 Buka & proses: ${link}` : ''}`,
        metadata: { kind: 'approval', requestId: request.id, documentType: 'DeliveryOrder' },
        excludeUserId: req.user!.userId,
      });
      return res.status(202).json({ pendingApproval: true, request, message: 'Surat jalan menunggu persetujuan manajer (stok minus).' });
    } catch (error) {
      return handleRouteError(res, error, 'POST /delivery-orders (approval)', 'Gagal mengajukan surat jalan.');
    }
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

// POST /from-invoice/:invoiceId: retroactive DO
// Used when an invoice was entered first (direct-sale) and the physical DO
// paperwork comes later. No stock movements; links to invoice's existing SM.
router.post('/from-invoice/:invoiceId', async (req: AuthRequest, res) => {
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

// PATCH /:id edit header
// Only header fields (notes, nomorMobil, driverName, recipientName) — quantities
// and items can't change once stock has moved. Status must still be Submitted.
router.patch('/:id', async (req: AuthRequest, res) => {
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

// PUT /:id full edit: reverse old movements, re-apply new items
// Allowed only when DO is Submitted and not yet linked to an invoice.
// doNumber is preserved.
router.put('/:id', async (req: AuthRequest, res) => {
  const body = validateBody(CreateDeliveryOrderSchema, req.body, res);
  if (!body) return;
  if (body.allowNegativeStock && !(await hasCap(req.user!.role, 'inventory.negative_stock'))) {
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

// POST /:id/cancel: Admin only
router.post('/:id/cancel', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
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
