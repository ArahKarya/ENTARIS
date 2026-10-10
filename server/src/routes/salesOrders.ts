import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { hasCap } from '../services/permissionService';
import { validateBody } from '../utils/validate';
import {
  CreateSalesOrderSchema,
  UpdateSalesOrderSchema,
  GenerateDOFromSOSchema,
} from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { submitDeliveryOrderInTx } from '../services/deliveryOrderSubmit';
import { recomputeDeliveredQtyInTx } from '../services/salesOrderDelivery';
import { assertQuotationLinkable, resolveSalesOrderQuotationId } from '../services/salesDocumentLinks';
import { logger } from '../lib/logger';
import { parseListPaging, parseSort } from '../utils/listQuery';
import {
  buildSalesOrderWhere,
  DEFAULT_SALES_ORDER_SORT,
  SALES_ORDER_SORT_FIELDS,
  salesOrderOrderBy,
  summarizeSalesOrders,
} from '../services/salesOrderList';
import Decimal from 'decimal.js';

const router = Router();

// Akses modul 'sales_order' di-enforce di mount (index.ts).
// Bypass stok minus = capability 'inventory.negative_stock'.

function computeTotals(input: {
  items: { quantity: number; rate: number; discount: number; amount: number }[];
  potongan: number;
  biayaLain: number;
  taxPct: number;
}) {
  const subtotal = input.items.reduce((s, it) => s + Number(it.amount), 0);
  const afterDisc = Math.max(0, subtotal - input.potongan);
  const taxAmt = afterDisc * (input.taxPct / 100);
  const grandTotal = afterDisc + taxAmt + input.biayaLain;
  return {
    subtotal: new Decimal(subtotal).toDecimalPlaces(2).toNumber(),
    grandTotal: new Decimal(grandTotal).toDecimalPlaces(2).toNumber(),
  };
}

// SO delivered-qty + status are derived from the linked DO lines via
// recomputeDeliveredQtyInTx (services/salesOrderDelivery) — the single source
// of truth shared by generate-do, DO edit, and DO cancel.

// GET / list
// Query: page, limit (≤200), status, partyId, startDate, endDate (YYYY-MM-DD),
// search (SO number / customer name / customer ref), sort (e.g. "-date").
// → { data, total, page, limit }
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    // Max 200 kept for callers that still load a whole list (DO modal "Tarik dari SO").
    const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 50, maxLimit: 200 });
    const filter = buildSalesOrderWhere(query);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { where } = filter;
    const sort = parseSort(query.sort, SALES_ORDER_SORT_FIELDS, DEFAULT_SALES_ORDER_SORT);

    const [data, total] = await Promise.all([
      prisma.salesOrder.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          _count: { select: { items: true, deliveryOrders: true } },
        },
        orderBy: salesOrderOrderBy(sort),
        skip,
        take,
      }),
      prisma.salesOrder.count({ where }),
    ]);

    return res.json({ data, total, page, limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /sales-orders', 'Gagal mengambil daftar Sales Order.');
  }
});

// GET /summary
// KPI totals for the same filters as the list. Declared before /:id.
router.get('/summary', async (req, res) => {
  try {
    const filter = buildSalesOrderWhere(req.query as Record<string, unknown>);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const groups = await prisma.salesOrder.groupBy({
      by: ['status'],
      where: filter.where,
      _count: { _all: true },
      _sum: { grandTotal: true },
    });
    return res.json(summarizeSalesOrders(groups));
  } catch (error) {
    return handleRouteError(res, error, 'GET /sales-orders/summary', 'Gagal menghitung ringkasan Sales Order.');
  }
});

