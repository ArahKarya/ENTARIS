import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { BusinessError, handleRouteError } from '../utils/errors';
import { validateBody } from '../utils/validate';
import { CreateProformaSchema, UpdateProformaSchema } from '../utils/schemas';
import { logger } from '../lib/logger';
import { parseListPaging } from '../utils/listQuery';
import { resolveItems, computeTotals } from '../services/salesDocTotals';
import { computePaymentInfo, deriveDisplayStatus } from '../services/proformaStatus';

const router = Router();

// Proforma Invoice: tagihan awal (mis. DP). TIDAK ada stok, GL, atau piutang.
// DP dicatat lewat alur Customer Deposit (payments.proforma_invoice_id).

const DETAIL_INCLUDE = {
  customer: true,
  items: {
    include: {
      inventoryItem: { select: { id: true, code: true, name: true, unit: true } },
      serviceItem: { select: { id: true, code: true, name: true } },
    },
  },
  user: { select: { id: true, fullName: true } },
  quotation: { select: { id: true, quotationNumber: true } },
  salesOrder: { select: { id: true, soNumber: true } },
  salesInvoice: { select: { id: true, invoiceNumber: true, date: true, grandTotal: true } },
  deposits: {
    where: { status: 'Submitted', paymentType: 'CustomerDeposit' },
    select: { id: true, paymentNumber: true, date: true, amount: true },
    orderBy: { date: 'asc' },
  },
} satisfies Prisma.ProformaInvoiceInclude;

type ProformaWithDeposits = Prisma.ProformaInvoiceGetPayload<{ include: { deposits: { select: { amount: true } } } }>;

function withPayment<T extends ProformaWithDeposits>(pf: T) {
  const payment = computePaymentInfo(pf.grandTotal, pf.requestedAmount, pf.deposits.map((d) => d.amount));
  const displayStatus = deriveDisplayStatus(pf.status, pf.validUntil, payment);
  return { ...pf, payment, displayStatus };
}

async function loadOr404(id: string) {
  const pf = await prisma.proformaInvoice.findUnique({ where: { id }, include: DETAIL_INCLUDE });
  if (!pf) throw new BusinessError('Proforma Invoice tidak ditemukan.');
  return pf;
}

// GET / — daftar. Query: page, limit, status (stored|display), partyId, search.
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 50, maxLimit: 500 });
    const where: Prisma.ProformaInvoiceWhereInput = {};
    if (typeof query.partyId === 'string' && query.partyId) where.partyId = query.partyId;
    const search = typeof query.search === 'string' ? query.search.trim() : '';
    if (search) {
      where.OR = [
        { proformaNumber: { contains: search, mode: 'insensitive' } },
        { customer: { name: { contains: search, mode: 'insensitive' } } },
      ];
    }
    const wanted = typeof query.status === 'string' ? query.status : '';
    const stored = ['Draft', 'Sent', 'Converted', 'Cancelled'];
    // Status tersimpan difilter di DB; status turunan (Paid/PartiallyPaid/Expired) difilter setelah dihitung.
    if (stored.includes(wanted)) where.status = wanted as Prisma.ProformaInvoiceWhereInput['status'];

    const rows = await prisma.proformaInvoice.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, phone: true, email: true } },
        items: true,
        deposits: { where: { status: 'Submitted', paymentType: 'CustomerDeposit' }, select: { amount: true } },
        quotation: { select: { id: true, quotationNumber: true } },
        salesOrder: { select: { id: true, soNumber: true } },
        salesInvoice: { select: { id: true, invoiceNumber: true } },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });
    let data = rows.map(withPayment);
    if (wanted && !stored.includes(wanted)) data = data.filter((r) => r.displayStatus === wanted);
    const total = data.length;
    return res.json({ data: data.slice(skip, skip + take), total, page, limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /proforma-invoices', 'Gagal mengambil data proforma invoice.');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const pf = await loadOr404(req.params.id as string);
    return res.json(withPayment(pf));
  } catch (error) {
    return handleRouteError(res, error, 'GET /proforma-invoices/:id', 'Gagal mengambil detail proforma invoice.');
  }
});

function assertRequestedNotAbove(grandTotal: number, requested: number | null | undefined) {
  if (requested != null && requested > grandTotal) {
    throw new BusinessError('Jumlah tagihan tidak boleh melebihi total proforma.');
  }
}

