import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { BusinessError, handleRouteError } from '../utils/errors';
import { validateBody } from '../utils/validate';
import {
  CreateQuotationSchema,
  UpdateQuotationSchema,
  RejectQuotationSchema,
} from '../utils/schemas';
import { logger } from '../lib/logger';
import { parseListPaging, parseSort } from '../utils/listQuery';
import { resolveItems, computeTotals } from '../services/salesDocTotals';
import {
  awaitingConversionWhere,
  buildQuotationWhere,
  DEFAULT_QUOTATION_SORT,
  expiringSoonWhere,
  QUOTATION_SORT_FIELDS,
  quotationOrderBy,
  summarizeQuotations,
} from '../services/quotationList';

const router = Router();

// GET / — list with pagination + filter
// Query: page, limit (≤500), status, partyId, startDate, endDate (YYYY-MM-DD),
// search (number / customer), sort (e.g. "-date", "validUntil").
// → { data, total, page, limit }
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 50, maxLimit: 500 });
    const filter = buildQuotationWhere(query);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { where } = filter;
    const sort = parseSort(query.sort, QUOTATION_SORT_FIELDS, DEFAULT_QUOTATION_SORT);

    const [quotations, total] = await Promise.all([
      prisma.quotation.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true, phone: true, email: true } },
          items: true,
          salesInvoice: { select: { id: true, invoiceNumber: true, date: true } },
        },
        orderBy: quotationOrderBy(sort),
        skip,
        take,
      }),
      prisma.quotation.count({ where }),
    ]);

    return res.json({ data: quotations, total, page, limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /quotations', 'Gagal mengambil data penawaran.');
  }
});

// GET /summary — KPI totals for the same filters as the list. Before /:id.
router.get('/summary', async (req, res) => {
  try {
    const filter = buildQuotationWhere(req.query as Record<string, unknown>);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { where } = filter;
    const [groups, expiringSoonCount, awaitingConversionCount] = await Promise.all([
      prisma.quotation.groupBy({
        by: ['status'],
        where,
        _count: { _all: true },
        _sum: { grandTotal: true },
      }),
      prisma.quotation.count({ where: { AND: [where, expiringSoonWhere(new Date())] } }),
      prisma.quotation.count({ where: { AND: [where, awaitingConversionWhere] } }),
    ]);
    return res.json(summarizeQuotations(groups, { expiringSoonCount, awaitingConversionCount }));
  } catch (error) {
    return handleRouteError(res, error, 'GET /quotations/summary', 'Gagal menghitung ringkasan penawaran.');
  }
});

// GET /stats — conversion-rate summary
router.get('/stats', async (req, res) => {
  try {
    const { from, to } = req.query;
    const where: Prisma.QuotationWhereInput = {};
    if (from || to) {
      where.date = {};
      if (from) (where.date as any).gte = new Date(String(from));
      if (to) (where.date as any).lte = new Date(String(to) + 'T23:59:59.999Z');
    }

    const grouped = await prisma.quotation.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
      _sum: { grandTotal: true },
    });

    const counts: Record<string, number> = { Draft: 0, Sent: 0, Accepted: 0, Rejected: 0, Expired: 0, Cancelled: 0 };
    const values: Record<string, number> = { Draft: 0, Sent: 0, Accepted: 0, Rejected: 0, Expired: 0, Cancelled: 0 };
    for (const g of grouped) {
      counts[g.status] = g._count._all;
      values[g.status] = Number(g._sum.grandTotal ?? 0);
    }
    const issued = counts.Sent + counts.Accepted + counts.Rejected + counts.Expired;
    const conversionRate = issued > 0 ? Math.round((counts.Accepted / issued) * 100) : 0;

    return res.json({ counts, values, issued, accepted: counts.Accepted, conversionRate });
  } catch (error) {
    return handleRouteError(res, error, 'GET /quotations/stats', 'Gagal mengambil statistik penawaran.');
  }
});

