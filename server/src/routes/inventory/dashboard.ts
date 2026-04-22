import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

const router = Router();

// GET /api/inventory/dashboard/metrics — KPI summary
router.get('/metrics', async (_req, res) => {
  try {
    const [totalItems, activeItems, lowStockRaw, movements, inventoryValueResult] = await Promise.all([
      prisma.inventoryItem.count(),
      prisma.inventoryItem.count({ where: { isActive: true, currentStock: { gt: 0 } } }),
      prisma.$queryRaw<Array<{ count: bigint }>>`
        SELECT count(*) as count FROM inventory_items
        WHERE is_active = true AND minimum_stock > 0 AND current_stock <= minimum_stock`,
      prisma.stockMovement.count({
        where: {
          isCancelled: false,
          date: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) }
        }
      }),
      prisma.$queryRaw<[{ total: bigint }]>`
        SELECT COALESCE(SUM(
          CASE WHEN sm.movement_type IN ('In', 'AdjustmentIn') THEN sm.total_value
               ELSE -sm.total_value END
        ), 0) AS total
        FROM stock_movements sm
        JOIN inventory_items ii ON sm.item_id = ii.id
        WHERE ii.is_active = true AND sm.is_cancelled = false
      `,
    ]);

    const lowStockCount = Number(lowStockRaw[0]?.count ?? 0);

    return res.json({
      totalItems,
      activeItems,
      lowStockCount,
      movementsThisMonth: movements,
      inventoryValue: Math.max(0, Number(inventoryValueResult[0]?.total || 0)),
    });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/metrics error');
    return res.status(500).json({ error: 'Gagal mengambil metrik gudang.' });
  }
});

// GET /api/inventory/dashboard/by-category — Stock distribution by category
router.get('/by-category', async (_req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { category: true, currentStock: true },
    });

    const categoryMap = new Map<string, { itemCount: number; totalQty: number }>();
    for (const item of items) {
      const cat = item.category || 'Lainnya';
      const entry = categoryMap.get(cat) || { itemCount: 0, totalQty: 0 };
      entry.itemCount++;
      entry.totalQty += Number(item.currentStock);
      categoryMap.set(cat, entry);
    }

    const result = Array.from(categoryMap.entries()).map(([category, data]) => ({
      category,
      itemCount: data.itemCount,
      totalQuantity: data.totalQty,
    })).sort((a, b) => b.totalQuantity - a.totalQuantity);

    return res.json(result);
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/by-category error');
    return res.status(500).json({ error: 'Gagal mengambil data kategori.' });
  }
});

// GET /api/inventory/dashboard/movement-trend — 6-month movement trend
router.get('/movement-trend', async (_req, res) => {
  try {
    const months = 6;
    const now = new Date();
    const startDate = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);

    const movements = await prisma.stockMovement.findMany({
      where: { isCancelled: false, date: { gte: startDate } },
      select: { date: true, movementType: true, quantity: true },
    });

    // Group by month
    const monthMap = new Map<string, { inQty: number; outQty: number; adjInQty: number; adjOutQty: number }>();

    // Initialize all months
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - months + 1 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthMap.set(key, { inQty: 0, outQty: 0, adjInQty: 0, adjOutQty: 0 });
    }

    for (const m of movements) {
      const d = new Date(m.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthMap.get(key);
      if (!entry) continue;
      const qty = Number(m.quantity);
      switch (m.movementType) {
        case 'In': entry.inQty += qty; break;
        case 'Out': entry.outQty += qty; break;
        case 'AdjustmentIn': entry.adjInQty += qty; break;
        case 'AdjustmentOut': entry.adjOutQty += qty; break;
      }
    }

    const result = Array.from(monthMap.entries()).map(([month, data]) => ({
      month,
      ...data,
      netChange: data.inQty + data.adjInQty - data.outQty - data.adjOutQty,
    }));

    return res.json(result);
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/movement-trend error');
    return res.status(500).json({ error: 'Gagal mengambil tren pergerakan.' });
  }
});