// GET /:id detail
router.get('/:id', async (req, res) => {
  try {
    const so = await prisma.salesOrder.findUnique({
      where: { id: req.params.id as string },
      include: {
        customer: true,
        items: { include: { inventoryItem: { select: { id: true, code: true, name: true, unit: true, currentStock: true } } } },
        deliveryOrders: {
          select: {
            id: true, doNumber: true, date: true, status: true,
            items: { select: { itemName: true, quantity: true, unit: true } },
            invoice: { select: { id: true, invoiceNumber: true, date: true, grandTotal: true, outstanding: true, status: true } },
          },
          orderBy: { date: 'asc' },
        },
        quotation: { select: { id: true, quotationNumber: true } },
        user: { select: { id: true, fullName: true } },
        depositPayments: {
          where: { status: { not: 'Cancelled' }, paymentType: 'CustomerDeposit' },
          select: {
            id: true, paymentNumber: true, date: true, amount: true, refundedAmount: true,
            customerDepositApplications: { where: { isCancelled: false }, select: { appliedAmount: true } },
          },
          orderBy: { date: 'desc' },
        },
      },
    });
    if (!so) throw new BusinessError('Sales Order tidak ditemukan.');
    // Ringkasan uang muka: total DP diterima (net refund) untuk SO ini + sisa
    // tagihan vs grand total. Helper untuk panel progress di UI.
    const depositReceived = so.depositPayments.reduce(
      (sum, p) => sum + (Number(p.amount) - Number(p.refundedAmount)),
      0,
    );
    // Uang muka yang sudah dipakai ke invoice (aplikasi deposit non-cancel).
    const depositApplied = so.depositPayments.reduce(
      (sum, p) => sum + (p.customerDepositApplications ?? []).reduce((a, x) => a + Number(x.appliedAmount), 0),
      0,
    );
    const grandTotal = Number(so.grandTotal);
    res.json({
      ...so,
      depositSummary: {
        received: depositReceived,
        applied: depositApplied,
        depositRemaining: Math.max(0, depositReceived - depositApplied),
        grandTotal,
        remaining: Math.max(0, grandTotal - depositReceived),
        pct: grandTotal > 0 ? Math.round((depositReceived / grandTotal) * 100) : 0,
      },
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /sales-orders/:id', 'Gagal mengambil Sales Order.');
  }
});

// POST / create
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateSalesOrderSchema, req.body, res);
  if (!body) return;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const date = new Date(body.date);
      const fy = await getOpenFiscalYear(tx, date);
      if (body.quotationId) await assertQuotationLinkable(tx, body.quotationId, body.partyId);
      const soNumber = await generateDocumentNumber(tx, 'PSN', date, fy.id);
      const { subtotal, grandTotal } = computeTotals({
        items: body.items.map((i) => ({ quantity: i.quantity, rate: i.rate, discount: i.discount, amount: i.amount })),
        potongan: body.potongan,
        biayaLain: body.biayaLain,
        taxPct: body.taxPct,
      });

      const so = await tx.salesOrder.create({
        data: {
          soNumber,
          date,
          expectedDelivery: body.expectedDelivery ? new Date(body.expectedDelivery) : null,
          partyId: body.partyId,
          customerRefNo: body.customerRefNo ?? null,
          quotationId: body.quotationId ?? null,
          status: 'Draft',
          notes: body.notes ?? null,
          subtotal,
          taxPct: body.taxPct,
          potongan: body.potongan,
          biayaLain: body.biayaLain,
          grandTotal,
          fiscalYearId: fy.id,
          createdBy: req.user!.userId,
          items: {
            create: body.items.map((i) => ({
              inventoryItemId: i.inventoryItemId ?? null,
              itemName: i.itemName,
              quantity: i.quantity,
              unit: i.unit,
              rate: i.rate,
              discount: i.discount,
              amount: i.amount,
              description: i.description ?? null,
            })),
          },
        },
        include: { items: true, customer: true },
      });
      return so;
    });
    res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /sales-orders', 'Gagal membuat Sales Order.');
  }
});

// PUT /:id edit
router.put('/:id', async (req: AuthRequest, res) => {
  const body = validateBody(UpdateSalesOrderSchema, req.body, res);
  if (!body) return;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const so = await tx.salesOrder.findUnique({ where: { id: req.params.id as string }, include: { items: true } });
      if (!so) throw new BusinessError('Sales Order tidak ditemukan.');
      if (so.status !== 'Draft') {
        throw new BusinessError('Sales Order yang sudah Submitted tidak bisa diedit. Cancel dulu kalau perlu.');
      }
      const { subtotal, grandTotal } = computeTotals({
        items: body.items.map((i) => ({ quantity: i.quantity, rate: i.rate, discount: i.discount, amount: i.amount })),
        potongan: body.potongan,
        biayaLain: body.biayaLain,
        taxPct: body.taxPct,
      });
      const quotationId = await resolveSalesOrderQuotationId(tx, body.quotationId, so.quotationId, body.partyId);
      await tx.salesOrderItem.deleteMany({ where: { salesOrderId: so.id } });
      const updated = await tx.salesOrder.update({
        where: { id: so.id },
        data: {
          date: new Date(body.date),
          expectedDelivery: body.expectedDelivery ? new Date(body.expectedDelivery) : null,
          partyId: body.partyId,
          customerRefNo: body.customerRefNo ?? null,
          quotationId,
          notes: body.notes ?? null,
          subtotal,
          taxPct: body.taxPct,
          potongan: body.potongan,
          biayaLain: body.biayaLain,
          grandTotal,
          items: {
            create: body.items.map((i) => ({
              inventoryItemId: i.inventoryItemId ?? null,
              itemName: i.itemName,
              quantity: i.quantity,
              unit: i.unit,
              rate: i.rate,
              discount: i.discount,
              amount: i.amount,
              description: i.description ?? null,
            })),
          },
        },
        include: { items: true, customer: true },
      });
      return updated;
    });
    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /sales-orders/:id', 'Gagal mengupdate Sales Order.');
  }
});

// POST /:id/submit
router.post('/:id/submit', async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const so = await tx.salesOrder.findUnique({ where: { id: req.params.id as string } });
      if (!so) throw new BusinessError('Sales Order tidak ditemukan.');
      if (so.status !== 'Draft') throw new BusinessError('Hanya SO status Draft yang bisa di-submit.');
      return tx.salesOrder.update({
        where: { id: so.id },
        data: { status: 'Submitted', submittedAt: new Date() },
        include: { items: true, customer: true },
      });
    });
    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /sales-orders/:id/submit', 'Gagal submit Sales Order.');
  }
});

