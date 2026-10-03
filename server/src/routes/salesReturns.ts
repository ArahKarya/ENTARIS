import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest, requireCap } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreateSalesReturnSchema } from '../utils/schemas';
import { handleRouteError } from '../utils/errors';
import { submitSalesReturnInTx } from '../services/salesReturnSubmit';
import { cancelSalesReturnInTx } from '../services/salesReturnCancel';
import { needsApproval, queueApproval, approvalsLink } from '../services/approvalGate';
import { notifyAdmins } from '../services/notificationService';
import { logger } from '../lib/logger';
import { parseListPaging, parseSort } from '../utils/listQuery';
import {
  buildSalesReturnWhere,
  DEFAULT_SALES_RETURN_SORT,
  SALES_RETURN_SORT_FIELDS,
  salesReturnOrderBy,
} from '../services/salesReturnList';

const router = Router();

// GET /api/sales-returns — list
// Query: page, limit (default 50, ≤200), status, partyId, salesInvoiceId,
// startDate/endDate (YYYY-MM-DD), search (return / customer / invoice number),
// sort (date | returnNumber | customer | totalReturn, "-" = desc; default -date)
// → { data, total, page, limit }
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 50, maxLimit: 200 });
    const filter = buildSalesReturnWhere(query);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { where } = filter;
    const sort = parseSort(query.sort, SALES_RETURN_SORT_FIELDS, DEFAULT_SALES_RETURN_SORT);

    const [data, total] = await Promise.all([
      prisma.salesReturn.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          salesInvoice: { select: { id: true, invoiceNumber: true } },
          items: true,
        },
        orderBy: salesReturnOrderBy(sort),
        skip,
        take,
      }),
      prisma.salesReturn.count({ where }),
    ]);
    return res.json({ data, total, page, limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /sales-returns error');
    return res.status(500).json({ error: 'Gagal mengambil data retur penjualan.' });
  }
});

// GET /api/sales-returns/eligible/:invoiceId — invoice lines + remaining returnable qty
router.get('/eligible/:invoiceId', async (req, res) => {
  try {
    const invoice = await prisma.salesInvoice.findUnique({
      where: { id: req.params.invoiceId as string },
      include: {
        customer: { select: { id: true, name: true } },
        items: {
          include: {
            inventoryItem: { select: { id: true, name: true } },
            warehouse: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!invoice) return res.status(404).json({ error: 'Invoice tidak ditemukan.' });

    const prior = await prisma.salesReturnItem.groupBy({
      by: ['salesInvoiceItemId'],
      where: {
        salesInvoiceItemId: { in: invoice.items.map((i) => i.id) },
        salesReturn: { status: { not: 'Cancelled' } },
      },
      _sum: { quantity: true },
    });
    const returnedMap = new Map(prior.map((r) => [r.salesInvoiceItemId, Number(r._sum.quantity ?? 0)]));

    const lines = invoice.items.map((it) => {
      const returned = returnedMap.get(it.id) ?? 0;
      const remaining = Number(it.quantity) - returned;
      return {
        salesInvoiceItemId: it.id,
        itemName: it.itemName,
        inventoryItemId: it.inventoryItemId,
        isInventory: !!it.inventoryItemId,
        warehouseId: it.warehouseId,
        warehouseName: it.warehouse?.name ?? null,
        unit: it.unit,
        rate: Number(it.rate),
        discount: Number(it.discount),
        taxPct: Number(it.taxPct),
        quantity: Number(it.quantity),
        alreadyReturned: returned,
        remaining,
      };
    });

    return res.json({
      invoice: {
        id: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        status: invoice.status,
        outstanding: Number(invoice.outstanding),
        grandTotal: Number(invoice.grandTotal),
        customer: invoice.customer,
      },
      lines,
    });
  } catch (error) {
    logger.error({ error }, 'GET /sales-returns/eligible error');
    return res.status(500).json({ error: 'Gagal mengambil baris invoice untuk retur.' });
  }
});

// GET /api/sales-returns/:id — detail
router.get('/:id', async (req, res) => {
  try {
    const ret = await prisma.salesReturn.findUnique({
      where: { id: req.params.id as string },
      include: {
        customer: true,
        salesInvoice: { select: { id: true, invoiceNumber: true, grandTotal: true, outstanding: true } },
        items: true,
      },
    });
    if (!ret) return res.status(404).json({ error: 'Retur tidak ditemukan.' });

    const journal = await prisma.journalEntry.findUnique({
      where: { entryNumber: `JV-${ret.returnNumber}` },
      include: { items: { include: { account: { select: { id: true, accountNumber: true, name: true } } } } },
    });
    return res.json({ ...ret, journal: journal || null });
  } catch (error) {
    logger.error({ error }, 'GET /sales-returns/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail retur.' });
  }
});

// POST /api/sales-returns — create (approval-gated for non-Admin)
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateSalesReturnSchema, req.body, res);
  if (!body) return;

  try {
    if (await needsApproval(req.user!.role)) {
      const request = await prisma.$transaction((tx) =>
        queueApproval(tx, {
          documentType: 'SalesReturn',
          payload: req.body,
          amount: 0,
          requestedBy: req.user!.userId,
          label: 'Retur Penjualan (menunggu approval)',
        }),
      );
      const requester = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { fullName: true } });
      const link = approvalsLink(request.id);
      await notifyAdmins({
        type: 'approval_pending',
        title: '🔔 Persetujuan: Retur Penjualan',
        message: `Retur Penjualan dari ${requester?.fullName ?? 'staf'} menunggu persetujuan Anda.${link ? `\n\n🔗 Buka & proses: ${link}` : ''}`,
        metadata: { kind: 'approval', requestId: request.id, documentType: 'SalesReturn' },
        excludeUserId: req.user!.userId,
      });
      return res.status(202).json({ pendingApproval: true, request, message: 'Retur menunggu persetujuan manajer sebelum diproses.' });
    }

    const result = await prisma.$transaction(
      (tx) => submitSalesReturnInTx(tx, body, req.user!.userId),
      { timeout: 30000 },
    );
    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /sales-returns', 'Gagal menyimpan retur penjualan.');
  }
});

// POST /api/sales-returns/:id/cancel — Admin only
router.post('/:id/cancel', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(
      (tx) => cancelSalesReturnInTx(tx, req.params.id as string),
      { timeout: 15000 },
    );
    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /sales-returns/:id/cancel', 'Gagal membatalkan retur.');
  }
});

export default router;