// GET /api/inventory/dashboard/top-items — All active items sorted by stock value (qty × avg cost) desc
router.get('/top-items', async (_req, res) => {
  try {
    const items = await prisma.inventoryItem.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true, unit: true, category: true, currentStock: true, minimumStock: true, averageCost: true },
    });

    const mapped = items.map(i => {
      const currentStock = Number(i.currentStock);
      const minimumStock = Number(i.minimumStock);
      const averageCost = Number(i.averageCost);
      return {
        ...i,
        currentStock,
        minimumStock,
        averageCost,
        stockValue: currentStock * averageCost,
        stockPct: minimumStock > 0 ? Math.round(currentStock / minimumStock * 100) : null,
      };
    });

    mapped.sort((a, b) => b.stockValue - a.stockValue);

    return res.json(mapped);
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/top-items error');
    return res.status(500).json({ error: 'Gagal mengambil data item.' });
  }
});

// GET /api/inventory/dashboard/recent-movements — Last 10 movements
router.get('/recent-movements', async (_req, res) => {
  try {
    const movements = await prisma.stockMovement.findMany({
      where: { isCancelled: false },
      orderBy: { date: 'desc' },
      take: 10,
      select: {
        id: true, movementNumber: true, date: true, movementType: true,
        quantity: true, totalValue: true, notes: true,
        item: { select: { name: true, unit: true, code: true } },
      },
    });

    return res.json(movements.map(m => ({
      ...m,
      quantity: Number(m.quantity),
      totalValue: Number(m.totalValue),
    })));
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/recent-movements error');
    return res.status(500).json({ error: 'Gagal mengambil riwayat pergerakan.' });
  }
});

// GET /api/inventory/dashboard/production-stats — Production run stats
router.get('/production-stats', async (_req, res) => {
  try {
    const thisMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [totalRuns, thisMonthRuns, runs] = await Promise.all([
      prisma.productionRun.count({ where: { isCancelled: false } }),
      prisma.productionRun.count({ where: { isCancelled: false, date: { gte: thisMonth } } }),
      prisma.productionRun.findMany({
        where: { isCancelled: false, yieldPct: { not: null } },
        select: { yieldPct: true },
        orderBy: { date: 'desc' },
        take: 50,
      }),
    ]);

    const avgYield = runs.length > 0
      ? Math.round(runs.reduce((s, r) => s + Number(r.yieldPct), 0) / runs.length * 100) / 100
      : 0;

    return res.json({
      totalRuns,
      thisMonthRuns,
      avgYield,
    });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/production-stats error');
    return res.status(500).json({ error: 'Gagal mengambil statistik produksi.' });
  }
});

