import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
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
import { logger } from '../lib/logger';
import Decimal from 'decimal.js';

const router = Router();

const READ_ROLES = ['Admin', 'Accountant', 'StaffProduksi', 'Viewer'];
const WRITE_ROLES = ['Admin', 'Accountant'];
const CANCEL_ROLES = ['Admin'];

// ─── Helpers ───────────────────────────────────────────────────────────────
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

async function refreshSOStatusInTx(tx: Prisma.TransactionClient, soId: string) {
  // Re-evaluate SO status from item delivered_qty vs quantity totals.
  const so = await tx.salesOrder.findUnique({
    where: { id: soId },
    include: { items: true },
  });
  if (!so) return;
  if (so.status === 'Cancelled' || so.status === 'Draft') return;
  const allFully = so.items.every((it) =>
    new Decimal(it.deliveredQty.toString()).gte(new Decimal(it.quantity.toString())),
  );
  const anyDelivered = so.items.some((it) =>
    new Decimal(it.deliveredQty.toString()).gt(0),
  );
  let newStatus = so.status;
  if (allFully) newStatus = 'FullyDelivered';
  else if (anyDelivered) newStatus = 'PartiallyDelivered';
  else newStatus = 'Submitted';
  if (newStatus !== so.status) {
    await tx.salesOrder.update({ where: { id: soId }, data: { status: newStatus } });
  }
}

// ─── GET / list ────────────────────────────────────────────────────────────
router.get('/', roleMiddleware(READ_ROLES), async (req, res) => {
  try {
    const { status, partyId, startDate, endDate, search, page = '1', limit = '50' } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: Prisma.SalesOrderWhereInput = {};
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
          { soNumber: { contains: q, mode: 'insensitive' } },
          { customer: { name: { contains: q, mode: 'insensitive' } } },
        ];
      }
    }

    const [data, total] = await Promise.all([
      prisma.salesOrder.findMany({
        where,
        include: {
          customer: { select: { id: true, name: true } },
          _count: { select: { items: true, deliveryOrders: true } },
        },
        orderBy: [{ date: 'desc' }, { soNumber: 'desc' }],
        skip,
        take,
      }),
      prisma.salesOrder.count({ where }),
    ]);

    res.json({ data, total, page: Number(page), limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /sales-orders', 'Gagal mengambil daftar Sales Order.');
  }
});

// ─── GET /:id detail ───────────────────────────────────────────────────────
router.get('/:id', roleMiddleware(READ_ROLES), async (req, res) => {
  try {
    const so = await prisma.salesOrder.findUnique({
      where: { id: req.params.id as string },
      include: {
        customer: true,
        items: { include: { inventoryItem: { select: { id: true, code: true, name: true, unit: true, currentStock: true } } } },
        deliveryOrders: { select: { id: true, doNumber: true, date: true, status: true } },
        quotation: { select: { id: true, quotationNumber: true } },
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!so) throw new BusinessError('Sales Order tidak ditemukan.');
    res.json(so);
  } catch (error) {
    return handleRouteError(res, error, 'GET /sales-orders/:id', 'Gagal mengambil Sales Order.');
  }
});

// ─── POST / create ─────────────────────────────────────────────────────────
router.post('/', roleMiddleware(WRITE_ROLES), async (req: AuthRequest, res) => {
  const body = validateBody(CreateSalesOrderSchema, req.body, res);
  if (!body) return;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const date = new Date(body.date);
      const fy = await getOpenFiscalYear(tx, date);
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

// ─── PUT /:id edit ─────────────────────────────────────────────────────────
router.put('/:id', roleMiddleware(WRITE_ROLES), async (req: AuthRequest, res) => {
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
      await tx.salesOrderItem.deleteMany({ where: { salesOrderId: so.id } });
      const updated = await tx.salesOrder.update({
        where: { id: so.id },
        data: {
          date: new Date(body.date),
          expectedDelivery: body.expectedDelivery ? new Date(body.expectedDelivery) : null,
          partyId: body.partyId,
          customerRefNo: body.customerRefNo ?? null,
          quotationId: body.quotationId ?? null,
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

// ─── POST /:id/submit ──────────────────────────────────────────────────────
router.post('/:id/submit', roleMiddleware(WRITE_ROLES), async (req: AuthRequest, res) => {
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

// ─── POST /:id/cancel ──────────────────────────────────────────────────────
router.post('/:id/cancel', roleMiddleware(CANCEL_ROLES), async (req: AuthRequest, res) => {
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

// ─── POST /:id/generate-do — generate DeliveryOrder dari SO ────────────────
router.post('/:id/generate-do', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const body = validateBody(GenerateDOFromSOSchema, req.body, res);
  if (!body) return;
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

      // Validate every body item references a valid SO item + qty doesn't
      // exceed (quantity - deliveredQty).
      const soItemMap = new Map(so.items.map((it) => [it.id, it]));
      for (const bIt of body.items) {
        const soItem = soItemMap.get(bIt.salesOrderItemId);
        if (!soItem) throw new BusinessError(`SO item ${bIt.salesOrderItemId} tidak ditemukan di SO ini.`);
        const remaining = new Decimal(soItem.quantity.toString()).minus(new Decimal(soItem.deliveredQty.toString()));
        if (new Decimal(bIt.quantity).gt(remaining)) {
          throw new BusinessError(`Qty ${bIt.quantity} untuk '${soItem.itemName}' melebihi sisa belum dikirim ${remaining.toString()}.`);
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
        items: body.items.map((bIt) => {
          const soItem = soItemMap.get(bIt.salesOrderItemId)!;
          return {
            inventoryItemId: soItem.inventoryItemId,
            warehouseId: bIt.warehouseId ?? null,
            itemName: soItem.itemName,
            quantity: bIt.quantity,
            unit: soItem.unit,
            description: soItem.description ?? null,
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
        await tx.salesOrderItem.update({
          where: { id: bIt.salesOrderItemId },
          data: { deliveredQty: { increment: bIt.quantity } },
        });
      }

      await refreshSOStatusInTx(tx, so.id);

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
