import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreatePurchaseInvoiceSchema, RevisePurchaseInvoiceSchema } from '../utils/schemas';
import { handleRouteError } from '../utils/errors';
import { cancelPurchaseInvoiceInTx } from '../services/invoiceCancellation';
import { submitPurchaseInvoiceInTx } from '../services/purchaseInvoiceSubmit';
import { revisePurchaseInvoiceInTx } from '../services/purchaseInvoiceRevise';
import { needsApproval, queueApproval } from '../services/approvalGate';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/purchase/invoices
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '50', status, partyId, startDate, endDate, search } = req.query;
    // Bumped max from 200 to 500 to prevent silent row truncation as the
    // dataset grows. Server-side date filter below is the proper solution.
    const take = Math.min(Number(limit) || 50, 500);
    const skip = (Number(page) - 1) * take;

    const where: Prisma.PurchaseInvoiceWhereInput = {};
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
          { invoiceNumber: { contains: q, mode: 'insensitive' } },
          { supplier: { name: { contains: q, mode: 'insensitive' } } },
        ];
      }
    }

    const [invoices, total] = await Promise.all([
      prisma.purchaseInvoice.findMany({
        where,
        include: { supplier: true, items: true },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.purchaseInvoice.count({ where }),
    ]);

    return res.json({ data: invoices, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /purchase/invoices error');
    return res.status(500).json({ error: 'Gagal mengambil data invoice pembelian.' });
  }
});

// GET /api/purchase/invoices/:id — detail single invoice
router.get('/:id', async (req, res) => {
  try {
    const invoice = await prisma.purchaseInvoice.findUnique({
      where: { id: req.params.id },
      include: {
        supplier: true,
        items: {
          include: {
            // Surface STT/BPB asal per baris — supaya dari PI bisa langsung
            // tahu barang ini diterima lewat STT nomor berapa (bug fix 2026-05).
            goodsReceiptItem: {
              select: {
                id: true,
                goodsReceipt: { select: { id: true, sttNumber: true, date: true } },
              },
            },
          },
        },
        user: { select: { id: true, fullName: true } },
        depositApplications: {
          where: { isCancelled: false },
          include: {
            depositPayment: { select: { id: true, paymentNumber: true, date: true, amount: true } },
          },
        },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });

    const allocations = await prisma.paymentAllocation.findMany({
      where: { invoiceType: 'PurchaseInvoice', invoiceId: invoice.id },
      include: { payment: { select: { id: true, paymentNumber: true, date: true, amount: true, referenceNo: true } } },
      orderBy: { payment: { date: 'desc' } },
    });

    return res.json({ ...invoice, paymentAllocations: allocations });
  } catch (error) {
    logger.error({ error }, 'GET /purchase/invoices/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail invoice.' });
  }
});

// POST /api/purchase/invoices — create purchase invoice.
// Heavy lifting (landed cost, multi-account JE, stock, WAC, COGS backfill)
// lives in services/purchaseInvoiceSubmit.ts.
router.post('/', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const body = validateBody(CreatePurchaseInvoiceSchema, req.body, res);
  if (!body) return;

  try {
    // Approval gate: non-Admin → masuk antrian, dokumen baru dibuat saat approve.
    if (needsApproval(req.user!.role)) {
      const amount = (body.items ?? []).reduce((s: number, it: any) => s + Number(it.amount ?? 0), 0) + Number(body.biayaLain ?? 0);
      const request = await prisma.$transaction((tx) =>
        queueApproval(tx, {
          documentType: 'PurchaseInvoice',
          payload: req.body,
          amount,
          requestedBy: req.user!.userId,
          label: 'Invoice Pembelian (menunggu approval)',
        }),
      );
      return res.status(202).json({ pendingApproval: true, request, message: 'Invoice menunggu persetujuan manajer sebelum diproses.' });
    }
    const result = await prisma.$transaction(
      (tx) => submitPurchaseInvoiceInTx(tx, body, req.user!.userId),
      { timeout: 15000 },
    );
    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /purchase/invoices', 'Gagal menyimpan invoice pembelian.');
  }
});


// PUT /api/purchase/invoices/:id — edit invoice (notes, dueDate)
router.put('/:id', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  try {
    const invoice = await prisma.purchaseInvoice.findUnique({ where: { id: req.params.id as string } });
    if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });
    if (invoice.status === 'Cancelled') return res.status(400).json({ error: 'Invoice sudah dibatalkan, tidak bisa diedit.' });

    const { notes, dueDate } = req.body;
    const data: Prisma.PurchaseInvoiceUpdateInput = {};
    if (notes !== undefined) data.notes = notes;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;

    const updated = await prisma.purchaseInvoice.update({ where: { id: invoice.id }, data });
    return res.json(updated);
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /purchase/invoices/:id', 'Gagal memperbarui invoice.');
  }
});

// POST /api/purchase/invoices/:id/revise-price — revisi harga (supplier koreksi)
// Delta di-split: porsi stok → Persediaan+WAC, porsi sudah-keluar → 5.11.
router.post('/:id/revise-price', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(RevisePurchaseInvoiceSchema, req.body, res);
  if (!body) return;
  try {
    const result = await prisma.$transaction(
      (tx) => revisePurchaseInvoiceInTx(tx, { invoiceId: req.params.id as string, lines: body.lines, reason: body.reason }, req.user!.userId),
      { timeout: 30000 },
    );
    logger.info({ invoiceId: req.params.id, userId: req.user!.userId }, 'Purchase invoice price revised via API');
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /purchase/invoices/:id/revise-price', 'Gagal merevisi harga invoice.');
  }
});

// POST /api/purchase/invoices/:id/cancel — cancel purchase invoice
router.post('/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(
      (tx) => cancelPurchaseInvoiceInTx(tx, req.params.id as string),
      { timeout: 15000 },
    );
    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /purchase/invoices/:id/cancel', 'Gagal membatalkan invoice.');
  }
});

export default router;
