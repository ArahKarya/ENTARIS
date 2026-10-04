import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreatePurchaseOrderSchema, ClosePurchaseOrderSchema } from '../utils/schemas';
import { handleRouteError } from '../utils/errors';
import {
  submitPurchaseOrderInTx,
  cancelPurchaseOrderInTx,
  updatePurchaseOrderInTx,
  closePurchaseOrderInTx,
} from '../services/purchaseOrderSubmit';
import { derivePurchaseOrderReceiptStatus } from '../services/purchaseOrderRules';
import { logger } from '../lib/logger';
import { parseListPaging, parseSort } from '../utils/listQuery';
import {
  buildPurchaseOrderWhere,
  DEFAULT_PURCHASE_ORDER_SORT,
  PURCHASE_ORDER_SORT_FIELDS,
  purchaseOrderOrderBy,
} from '../services/purchaseOrderList';

const router = Router();

// PO: Admin + Accountant only (sesuai keputusan Phase 1)

// ─── GET / list ───────────────────────────────────────────────────────────
// Query: page, limit (≤200), status, partyId, startDate, endDate (YYYY-MM-DD),
// search (PO number / supplier name), receipt (unreceived|partial|full|closed),
// open=1 (Submitted & not closed — STT picker), sort (e.g. "-date").
// → { data, total, page, limit }; each row carries a derived `receiptStatus`.
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    // Max 200 kept for callers that load a whole list (STT modal pulls open POs).
    const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 50, maxLimit: 200 });
    const filter = buildPurchaseOrderWhere(query, {
      itemQuantity: prisma.purchaseOrderItem.fields.quantity,
    });
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { where } = filter;
    const sort = parseSort(query.sort, PURCHASE_ORDER_SORT_FIELDS, DEFAULT_PURCHASE_ORDER_SORT);

    const [rows, total] = await Promise.all([
      prisma.purchaseOrder.findMany({
        where,
        include: {
          supplier: { select: { id: true, name: true } },
          _count: { select: { items: true, goodsReceipts: true } },
          items: { select: { quantity: true, qtyReceived: true } },
        },
        orderBy: purchaseOrderOrderBy(sort),
        skip,
        take,
      }),
      prisma.purchaseOrder.count({ where }),
    ]);

    // Items are only loaded to derive the receipt status; the row shape stays
    // the legacy one plus `receiptStatus` (additive).
    const data = rows.map(({ items, ...po }) => ({
      ...po,
      receiptStatus: derivePurchaseOrderReceiptStatus(po, items),
    }));
    return res.json({ data, total, page, limit: take });
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
    return res.json({ ...po, receiptStatus: derivePurchaseOrderReceiptStatus(po, po.items) });
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

// ─── PUT /:id edit ────────────────────────────────────────────────────────
// Only while the PO is open and nothing has been received against it.
router.put('/:id', async (req: AuthRequest, res) => {
  const body = validateBody(CreatePurchaseOrderSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(
      (tx) => updatePurchaseOrderInTx(tx, req.params.id as string, body),
      { timeout: 15000 },
    );
    logger.info({ poId: result.id, userId: req.user!.userId }, 'PO updated via API');
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /purchase-orders/:id', 'Gagal mengubah PO.');
  }
});

// ─── POST /:id/close (short-close) ────────────────────────────────────────
// Same gate as cancel. Status stays Submitted; closedAt marks remaining qty
// as no longer expected.
router.post('/:id/close', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
  const body = validateBody(ClosePurchaseOrderSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(
      (tx) => closePurchaseOrderInTx(tx, req.params.id as string, body.reason),
      { timeout: 15000 },
    );
    logger.info({ poId: result.id, userId: req.user!.userId }, 'PO closed via API');
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /purchase-orders/:id/close', 'Gagal menutup PO.');
  }
});

export default router;