// GET /:id — detail
router.get('/:id', async (req, res) => {
  try {
    const quotation = await prisma.quotation.findUnique({
      where: { id: req.params.id as string },
      include: {
        customer: true,
        items: {
          include: {
            inventoryItem: { select: { id: true, code: true, name: true, unit: true } },
            serviceItem: { select: { id: true, code: true, name: true } },
          },
        },
        user: { select: { id: true, fullName: true } },
        salesInvoice: { select: { id: true, invoiceNumber: true, date: true, grandTotal: true } },
        // Active SOs created from this quotation.
        salesOrders: {
          where: { status: { not: 'Cancelled' } },
          select: { id: true, soNumber: true, status: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!quotation) return res.status(404).json({ error: 'Penawaran tidak ditemukan.' });
    return res.json(quotation);
  } catch (error) {
    return handleRouteError(res, error, 'GET /quotations/:id', 'Gagal mengambil detail penawaran.');
  }
});

// POST / — create draft
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateQuotationSchema, req.body, res);
  if (!body) return;

  try {
    const date = new Date(body.date);
    const validUntil = new Date(body.validUntil);
    if (isNaN(date.getTime())) throw new BusinessError('Format tanggal tidak valid.');
    if (isNaN(validUntil.getTime())) throw new BusinessError('Format tanggal berlaku-sampai tidak valid.');

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const fiscalYear = await getOpenFiscalYear(tx, date);
      const quotationNumber = await generateDocumentNumber(tx, 'QO', date, fiscalYear.id);
      const items = resolveItems(body.items);
      const totals = computeTotals(items, body.potongan ?? 0, body.biayaLain ?? 0);

      return tx.quotation.create({
        data: {
          quotationNumber,
          date,
          validUntil,
          partyId: body.partyId,
          status: 'Draft',
          subtotal: totals.subtotal,
          taxPct: 0,
          potongan: body.potongan ?? 0,
          biayaLain: body.biayaLain ?? 0,
          labelPotongan: body.labelPotongan || null,
          labelBiaya: body.labelBiaya || null,
          grandTotal: totals.grandTotal,
          terms: body.terms || null,
          notes: body.notes || null,
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          items: { create: items },
        },
        include: { items: true, customer: true },
      });
    });

    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /quotations', 'Gagal membuat penawaran.');
  }
});

// PUT /:id — edit (Draft only)
router.put('/:id', async (req: AuthRequest, res) => {
  const body = validateBody(UpdateQuotationSchema, req.body, res);
  if (!body) return;

  try {
    const date = new Date(body.date);
    const validUntil = new Date(body.validUntil);

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.quotation.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new BusinessError('Penawaran tidak ditemukan.');
      if (existing.status !== 'Draft') {
        throw new BusinessError(`Hanya penawaran berstatus Draft yang dapat diedit. Status saat ini: ${existing.status}.`);
      }

      const items = resolveItems(body.items);
      const totals = computeTotals(items, body.potongan ?? 0, body.biayaLain ?? 0);

      // Replace all items: delete then recreate
      await tx.quotationItem.deleteMany({ where: { quotationId: req.params.id as string } });

      return tx.quotation.update({
        where: { id: req.params.id as string },
        data: {
          date,
          validUntil,
          partyId: body.partyId,
          subtotal: totals.subtotal,
          potongan: body.potongan ?? 0,
          biayaLain: body.biayaLain ?? 0,
          labelPotongan: body.labelPotongan || null,
          labelBiaya: body.labelBiaya || null,
          grandTotal: totals.grandTotal,
          terms: body.terms || null,
          notes: body.notes || null,
          items: { create: items },
        },
        include: { items: true, customer: true },
      });
    });

    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /quotations/:id', 'Gagal memperbarui penawaran.');
  }
});

// DELETE /:id — only Draft can be hard-deleted
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.quotation.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ error: 'Penawaran tidak ditemukan.' });
    if (existing.status !== 'Draft') {
      return res.status(400).json({ error: 'Hanya penawaran Draft yang bisa dihapus. Gunakan tombol Cancel untuk yang sudah diterbitkan.' });
    }
    await prisma.quotation.delete({ where: { id: req.params.id as string } });
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /quotations/:id', 'Gagal menghapus penawaran.');
  }
});

// PATCH /:id/send — Draft → Sent
router.patch('/:id/send', async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const q = await tx.quotation.findUnique({ where: { id: req.params.id as string }, include: { items: true } });
      if (!q) throw new BusinessError('Penawaran tidak ditemukan.');
      if (q.status !== 'Draft') throw new BusinessError(`Hanya Draft yang bisa dikirim. Status saat ini: ${q.status}.`);
      if (q.items.length === 0) throw new BusinessError('Penawaran harus memiliki minimal satu item.');
      if (q.validUntil < new Date()) throw new BusinessError('Tanggal berlaku-sampai sudah lewat. Edit dulu sebelum mengirim.');
      return tx.quotation.update({
        where: { id: q.id },
        data: { status: 'Sent', sentAt: new Date() },
      });
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /quotations/:id/send', 'Gagal mengirim penawaran.');
  }
});

// PATCH /:id/accept — Sent → Accepted
router.patch('/:id/accept', async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const q = await tx.quotation.findUnique({ where: { id: req.params.id as string } });
      if (!q) throw new BusinessError('Penawaran tidak ditemukan.');
      if (q.status !== 'Sent') throw new BusinessError(`Hanya status Sent yang bisa di-Accept. Status saat ini: ${q.status}.`);
      if (q.validUntil < new Date()) throw new BusinessError('Penawaran sudah kadaluarsa. Buat penawaran baru.');
      return tx.quotation.update({
        where: { id: q.id },
        data: { status: 'Accepted', acceptedAt: new Date() },
      });
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /quotations/:id/accept', 'Gagal menerima penawaran.');
  }
});