// POST / — buat Draft (bebas, atau tertaut quotationId / salesOrderId yang dikirim client).
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateProformaSchema, req.body, res);
  if (!body) return;
  try {
    const date = new Date(body.date);
    const validUntil = new Date(body.validUntil);
    if (isNaN(date.getTime())) throw new BusinessError('Format tanggal tidak valid.');
    if (isNaN(validUntil.getTime())) throw new BusinessError('Format tanggal berlaku-sampai tidak valid.');

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      if (body.quotationId) {
        const q = await tx.quotation.findUnique({ where: { id: body.quotationId } });
        if (!q) throw new BusinessError('Penawaran asal tidak ditemukan.');
        if (q.status === 'Cancelled' || q.status === 'Rejected') {
          throw new BusinessError(`Penawaran berstatus ${q.status}, tidak bisa dibuatkan proforma.`);
        }
        if (q.partyId !== body.partyId) throw new BusinessError('Customer tidak sama dengan penawaran asal.');
      }
      if (body.salesOrderId) {
        const so = await tx.salesOrder.findUnique({ where: { id: body.salesOrderId } });
        if (!so) throw new BusinessError('Sales Order asal tidak ditemukan.');
        if (so.status === 'Cancelled') throw new BusinessError('Sales Order sudah dibatalkan.');
        if (so.partyId !== body.partyId) throw new BusinessError('Customer tidak sama dengan Sales Order asal.');
      }
      const fiscalYear = await getOpenFiscalYear(tx, date);
      const proformaNumber = await generateDocumentNumber(tx, 'PRO', date, fiscalYear.id);
      const items = resolveItems(body.items);
      const totals = computeTotals(items, body.potongan ?? 0, body.biayaLain ?? 0);
      assertRequestedNotAbove(totals.grandTotal, body.requestedAmount);

      return tx.proformaInvoice.create({
        data: {
          proformaNumber,
          date,
          validUntil,
          partyId: body.partyId,
          customerRefNo: body.customerRefNo || null,
          quotationId: body.quotationId || null,
          salesOrderId: body.salesOrderId || null,
          status: 'Draft',
          subtotal: totals.subtotal,
          taxPct: 0,
          potongan: body.potongan ?? 0,
          biayaLain: body.biayaLain ?? 0,
          labelPotongan: body.labelPotongan || null,
          labelBiaya: body.labelBiaya || null,
          grandTotal: totals.grandTotal,
          requestedAmount: body.requestedAmount ?? null,
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
    return handleRouteError(res, error, 'POST /proforma-invoices', 'Gagal membuat proforma invoice.');
  }
});

// PUT /:id — edit (Draft saja).
router.put('/:id', async (req: AuthRequest, res) => {
  const body = validateBody(UpdateProformaSchema, req.body, res);
  if (!body) return;
  try {
    const date = new Date(body.date);
    const validUntil = new Date(body.validUntil);
    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const existing = await tx.proformaInvoice.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new BusinessError('Proforma Invoice tidak ditemukan.');
      if (existing.status !== 'Draft') {
        throw new BusinessError(`Hanya proforma berstatus Draft yang dapat diedit. Status saat ini: ${existing.status}.`);
      }
      if (body.partyId !== existing.partyId && (existing.quotationId || existing.salesOrderId)) {
        throw new BusinessError('Customer tidak bisa diganti pada proforma yang berasal dari penawaran / Sales Order.');
      }
      const items = resolveItems(body.items);
      const totals = computeTotals(items, body.potongan ?? 0, body.biayaLain ?? 0);
      assertRequestedNotAbove(totals.grandTotal, body.requestedAmount);

      await tx.proformaInvoiceItem.deleteMany({ where: { proformaId: existing.id } });
      return tx.proformaInvoice.update({
        where: { id: existing.id },
        data: {
          date,
          validUntil,
          partyId: body.partyId,
          customerRefNo: body.customerRefNo || null,
          subtotal: totals.subtotal,
          potongan: body.potongan ?? 0,
          biayaLain: body.biayaLain ?? 0,
          labelPotongan: body.labelPotongan || null,
          labelBiaya: body.labelBiaya || null,
          grandTotal: totals.grandTotal,
          requestedAmount: body.requestedAmount ?? null,
          terms: body.terms || null,
          notes: body.notes || null,
          items: { create: items },
        },
        include: { items: true, customer: true },
      });
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /proforma-invoices/:id', 'Gagal memperbarui proforma invoice.');
  }
});

// DELETE /:id — hapus permanen, Draft saja.
router.delete('/:id', async (req, res) => {
  try {
    const existing = await prisma.proformaInvoice.findUnique({ where: { id: req.params.id as string } });
    if (!existing) return res.status(404).json({ error: 'Proforma Invoice tidak ditemukan.' });
    if (existing.status !== 'Draft') {
      return res.status(400).json({ error: 'Hanya proforma Draft yang bisa dihapus. Gunakan Batalkan untuk yang sudah diterbitkan.' });
    }
    await prisma.proformaInvoice.delete({ where: { id: existing.id } });
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /proforma-invoices/:id', 'Gagal menghapus proforma invoice.');
  }
});

// PATCH /:id/send — Draft → Sent.
router.patch('/:id/send', async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const pf = await tx.proformaInvoice.findUnique({ where: { id: req.params.id as string }, include: { items: true } });
      if (!pf) throw new BusinessError('Proforma Invoice tidak ditemukan.');
      if (pf.status !== 'Draft') throw new BusinessError(`Hanya Draft yang bisa dikirim. Status saat ini: ${pf.status}.`);
      if (pf.items.length === 0) throw new BusinessError('Proforma harus memiliki minimal satu item.');
      const endOfValid = new Date(pf.validUntil);
      endOfValid.setUTCHours(23, 59, 59, 999);
      if (endOfValid < new Date()) throw new BusinessError('Tanggal berlaku-sampai sudah lewat. Edit dulu sebelum mengirim.');
      return tx.proformaInvoice.update({ where: { id: pf.id }, data: { status: 'Sent', sentAt: new Date() } });
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /proforma-invoices/:id/send', 'Gagal mengirim proforma invoice.');
  }
});