// GET /api/inventory/dashboard/production — Comprehensive production dashboard
router.get('/production', async (req, res) => {
  try {
    const now = new Date();

    // Parse filter params
    const filterItemId = typeof req.query.itemId === 'string' ? req.query.itemId : undefined;
    const filterStartDate = typeof req.query.startDate === 'string' ? new Date(req.query.startDate) : undefined;
    const filterEndDate = typeof req.query.endDate === 'string' ? new Date(req.query.endDate + 'T23:59:59') : undefined;

    // Build period boundaries
    const periodStart = filterStartDate || new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = filterEndDate || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const periodDays = Math.max(1, Math.ceil((periodEnd.getTime() - periodStart.getTime()) / 86400000));

    // Previous period (same duration, immediately before)
    const prevPeriodEnd = new Date(periodStart.getTime() - 1);
    const prevPeriodStart = new Date(prevPeriodEnd.getTime() - periodDays * 86400000);

    // If filtering by itemId, find runs that contain this item
    let runIdFilter: string[] | undefined;
    if (filterItemId) {
      const matchingItems = await prisma.productionRunItem.findMany({
        where: { itemId: filterItemId },
        select: { productionRunId: true },
        distinct: ['productionRunId'],
      });
      runIdFilter = matchingItems.map(m => m.productionRunId);
    }

    const baseWhere: any = { isCancelled: false };
    if (runIdFilter) baseWhere.id = { in: runIdFilter };

    // 1. KPI: total runs, period runs, prev period runs, avg yield
    const [totalRuns, periodRuns, prevPeriodRuns, allActiveRuns] = await Promise.all([
      prisma.productionRun.count({ where: baseWhere }),
      prisma.productionRun.count({ where: { ...baseWhere, date: { gte: periodStart, lte: periodEnd } } }),
      prisma.productionRun.count({ where: { ...baseWhere, date: { gte: prevPeriodStart, lte: prevPeriodEnd } } }),
      prisma.productionRun.findMany({
        where: baseWhere,
        select: { id: true, runNumber: true, date: true, yieldPct: true },
        orderBy: { date: 'desc' },
      }),
    ]);

    const runsWithYield = allActiveRuns.filter(r => r.yieldPct !== null);
    const avgYield = runsWithYield.length > 0
      ? runsWithYield.reduce((s, r) => s + Number(r.yieldPct), 0) / runsWithYield.length
      : 0;
    const periodYield = runsWithYield.filter(r => {
      const d = new Date(r.date);
      return d >= periodStart && d <= periodEnd;
    });
    const avgYieldPeriod = periodYield.length > 0
      ? periodYield.reduce((s, r) => s + Number(r.yieldPct), 0) / periodYield.length
      : 0;

    // 2. Total input/output quantities in period
    const periodRunIds = allActiveRuns
      .filter(r => { const d = new Date(r.date); return d >= periodStart && d <= periodEnd; })
      .map(r => r.id);

    const periodItems = periodRunIds.length > 0
      ? await prisma.productionRunItem.findMany({
          where: {
            productionRunId: { in: periodRunIds },
            ...(filterItemId ? { itemId: filterItemId } : {}),
          },
          select: { lineType: true, quantity: true, unitPrice: true, isByProduct: true, itemId: true },
        })
      : [];

    // For totals, use all items in matching runs (not filtered by itemId)
    const allPeriodItems = periodRunIds.length > 0
      ? (filterItemId
          ? await prisma.productionRunItem.findMany({
              where: { productionRunId: { in: periodRunIds } },
              select: { lineType: true, quantity: true, isByProduct: true, itemId: true },
            })
          : periodItems)
      : [];

    const totalInputQtyPeriod = allPeriodItems
      .filter(i => i.lineType === 'Input')
      .reduce((s, i) => s + Number(i.quantity), 0);
    const totalOutputQtyPeriod = allPeriodItems
      .filter(i => i.lineType === 'Output')
      .reduce((s, i) => s + Number(i.quantity), 0);
    const totalByProductQtyPeriod = allPeriodItems
      .filter(i => i.lineType === 'ByProduct' || i.isByProduct)
      .reduce((s, i) => s + Number(i.quantity), 0);

    // 3. Yield trend: daily within period
    const trendRuns = allActiveRuns.filter(r => {
      const d = new Date(r.date);
      return d >= periodStart && d <= periodEnd && r.yieldPct !== null;
    });
    const yieldByDay = new Map<string, { total: number; count: number }>();
    for (const r of trendRuns) {
      const day = new Date(r.date).toISOString().split('T')[0];
      const entry = yieldByDay.get(day) || { total: 0, count: 0 };
      entry.total += Number(r.yieldPct);
      entry.count += 1;
      yieldByDay.set(day, entry);
    }
    const yieldTrend = Array.from(yieldByDay.entries())
      .map(([date, v]) => ({ date, avgYield: Math.round((v.total / v.count) * 100) / 100, count: v.count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // 4. Top 5 input items in period
    const inputItemMap = new Map<string, number>();
    for (const item of allPeriodItems.filter(i => i.lineType === 'Input')) {
      inputItemMap.set(item.itemId, (inputItemMap.get(item.itemId) || 0) + Number(item.quantity));
    }
    const topInputIds = Array.from(inputItemMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const inputItemDetails = topInputIds.length > 0
      ? await prisma.inventoryItem.findMany({
          where: { id: { in: topInputIds.map(i => i[0]) } },
          select: { id: true, name: true, unit: true },
        })
      : [];
    const topInputs = topInputIds.map(([id, qty]) => {
      const item = inputItemDetails.find(i => i.id === id);
      return { id, name: item?.name || '', unit: item?.unit || '', quantity: qty };
    });

    // 5. Top 5 output items in period
    const outputItemMap = new Map<string, number>();
    for (const item of allPeriodItems.filter(i => i.lineType === 'Output')) {
      outputItemMap.set(item.itemId, (outputItemMap.get(item.itemId) || 0) + Number(item.quantity));
    }
    const topOutputIds = Array.from(outputItemMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const outputItemDetails = topOutputIds.length > 0
      ? await prisma.inventoryItem.findMany({
          where: { id: { in: topOutputIds.map(i => i[0]) } },
          select: { id: true, name: true, unit: true },
        })
      : [];
    const topOutputs = topOutputIds.map(([id, qty]) => {
      const item = outputItemDetails.find(i => i.id === id);
      return { id, name: item?.name || '', unit: item?.unit || '', quantity: qty };
    });

    // 6. Best & worst yield runs in period
    const sortedByYield = periodYield
      .sort((a, b) => Number(b.yieldPct) - Number(a.yieldPct));
    const bestYield = sortedByYield.slice(0, 5).map(r => ({
      runNumber: r.runNumber, date: r.date, yieldPct: Number(r.yieldPct),
    }));
    const worstYield = sortedByYield.slice(-5).reverse().map(r => ({
      runNumber: r.runNumber, date: r.date, yieldPct: Number(r.yieldPct),
    }));

    // 7. Recent 10 production runs (within period)
    const recentProduction = await prisma.productionRun.findMany({
      where: { ...baseWhere, date: { gte: periodStart, lte: periodEnd } },
      select: {
        id: true, runNumber: true, date: true, yieldPct: true, referenceNumber: true,
        items: {
          select: { lineType: true, quantity: true, isByProduct: true, item: { select: { name: true, unit: true } } },
        },
      },
      orderBy: { date: 'desc' },
      take: 10,
    });

    return res.json({
      summary: {
        totalRuns,
        periodRuns,
        prevPeriodRuns,
        avgYield: Math.round(avgYield * 100) / 100,
        avgYieldPeriod: Math.round(avgYieldPeriod * 100) / 100,
        totalInputQtyPeriod,
        totalOutputQtyPeriod,
        totalByProductQtyPeriod,
      },
      yieldTrend,
      topInputs,
      topOutputs,
      bestYield,
      worstYield,
      recentProduction: recentProduction.map(r => {
        const inputs = r.items.filter(i => i.lineType === 'Input');
        const outputs = r.items.filter(i => i.lineType === 'Output');
        return {
          id: r.id,
          runNumber: r.runNumber,
          date: r.date,
          yieldPct: r.yieldPct ? Number(r.yieldPct) : null,
          referenceNumber: r.referenceNumber,
          totalInput: inputs.reduce((s, i) => s + Number(i.quantity), 0),
          totalOutput: outputs.reduce((s, i) => s + Number(i.quantity), 0),
          inputSummary: inputs.map(i => `${i.item.name} ${Number(i.quantity).toLocaleString('id-ID')} ${i.item.unit}`).join(', '),
          outputSummary: outputs.map(i => `${i.item.name} ${Number(i.quantity).toLocaleString('id-ID')} ${i.item.unit}`).join(', '),
        };
      }),
    });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/production error');
    return res.status(500).json({ error: 'Gagal mengambil dashboard produksi.' });
  }
});

// GET /api/inventory/dashboard/yield-trend — rata-rata yield per bulan (6 bulan terakhir)
router.get('/yield-trend', async (_req, res) => {
  try {
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const rows = await prisma.$queryRaw<Array<{ month: Date; avg_yield: number | null; run_count: bigint }>>`
      SELECT date_trunc('month', date) AS month,
             AVG(yield_pct)::float AS avg_yield,
             COUNT(*) AS run_count
      FROM production_runs
      WHERE is_cancelled = false
        AND yield_pct IS NOT NULL
        AND date >= ${sixMonthsAgo}
      GROUP BY 1
      ORDER BY 1 ASC
    `;

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    const byKey = new Map(
      rows.map((r) => [
        `${r.month.getFullYear()}-${r.month.getMonth()}`,
        { avg: r.avg_yield ?? 0, count: Number(r.run_count) },
      ])
    );

    const months: Array<{ label: string; avgYield: number; runCount: number }> = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      const entry = byKey.get(key);
      months.push({
        label: monthNames[d.getMonth()],
        avgYield: entry ? Math.round(entry.avg * 100) / 100 : 0,
        runCount: entry ? entry.count : 0,
      });
    }

    const withRuns = months.filter((m) => m.runCount > 0);
    const overallAvg = withRuns.length > 0
      ? Math.round((withRuns.reduce((s, m) => s + m.avgYield, 0) / withRuns.length) * 100) / 100
      : 0;
    const last = months[months.length - 1];
    const prev = months[months.length - 2];
    const deltaPct = prev && prev.avgYield > 0
      ? Math.round(((last.avgYield - prev.avgYield) / prev.avgYield) * 10000) / 100
      : 0;

    return res.json({ months, overallAvg, latest: last?.avgYield ?? 0, deltaPct });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/yield-trend error');
    return res.status(500).json({ error: 'Gagal mengambil trend yield.' });
  }
});

export default router;