// PATCH /:id/reject — Sent → Rejected
router.patch('/:id/reject', async (req, res) => {
  const body = validateBody(RejectQuotationSchema, req.body, res);
  if (!body) return;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const q = await tx.quotation.findUnique({ where: { id: req.params.id as string } });
      if (!q) throw new BusinessError('Penawaran tidak ditemukan.');
      if (q.status !== 'Sent') throw new BusinessError(`Hanya status Sent yang bisa di-Reject. Status saat ini: ${q.status}.`);
      return tx.quotation.update({
        where: { id: q.id },
        data: { status: 'Rejected', rejectedAt: new Date(), rejectReason: body.reason },
      });
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /quotations/:id/reject', 'Gagal menolak penawaran.');
  }
});

// PATCH /:id/cancel: any status to Cancelled, blocked if converted (requires the doc.cancel capability)
router.patch('/:id/cancel', requireCap('doc.cancel'), async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const q = await tx.quotation.findUnique({ where: { id: req.params.id as string } });
      if (!q) throw new BusinessError('Penawaran tidak ditemukan.');
      if (q.convertedAt) {
        throw new BusinessError('Penawaran sudah dikonversi ke Sales Invoice. Batalkan invoice-nya terlebih dulu.');
      }
      if (q.status === 'Cancelled') throw new BusinessError('Penawaran sudah dibatalkan.');
      return tx.quotation.update({
        where: { id: q.id },
        data: { status: 'Cancelled', cancelledAt: new Date() },
      });
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /quotations/:id/cancel', 'Gagal membatalkan penawaran.');
  }
});

// GET /:id/convert-payload — return prefill data for the sales-invoice modal
// Frontend uses this to open SalesInvoiceModal with the quotation's items,
// then POSTs to /api/sales/invoices which already handles GL posting.
// After the invoice is created, call POST /:id/link to attach it.
router.get('/:id/convert-payload', async (req, res) => {
  try {
    const q = await prisma.quotation.findUnique({
      where: { id: req.params.id as string },
      include: {
        items: {
          include: {
            inventoryItem: { select: { id: true, code: true, name: true, unit: true, currentStock: true } },
            serviceItem: { select: { id: true, code: true, name: true } },
          },
        },
        customer: { select: { id: true, name: true } },
      },
    });
    if (!q) return res.status(404).json({ error: 'Penawaran tidak ditemukan.' });
    if (q.status !== 'Accepted') {
      return res.status(400).json({ error: `Hanya penawaran Accepted yang bisa dikonversi. Status saat ini: ${q.status}.` });
    }
    if (q.salesInvoiceId) {
      return res.status(400).json({ error: 'Penawaran sudah dikonversi.' });
    }
    return res.json({
      quotationId: q.id,
      quotationNumber: q.quotationNumber,
      partyId: q.partyId,
      partyName: q.customer.name,
      potongan: Number(q.potongan),
      biayaLain: Number(q.biayaLain),
      labelPotongan: q.labelPotongan,
      labelBiaya: q.labelBiaya,
      terms: q.terms,
      notes: q.notes,
      items: q.items.map((it) => ({
        itemType: it.itemType,
        inventoryItemId: it.inventoryItemId,
        serviceItemId: it.serviceItemId,
        accountId: it.accountId,
        itemName: it.itemName,
        quantity: Number(it.quantity),
        unit: it.unit,
        rate: Number(it.rate),
        discount: Number(it.discount),
        taxPct: Number(it.taxPct),
        pphPct: Number(it.pphPct),
        description: it.description,
      })),
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /quotations/:id/convert-payload', 'Gagal mengambil data konversi.');
  }
});

// POST /:id/link — attach a freshly-created Sales Invoice to this quotation
// Called by the frontend after POST /api/sales/invoices succeeds. Splitting
// invoice creation (which posts GL via existing logic) from quotation linking
// keeps GL posting logic single-sourced in routes/sales.ts.
router.post('/:id/link', async (req, res) => {
  const { salesInvoiceId } = req.body ?? {};
  if (!salesInvoiceId || typeof salesInvoiceId !== 'string') {
    return res.status(400).json({ error: 'salesInvoiceId wajib diisi.' });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const q = await tx.quotation.findUnique({ where: { id: req.params.id as string } });
      if (!q) throw new BusinessError('Penawaran tidak ditemukan.');
      if (q.status !== 'Accepted') {
        throw new BusinessError(`Hanya Accepted yang bisa di-link ke invoice. Status: ${q.status}.`);
      }
      if (q.salesInvoiceId) throw new BusinessError('Penawaran sudah ter-link ke invoice lain.');

      const invoice = await tx.salesInvoice.findUnique({ where: { id: salesInvoiceId } });
      if (!invoice) throw new BusinessError('Sales Invoice tidak ditemukan.');
      if (invoice.partyId !== q.partyId) {
        throw new BusinessError('Customer pada invoice tidak sama dengan penawaran.');
      }

      return tx.quotation.update({
        where: { id: q.id },
        data: { salesInvoiceId, convertedAt: new Date() },
        include: { salesInvoice: { select: { id: true, invoiceNumber: true } } },
      });
    });
    logger.info({ quotationId: req.params.id as string, salesInvoiceId }, 'Quotation linked to sales invoice');
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /quotations/:id/link', 'Gagal me-link invoice ke penawaran.');
  }
});

export default router;
