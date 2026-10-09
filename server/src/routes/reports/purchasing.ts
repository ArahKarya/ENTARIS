/**
 * Purchasing reports under /api/reports (requirePerm('reports')): /po-outstanding and /supplier-performance.
 * Aggregation lives in services/purchaseReports.ts.
 */
import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { handleRouteError } from '../../utils/errors';
import { firstString, localDayRange, parseDateParam } from '../../utils/listQuery';
import { businessToday, purchaseOrderOverdueWhere } from '../../services/purchaseOrderOverdue';
import { buildPoOutstanding, buildSupplierPerformance } from '../../services/purchaseReports';

const router = Router();

type RangeResult = { ok: true; range?: { gte?: Date; lt?: Date } } | { ok: false };

function dateRange(query: Record<string, unknown>): RangeResult {
  const start = parseDateParam(query.startDate);
  const end = parseDateParam(query.endDate);
  if (start === null || end === null) return { ok: false };
  return { ok: true, range: start || end ? localDayRange(start, end) : undefined };
}

router.get('/po-outstanding', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const dr = dateRange(query);
    if (!dr.ok) return res.status(400).json({ error: 'Format tanggal harus YYYY-MM-DD.' });
    const now = new Date();
    const and: Prisma.PurchaseOrderWhereInput[] = [{ status: 'Submitted', closedAt: null }];
    const partyId = firstString(query.partyId);
    if (partyId) and.push({ partyId });
    const warehouseId = firstString(query.warehouseId);
    if (warehouseId) and.push({ warehouseId });
    if (dr.range) and.push({ date: dr.range });
    const overdue = firstString(query.overdue);
    if (overdue === '1' || overdue === 'true') {
      and.push(purchaseOrderOverdueWhere(now, prisma.purchaseOrderItem.fields.quantity));
    }
    const pos = await prisma.purchaseOrder.findMany({
      where: { AND: and },
      select: {
        id: true,
        poNumber: true,
        date: true,
        status: true,
        closedAt: true,
        expectedDeliveryDate: true,
        supplier: { select: { id: true, name: true } },
        warehouse: { select: { id: true, name: true } },
        items: {
          select: {
            id: true,
            itemName: true,
            unit: true,
            quantity: true,
            qtyReceived: true,
            estimatedRate: true,
            discount: true,
            taxPct: true,
          },
        },
      },
      orderBy: [{ expectedDeliveryDate: { sort: 'asc', nulls: 'last' } }, { poNumber: 'asc' }],
      take: 2000,
    });
    return res.json(buildPoOutstanding(pos, businessToday(now)));
  } catch (error) {
    return handleRouteError(res, error, 'GET /reports/po-outstanding', 'Gagal mengambil laporan PO outstanding.');
  }
});

const BILLED = (status: string) => status !== 'Cancelled' && status !== 'Draft';

router.get('/supplier-performance', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const dr = dateRange(query);
    if (!dr.ok) return res.status(400).json({ error: 'Format tanggal harus YYYY-MM-DD.' });
    const where: Prisma.PurchaseOrderWhereInput = { status: 'Submitted' };
    if (dr.range) where.date = dr.range;
    const partyId = firstString(query.partyId);
    if (partyId) where.partyId = partyId;

    const pos = await prisma.purchaseOrder.findMany({
      where,
      select: {
        id: true,
        date: true,
        expectedDeliveryDate: true,
        supplier: { select: { id: true, name: true } },
        items: { select: { id: true, quantity: true, qtyReceived: true, estimatedRate: true, discount: true } },
        goodsReceipts: {
          where: { status: { not: 'Cancelled' } },
          select: {
            date: true,
            items: {
              select: {
                purchaseOrderItemId: true,
                invoiceItem: {
                  select: { quantity: true, rate: true, discount: true, purchaseInvoice: { select: { status: true } } },
                },
              },
            },
          },
        },
      },
      take: 5000,
    });

    const input = pos.map((po) => ({
      id: po.id,
      date: po.date,
      expectedDeliveryDate: po.expectedDeliveryDate,
      supplier: po.supplier,
      items: po.items,
      receipts: po.goodsReceipts.map((g) => ({ date: g.date })),
      invoiceLines: po.goodsReceipts.flatMap((g) =>
        g.items.flatMap((gi) =>
          gi.purchaseOrderItemId && gi.invoiceItem && BILLED(gi.invoiceItem.purchaseInvoice.status)
            ? [
                {
                  purchaseOrderItemId: gi.purchaseOrderItemId,
                  quantity: gi.invoiceItem.quantity,
                  rate: gi.invoiceItem.rate,
                  discount: gi.invoiceItem.discount,
                },
              ]
            : [],
        ),
      ),
    }));
    return res.json({ rows: buildSupplierPerformance(input) });
  } catch (error) {
    return handleRouteError(res, error, 'GET /reports/supplier-performance', 'Gagal mengambil laporan kinerja pemasok.');
  }
});

export default router;
