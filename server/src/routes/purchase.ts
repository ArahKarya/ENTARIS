import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreatePurchaseInvoiceSchema, RevisePurchaseInvoiceSchema } from '../utils/schemas';
import { handleRouteError } from '../utils/errors';
import { cancelPurchaseInvoiceInTx } from '../services/invoiceCancellation';
import { submitPurchaseInvoiceInTx } from '../services/purchaseInvoiceSubmit';
import { revisePurchaseInvoiceInTx } from '../services/purchaseInvoiceRevise';
import { computePurchaseItem } from '../services/purchaseInvoiceCalc';
import { needsApproval, queueApproval, approvalsLink } from '../services/approvalGate';
import { notifyAdmins } from '../services/notificationService';
import { queueEditApproval } from '../services/approvalEditRequests';
import { logger } from '../lib/logger';
import { z } from 'zod';
import { matchPurchaseInvoiceLines } from '../services/threeWayMatchLoad';
import { parseListPaging, parseSort } from '../utils/listQuery';
import {
  buildPurchaseInvoiceWhere,
  DEFAULT_PURCHASE_INVOICE_SORT,
  PURCHASE_INVOICE_SORT_FIELDS,
  purchaseInvoiceOrderBy,
  purchaseOverdueWhere,
  summarizePurchaseInvoices,
} from '../services/purchaseInvoiceList';

const router = Router();

// GET /api/purchase/invoices
// Query: page, limit (≤500), status, partyId, startDate, endDate (YYYY-MM-DD),
// search (invoice number / supplier name), sort (e.g. "-date", "outstanding").
// → { data, total, page, limit }
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    // Max 500 kept for existing callers that still load a whole list.
    const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 50, maxLimit: 500 });
    const filter = buildPurchaseInvoiceWhere(query);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { where } = filter;
    const sort = parseSort(query.sort, PURCHASE_INVOICE_SORT_FIELDS, DEFAULT_PURCHASE_INVOICE_SORT);

    const [invoices, total] = await Promise.all([
      prisma.purchaseInvoice.findMany({
        where,
        include: { supplier: true, items: true },
        orderBy: purchaseInvoiceOrderBy(sort),
        skip,
        take,
      }),
      prisma.purchaseInvoice.count({ where }),
    ]);

    return res.json({ data: invoices, total, page, limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /purchase/invoices error');
    return res.status(500).json({ error: 'Gagal mengambil data invoice pembelian.' });
  }
});

// GET /api/purchase/invoices/summary — KPI totals for the same filters as the
// list (status, partyId, startDate, endDate, search). Declared before /:id.
router.get('/summary', async (req, res) => {
  try {
    const filter = buildPurchaseInvoiceWhere(req.query as Record<string, unknown>);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { where } = filter;
    const [groups, overdue] = await Promise.all([
      prisma.purchaseInvoice.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { grandTotal: true, outstanding: true },
      }),
      prisma.purchaseInvoice.aggregate({
        where: { AND: [where, purchaseOverdueWhere(new Date())] },
        _count: { _all: true },
        _sum: { outstanding: true },
      }),
    ]);
    return res.json(summarizePurchaseInvoices(groups, overdue));
  } catch (error) {
    logger.error({ error }, 'GET /purchase/invoices/summary error');
    return res.status(500).json({ error: 'Gagal menghitung ringkasan invoice pembelian.' });
  }
});