// POST /:id/cancel
router.post('/:id/cancel', async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const so = await tx.salesOrder.findUnique({ where: { id: req.params.id as string } });
      if (!so) throw new BusinessError('Sales Order tidak ditemukan.');
      if (so.status === 'Cancelled') throw new BusinessError('Sales Order sudah dibatalkan.');
      const activeDOs = await tx.deliveryOrder.count({
        where: { salesOrderId: so.id, status: { not: 'Cancelled' } },
      });
      if (activeDOs > 0) {
        throw new BusinessError(`Sales Order punya ${activeDOs} Surat Jalan aktif. Batalkan SJ dulu sebelum cancel SO.`);
      }
      return tx.salesOrder.update({
        where: { id: so.id },
        data: { status: 'Cancelled', cancelledAt: new Date() },
      });
    });
    res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /sales-orders/:id/cancel', 'Gagal cancel Sales Order.');
  }
});

// POST /:id/generate-do: generate DeliveryOrder dari SO
router.post('/:id/generate-do', async (req: AuthRequest, res) => {
  const body = validateBody(GenerateDOFromSOSchema, req.body, res);
  if (!body) return;
  if (body.allowNegativeStock && !(await hasCap(req.user!.role, 'inventory.negative_stock'))) {
    return res.status(403).json({ error: 'Hanya Admin yang dapat bypass validasi stok.' });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      const so = await tx.salesOrder.findUnique({
        where: { id: req.params.id as string },
        include: { items: true },
      });
      if (!so) throw new BusinessError('Sales Order tidak ditemukan.');
      if (so.status !== 'Submitted' && so.status !== 'PartiallyDelivered') {
        throw new BusinessError('Hanya SO status Submitted atau PartiallyDelivered yang bisa generate Surat Jalan.');
      }

      // Validate every body item references a valid SO item. Over-delivery
      // (qty > sisa belum dikirim) is ALLOWED — staff can ship more than
      // ordered; the SO reflects it as "+X lebih". Just log it for an audit
      // trail instead of blocking.
      const soItemMap = new Map(so.items.map((it) => [it.id, it]));
      for (const bIt of body.items) {
        const soItem = soItemMap.get(bIt.salesOrderItemId);
        if (!soItem) throw new BusinessError(`SO item ${bIt.salesOrderItemId} tidak ditemukan di SO ini.`);
        const remaining = new Decimal(soItem.quantity.toString()).minus(new Decimal(soItem.deliveredQty.toString()));
        if (new Decimal(bIt.quantity).gt(remaining)) {
          logger.info(
            { soId: so.id, soNumber: so.soNumber, soItemId: soItem.id, itemName: soItem.itemName, qty: bIt.quantity, remaining: remaining.toString() },
            'Generate DO with over-delivery (qty exceeds remaining SO qty)',
          );
        }
      }

      // Build DO body for the existing submitDeliveryOrder service.
      const doBody = {
        date: body.date,
        partyId: so.partyId,
        nomorMobil: body.nomorMobil ?? null,
        driverName: body.driverName ?? null,
        recipientName: body.recipientName ?? null,
        notes: body.notes ?? `Auto dari SO ${so.soNumber}`,
        allowNegativeStock: body.allowNegativeStock,
        negativeStockReason: body.negativeStockReason ?? null,
        temporaryNoteIds: body.temporaryNoteIds,
        items: body.items.map((bIt) => {
          const soItem = soItemMap.get(bIt.salesOrderItemId)!;
          return {
            inventoryItemId: soItem.inventoryItemId,
            warehouseId: bIt.warehouseId ?? null,
            itemName: soItem.itemName,
            quantity: bIt.quantity,
            unit: soItem.unit,
            description: bIt.description ?? soItem.description ?? null,
          };
        }),
      };
      const doResult = await submitDeliveryOrderInTx(tx, doBody, req.user!.userId);

      // Link DO ke SO dan link masing-masing DO item ke SO item.
      await tx.deliveryOrder.update({ where: { id: doResult.id }, data: { salesOrderId: so.id } });
      const doItems = await tx.deliveryOrderItem.findMany({ where: { deliveryOrderId: doResult.id }, orderBy: { createdAt: 'asc' } });
      for (let i = 0; i < body.items.length; i++) {
        const bIt = body.items[i];
        const doItem = doItems[i];
        if (!doItem) continue;
        await tx.deliveryOrderItem.update({ where: { id: doItem.id }, data: { salesOrderItemId: bIt.salesOrderItemId } });
      }

      // delivered_qty + status derived from the actual linked DO lines.
      await recomputeDeliveredQtyInTx(tx, so.id);

      return tx.deliveryOrder.findUnique({
        where: { id: doResult.id },
        include: { items: true, customer: true, salesOrder: { select: { id: true, soNumber: true } } },
      });
    }, { timeout: 30000 });

    logger.info({ doId: result?.id, soId: req.params.id }, 'DO generated from SO');
    res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /sales-orders/:id/generate-do', 'Gagal generate Surat Jalan dari Sales Order.');
  }
});

export default router;
