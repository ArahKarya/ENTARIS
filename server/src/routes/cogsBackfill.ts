import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { handleRouteError } from '../utils/errors';
import { logger } from '../lib/logger';

const router = Router();

// GET /api/cogs-backfill — list pending/settled queue entries
router.get('/', async (req, res) => {
  try {
    const { status, itemId, limit = '50' } = req.query;
    const take = Math.min(Number(limit) || 50, 200);

    const where: Prisma.CogsBackfillQueueWhereInput = {};
    if (status) where.status = String(status);
    else where.status = { in: ['Pending', 'PartiallySettled'] };
    if (itemId) where.inventoryItemId = String(itemId);

    const entries = await prisma.cogsBackfillQueue.findMany({
      where,
      include: {
        inventoryItem: { select: { id: true, code: true, name: true, unit: true, currentStock: true, averageCost: true } },
        salesInvoice: { select: { id: true, invoiceNumber: true, date: true, customer: { select: { name: true } } } },
        settlements: {
          orderBy: { createdAt: 'desc' },
          select: { id: true, qtySettled: true, costAtSettle: true, differential: true, triggerSource: true, triggerRefNo: true, journalEntryId: true, createdAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take,
    });

    return res.json({ data: entries });
  } catch (error) {
    return handleRouteError(res, error, 'GET /cogs-backfill', 'Gagal mengambil daftar COGS backfill.');
  }
});

// GET /api/cogs-backfill/summary — aggregate for dashboard widget
router.get('/summary', async (_req, res) => {
  try {
    const [pendingCount, byItem] = await Promise.all([
      prisma.cogsBackfillQueue.count({ where: { status: { in: ['Pending', 'PartiallySettled'] } } }),
      prisma.cogsBackfillQueue.groupBy({
        by: ['inventoryItemId'],
        where: { status: { in: ['Pending', 'PartiallySettled'] } },
        _sum: { qtyPending: true },
      }),
    ]);

    const itemIds = byItem.map((b) => b.inventoryItemId);
    const items = itemIds.length
      ? await prisma.inventoryItem.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, code: true, name: true, unit: true, averageCost: true },
        })
      : [];

    const itemMap = new Map(items.map((i) => [i.id, i]));
    const breakdown = byItem.map((b) => {
      const item = itemMap.get(b.inventoryItemId);
      const qty = Number(b._sum.qtyPending ?? 0);
      const avgCost = Number(item?.averageCost ?? 0);
      return {
        itemId: b.inventoryItemId,
        code: item?.code ?? '',
        name: item?.name ?? '(deleted)',
        unit: item?.unit ?? '',
        qtyPending: qty,
        estimatedValue: qty * avgCost,
      };
    });

    const totalPendingValue = breakdown.reduce((sum, b) => sum + b.estimatedValue, 0);

    return res.json({ pendingCount, totalPendingValue, breakdown });
  } catch (error) {
    return handleRouteError(res, error, 'GET /cogs-backfill/summary', 'Gagal mengambil ringkasan COGS backfill.');
  }
});

export default router;
