import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreateSalesInvoiceSchema } from '../utils/schemas';
import { handleRouteError } from '../utils/errors';
import { cancelSalesInvoiceInTx } from '../services/invoiceCancellation';
import { submitSalesInvoiceInTx } from '../services/salesInvoiceSubmit';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/sales/invoices
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '50', status, partyId } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: Prisma.SalesInvoiceWhereInput = {};
    if (status) where.status = status as any;
    if (partyId) where.partyId = partyId as string;

    const [invoices, total] = await Promise.all([
      prisma.salesInvoice.findMany({
        where,
        include: { customer: true, items: true },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.salesInvoice.count({ where }),
    ]);

    // Attach deductionTotal: sum of payment splits routed to non-cash accounts
    // (commission, discount, etc) per invoice. Single batched query.
    const invoiceIds = invoices.map((i) => i.id);
    let deductionMap: Record<string, number> = {};
    if (invoiceIds.length > 0) {
      const rows = await prisma.$queryRaw<Array<{ invoice_id: string; total: number }>>`
        SELECT pa.invoice_id::text AS invoice_id,
               COALESCE(SUM(ps.amount), 0)::float AS total
        FROM payment_allocations pa
        JOIN payments p ON p.id = pa.payment_id
        JOIN payment_splits ps ON ps.payment_id = p.id
        JOIN accounts a ON a.id = ps.account_id
        WHERE pa.invoice_type = 'SalesInvoice'
          AND pa.invoice_id IN (${Prisma.join(invoiceIds)})
          AND p.status != 'Cancelled'
          AND a."accountNumber" NOT LIKE '1.1%'
        GROUP BY pa.invoice_id
      `;
      deductionMap = Object.fromEntries(rows.map((r) => [r.invoice_id, Number(r.total)]));
    }

    const enriched = invoices.map((inv) => ({
      ...inv,
      deductionTotal: deductionMap[inv.id] ?? 0,
    }));

    return res.json({ data: enriched, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /sales/invoices error');
    return res.status(500).json({ error: 'Gagal mengambil data invoice penjualan.' });
  }
});

// GET /api/sales/invoices/:id — detail single invoice
router.get('/:id', async (req, res) => {
  try {
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: req.params.id },
      include: {
        customer: true,
        items: {
          include: {
            serviceItem: { select: { id: true, code: true, name: true } },
            deliveryOrderItem: {
              select: {
                id: true,
                deliveryOrder: { select: { id: true, doNumber: true, date: true } },
              },
            },
          },
        },
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });

    // Get payment allocations for this invoice — with splits so the PDF can
    // break down cash vs. non-cash portions (commission, discount, etc).
    const allocations = await prisma.paymentAllocation.findMany({
      where: { invoiceType: 'SalesInvoice', invoiceId: invoice.id },
      include: {
        payment: {
          select: {
            id: true, paymentNumber: true, date: true, amount: true, referenceNo: true,
            notes: true, status: true,
            account: { select: { id: true, accountNumber: true, name: true, rootType: true } },
            splits: {
              select: {
                id: true, amount: true, notes: true,
                account: { select: { id: true, accountNumber: true, name: true, rootType: true } },
              },
            },
          },
        },
      },
      orderBy: { payment: { date: 'desc' } },
    });

    // Get customer deposit applications for this invoice
    const depositApplications = await prisma.customerDepositApplication.findMany({
      where: { salesInvoiceId: invoice.id, isCancelled: false },
      include: { depositPayment: { select: { id: true, paymentNumber: true, date: true, amount: true } } },
      orderBy: { appliedAt: 'desc' },
    });

    return res.json({ ...invoice, paymentAllocations: allocations, depositApplications });
  } catch (error) {
    logger.error({ error }, 'GET /sales/invoices/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail invoice.' });
  }
});

// POST /api/sales/invoices — create sales invoice.
// Heavy lifting (validation, multi-account JE, stock, COGS) is in
// services/salesInvoiceSubmit.ts. This handler is a thin controller.
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateSalesInvoiceSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(
      (tx) => submitSalesInvoiceInTx(tx, body, req.user!.userId),
      { timeout: 15000 },
    );
    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /sales/invoices', 'Gagal menyimpan invoice penjualan.');
  }
});


// PUT /api/sales/invoices/:id — edit invoice (notes, dueDate, terms)
router.put('/:id', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  try {
    const invoice = await prisma.salesInvoice.findUnique({ where: { id: req.params.id as string } });
    if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });
    if (invoice.status === 'Cancelled') return res.status(400).json({ error: 'Invoice sudah dibatalkan, tidak bisa diedit.' });

    const { notes, dueDate, terms } = req.body;
    const data: Prisma.SalesInvoiceUpdateInput = {};
    if (notes !== undefined) data.notes = notes;
    if (dueDate !== undefined) data.dueDate = dueDate ? new Date(dueDate) : null;
    if (terms !== undefined) data.terms = terms || null;

    const updated = await prisma.salesInvoice.update({ where: { id: invoice.id }, data });
    return res.json(updated);
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /sales/invoices/:id', 'Gagal memperbarui invoice.');
  }
});

// POST /api/sales/invoices/:id/cancel — cancel sales invoice
router.post('/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(
      (tx) => cancelSalesInvoiceInTx(tx, req.params.id as string),
      { timeout: 15000 },
    );
    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /sales/invoices/:id/cancel', 'Gagal membatalkan invoice.');
  }
});

export default router;