// PATCH /:id/cancel — batalkan. Ditolak bila sudah dikonversi atau sudah ada DP aktif tertaut
// (DP harus dibatalkan / dialihkan lewat alur Uang Muka Pelanggan supaya GL tetap benar).
router.patch('/:id/cancel', requireCap('doc.cancel'), async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const pf = await tx.proformaInvoice.findUnique({ where: { id: req.params.id as string } });
      if (!pf) throw new BusinessError('Proforma Invoice tidak ditemukan.');
      if (pf.status === 'Cancelled') throw new BusinessError('Proforma Invoice sudah dibatalkan.');
      if (pf.status === 'Converted') {
        throw new BusinessError('Proforma sudah dikonversi ke Sales Invoice. Batalkan invoice-nya terlebih dulu.');
      }
      const activeDeposits = await tx.payment.count({
        where: { proformaInvoiceId: pf.id, status: 'Submitted', paymentType: 'CustomerDeposit' },
      });
      if (activeDeposits > 0) {
        throw new BusinessError(`Masih ada ${activeDeposits} uang muka aktif tertaut. Batalkan uang muka itu dulu lewat menu Uang Muka Customer.`);
      }
      return tx.proformaInvoice.update({ where: { id: pf.id }, data: { status: 'Cancelled', cancelledAt: new Date() } });
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /proforma-invoices/:id/cancel', 'Gagal membatalkan proforma invoice.');
  }
});

// GET /:id/convert-payload — data prefill modal Sales Invoice (GL tetap lewat satu jalur resmi di /api/sales).
router.get('/:id/convert-payload', async (req, res) => {
  try {
    const pf = await loadOr404(req.params.id as string);
    if (pf.status !== 'Sent') {
      return res.status(400).json({ error: `Hanya proforma berstatus Sent yang bisa dikonversi. Status saat ini: ${pf.status}.` });
    }
    const payment = computePaymentInfo(pf.grandTotal, pf.requestedAmount, pf.deposits.map((d) => d.amount));
    return res.json({
      proformaId: pf.id,
      proformaNumber: pf.proformaNumber,
      partyId: pf.partyId,
      partyName: pf.customer.name,
      customerRefNo: pf.customerRefNo,
      potongan: Number(pf.potongan),
      biayaLain: Number(pf.biayaLain),
      labelPotongan: pf.labelPotongan,
      labelBiaya: pf.labelBiaya,
      terms: pf.terms,
      notes: pf.notes,
      // DP yang sudah masuk TIDAK otomatis diterapkan; pakai "Terapkan Uang Muka" setelah invoice terbit.
      depositPaid: payment.paid,
      depositPaymentNumbers: pf.deposits.map((d) => d.paymentNumber),
      items: pf.items.map((it) => ({
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
    return handleRouteError(res, error, 'GET /proforma-invoices/:id/convert-payload', 'Gagal mengambil data konversi.');
  }
});

// POST /:id/link — tautkan Sales Invoice yang baru dibuat; proforma jadi Converted.
router.post('/:id/link', async (req, res) => {
  const { salesInvoiceId } = req.body ?? {};
  if (!salesInvoiceId || typeof salesInvoiceId !== 'string') {
    return res.status(400).json({ error: 'salesInvoiceId wajib diisi.' });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const pf = await tx.proformaInvoice.findUnique({ where: { id: req.params.id as string } });
      if (!pf) throw new BusinessError('Proforma Invoice tidak ditemukan.');
      if (pf.status !== 'Sent') throw new BusinessError(`Hanya proforma Sent yang bisa di-link ke invoice. Status: ${pf.status}.`);
      if (pf.salesInvoiceId) throw new BusinessError('Proforma sudah ter-link ke invoice lain.');
      const invoice = await tx.salesInvoice.findUnique({ where: { id: salesInvoiceId } });
      if (!invoice) throw new BusinessError('Sales Invoice tidak ditemukan.');
      if (invoice.status === 'Cancelled') throw new BusinessError('Sales Invoice sudah dibatalkan.');
      if (invoice.partyId !== pf.partyId) throw new BusinessError('Customer pada invoice tidak sama dengan proforma.');
      const taken = await tx.proformaInvoice.findFirst({ where: { salesInvoiceId }, select: { proformaNumber: true } });
      if (taken) throw new BusinessError(`Invoice ini sudah ter-link ke proforma ${taken.proformaNumber}.`);
      return tx.proformaInvoice.update({
        where: { id: pf.id },
        data: { status: 'Converted', salesInvoiceId, convertedAt: new Date() },
        include: { salesInvoice: { select: { id: true, invoiceNumber: true } } },
      });
    });
    logger.info({ proformaId: req.params.id as string, salesInvoiceId }, 'Proforma linked to sales invoice');
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /proforma-invoices/:id/link', 'Gagal me-link invoice ke proforma.');
  }
});

export default router;