// POST /api/purchase/invoices/match-preview — three-way match (PO ↔ STT ↔
// faktur) for an unsaved payload. Advisory only; never blocks saving.
const MatchPreviewSchema = z.object({
  items: z
    .array(
      z.object({
        itemName: z.string().optional().nullable(),
        unit: z.string().optional().nullable(),
        quantity: z.coerce.number().min(0),
        timbanganDiterima: z.coerce.number().min(0).nullable().optional(),
        rate: z.coerce.number(),
        discount: z.coerce.number().min(0).max(100).nullable().optional(),
        goodsReceiptItemId: z.string().uuid().nullable().optional(),
      }),
    )
    .max(500),
});
router.post('/match-preview', async (req, res) => {
  const body = validateBody(MatchPreviewSchema, req.body, res);
  if (!body) return;
  try {
    return res.json(await matchPurchaseInvoiceLines(prisma, body.items));
  } catch (error) {
    return handleRouteError(res, error, 'POST /purchase/invoices/match-preview', 'Gagal mencocokkan PO–STT–faktur.');
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
            // Source STT/BPB per line, so the PI shows which receipt each item came from.
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
          // Sertakan yang dibatalkan juga (read-only) agar riwayat/kronologi
          // pembayaran lengkap terlihat di UI — mis. UM diajukan lalu dibatalkan
          // dan diganti dengan alokasi baru di tanggal lain.
          include: {
            depositPayment: { select: { id: true, paymentNumber: true, date: true, amount: true } },
          },
          orderBy: { appliedAt: 'asc' },
        },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });

    const allocations = await prisma.paymentAllocation.findMany({
      where: { invoiceType: 'PurchaseInvoice', invoiceId: invoice.id },
      include: { payment: { select: { id: true, paymentNumber: true, date: true, amount: true, referenceNo: true } } },
      orderBy: { payment: { date: 'asc' } },
    });

    // Additive: three-way match summary. A failure here must not break the detail.
    let match = null;
    try {
      match = await matchPurchaseInvoiceLines(prisma, invoice.items);
    } catch (err) {
      logger.warn({ err, invoiceId: invoice.id }, 'three-way match failed (ignored)');
    }

    return res.json({ ...invoice, paymentAllocations: allocations, match });
  } catch (error) {
    logger.error({ error }, 'GET /purchase/invoices/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail invoice.' });
  }
});

// POST /api/purchase/invoices — create purchase invoice.
// Heavy lifting (landed cost, multi-account JE, stock, WAC, COGS backfill)
// lives in services/purchaseInvoiceSubmit.ts.
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreatePurchaseInvoiceSchema, req.body, res);
  if (!body) return;

  try {
    // Approval gate: roles without approval.bypass are queued; the document is created on approve.
    if (await needsApproval(req.user!.role)) {
      // Payload submit TIDAK menyimpan it.amount (server yang hitung) — hitung
      // grand total di sini via computePurchaseItem agar antrian approval,
      // notifikasi Telegram, dan daftar approval menampilkan nilai yang benar
      // (bukan Rp 0). Detail approval memakai rumus yang sama.
      const amount =
        (body.items ?? []).reduce(
          (s: number, it: any) => s + computePurchaseItem(it).hargaAkhir.toNumber(),
          0,
        ) -
        Number(body.potongan ?? 0) +
        Number(body.biayaLain ?? 0);
      const request = await prisma.$transaction((tx) =>
        queueApproval(tx, {
          documentType: 'PurchaseInvoice',
          payload: req.body,
          amount,
          requestedBy: req.user!.userId,
          label: 'Invoice Pembelian (menunggu approval)',
        }),
      );
      const requester = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { fullName: true } });
      const link = approvalsLink(request.id);
      await notifyAdmins({
        type: 'approval_pending',
        title: '🔔 Persetujuan: Invoice Pembelian',
        message: `Invoice Pembelian senilai Rp ${amount.toLocaleString('id-ID')} dari ${requester?.fullName ?? 'staf'} menunggu persetujuan Anda.${link ? `\n\n🔗 Buka & proses: ${link}` : ''}`,
        metadata: { kind: 'approval', requestId: request.id, documentType: 'PurchaseInvoice' },
        excludeUserId: req.user!.userId,
      });
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
router.put('/:id', async (req: AuthRequest, res) => {
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
router.post('/:id/revise-price', async (req: AuthRequest, res) => {
  const body = validateBody(RevisePurchaseInvoiceSchema, req.body, res);
  if (!body) return;
  try {
    // Approval gate: revisi harga mengubah nilai persediaan/GL → non-bypass hanya mengantrekan.
    if (await needsApproval(req.user!.role)) {
      const q = await queueEditApproval(prisma, { documentType: 'PurchaseInvoiceRevisePrice', targetId: req.params.id as string, body, rawBody: req.body, userId: req.user!.userId });
      return q.ok ? res.status(q.status).json(q.body) : res.status(q.status).json({ error: q.error });
    }
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
router.post('/:id/cancel', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
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
