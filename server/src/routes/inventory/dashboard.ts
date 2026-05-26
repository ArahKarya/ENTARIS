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
      // Inventory module pakai nilai operasional (qty fisik × avg cost),
      // bukan saldo GL. Dashboard utama (routes/dashboard.ts) tetap pakai
      // GL — keduanya disengaja beda karena melayani audience berbeda.
      prisma.$queryRaw<[{ total: string | number }]>`
        SELECT COALESCE(SUM(current_stock * average_cost), 0) AS total
        FROM inventory_items
        WHERE is_active = true
      `,
    ]);

    const lowStockCount = Number(lowStockRaw[0]?.count ?? 0);

    return res.json({
      totalItems,
      activeItems,
      lowStockCount,
      movementsThisMonth: movements,
      inventoryValue: Number(inventoryValueResult[0]?.total || 0),
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

    // 8. Loaded HPP analytics (Phase 3+): pull totals + per-product avg HPP
    //    untuk run dalam periode yang punya computedHpp non-null. Tujuan:
    //    dashboard "Production Deep Dive" tampilkan rata-rata HPP per produk
    //    utama + breakdown komponen biaya periode.
    const runsWithHpp = periodRunIds.length > 0
      ? await prisma.productionRun.findMany({
          where: {
            id: { in: periodRunIds },
            computedHpp: { not: null },
          },
          select: {
            id: true,
            computedHpp: true,
            totalMaterialCost: true,
            totalCostInputSide: true,
            totalCostOutputSide: true,
            totalByproductValue: true,
            items: {
              where: { lineType: 'Output' },
              select: {
                itemId: true,
                quantity: true,
                item: { select: { code: true, name: true, unit: true } },
              },
            },
          },
        })
      : [];

    const totalMaterialCost = runsWithHpp.reduce((s, r) => s + Number(r.totalMaterialCost ?? 0), 0);
    const totalCostInputSide = runsWithHpp.reduce((s, r) => s + Number(r.totalCostInputSide ?? 0), 0);
    const totalCostOutputSide = runsWithHpp.reduce((s, r) => s + Number(r.totalCostOutputSide ?? 0), 0);
    const totalByproductValue = runsWithHpp.reduce((s, r) => s + Number(r.totalByproductValue ?? 0), 0);
    const totalLoadedHppNumerator = totalMaterialCost + totalCostInputSide + totalCostOutputSide - totalByproductValue;

    // Per-product weighted average computedHpp (weighted by main output qty).
    const perProductMap = new Map<string, {
      itemId: string;
      code: string;
      name: string;
      unit: string;
      runs: number;
      totalQty: number;
      sumQtyTimesHpp: number;
      latestHpp: number;
      latestRunId: string;
    }>();
    for (const r of runsWithHpp) {
      const hpp = Number(r.computedHpp);
      for (const outLine of r.items) {
        const mainQty = Number(outLine.quantity);
        if (mainQty <= 0) continue;
        const key = outLine.itemId;
        const entry = perProductMap.get(key) ?? {
          itemId: key,
          code: outLine.item.code,
          name: outLine.item.name,
          unit: outLine.item.unit,
          runs: 0,
          totalQty: 0,
          sumQtyTimesHpp: 0,
          latestHpp: hpp,
          latestRunId: r.id,
        };
        entry.runs += 1;
        entry.totalQty += mainQty;
        entry.sumQtyTimesHpp += mainQty * hpp;
        // last r in iteration = the run loaded most recently (no date order
        // guaranteed by Prisma, but order in periodRunIds reflects insertion)
        entry.latestHpp = hpp;
        entry.latestRunId = r.id;
        perProductMap.set(key, entry);
      }
    }
    const perProduct = Array.from(perProductMap.values())
      .map((p) => ({
        itemId: p.itemId,
        itemCode: p.code,
        itemName: p.name,
        unit: p.unit,
        runs: p.runs,
        totalQty: p.totalQty,
        avgComputedHpp: p.totalQty > 0 ? +(p.sumQtyTimesHpp / p.totalQty).toFixed(2) : 0,
        latestComputedHpp: +p.latestHpp.toFixed(2),
      }))
      .sort((a, b) => b.totalQty - a.totalQty)
      .slice(0, 5);

    const totalMainQty = perProduct.reduce((s, p) => s + p.totalQty, 0);
    const avgLoadedHppPerKg = totalMainQty > 0 ? totalLoadedHppNumerator / totalMainQty : 0;

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
      loadedHpp: {
        perProduct,
        totalMaterialCost: +totalMaterialCost.toFixed(2),
        totalCostInputSide: +totalCostInputSide.toFixed(2),
        totalCostOutputSide: +totalCostOutputSide.toFixed(2),
        totalByproductValue: +totalByproductValue.toFixed(2),
        totalLoadedHpp: +totalLoadedHppNumerator.toFixed(2),
        avgLoadedHppPerKg: +avgLoadedHppPerKg.toFixed(2),
        runsWithHppCount: runsWithHpp.length,
      },
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

// GET /api/inventory/dashboard/oee — OEE period report
//   Query: startDate, endDate (ISO date). Default = current month.
//   Run-level pcts dipakai untuk summary/trend/perShift (sudah dihitung saat
//   submit, di-label "rata-rata" di UI). perMachine dari ProductionRunMachine,
//   downtimeByCategory dari ProductionDowntime (Pareto).
router.get('/oee', async (req, res) => {
  try {
    const now = new Date();

    const filterStartDate = typeof req.query.startDate === 'string' && req.query.startDate
      ? new Date(req.query.startDate)
      : undefined;
    const filterEndDate = typeof req.query.endDate === 'string' && req.query.endDate
      ? new Date(req.query.endDate + 'T23:59:59.999')
      : undefined;

    const periodStart = filterStartDate && !isNaN(filterStartDate.getTime())
      ? filterStartDate
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const periodEnd = filterEndDate && !isNaN(filterEndDate.getTime())
      ? filterEndDate
      : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const round1 = (n: number) => Math.round(n * 10) / 10;
    const avgOf = (vals: number[]) => (vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : 0);

    // 1. Run-level data dalam periode
    const runs = await prisma.productionRun.findMany({
      where: { isCancelled: false, date: { gte: periodStart, lte: periodEnd } },
      select: {
        id: true,
        date: true,
        shift: true,
        downtimeMin: true,
        availabilityPct: true,
        performancePct: true,
        qualityPct: true,
        oeePct: true,
      },
    });

    const runIds = runs.map((r) => r.id);
    const toNum = (v: unknown) => (v === null || v === undefined ? null : Number(v));

    // 2. Per-machine rows (join run agar filter date + isCancelled)
    const machineRows = runIds.length > 0
      ? await prisma.productionRunMachine.findMany({
          where: { productionRunId: { in: runIds } },
          select: {
            machineId: true,
            runMin: true,
            downtimeMin: true,
            allocatedQty: true,
            availabilityPct: true,
            performancePct: true,
            qualityPct: true,
            oeePct: true,
            machine: { select: { code: true, name: true } },
          },
        })
      : [];

    // 3. Downtime events (join run untuk filter date)
    const downtimeRows = runIds.length > 0
      ? await prisma.productionDowntime.findMany({
          where: { productionRunId: { in: runIds } },
          select: { category: true, durationMin: true },
        })
      : [];

    // ─── Summary ─────────────────────────────────────────────────────────
    const oeeVals = runs.map((r) => toNum(r.oeePct)).filter((v): v is number => v !== null);
    const availVals = runs.map((r) => toNum(r.availabilityPct)).filter((v): v is number => v !== null);
    const perfVals = runs.map((r) => toNum(r.performancePct)).filter((v): v is number => v !== null);
    const qualVals = runs.map((r) => toNum(r.qualityPct)).filter((v): v is number => v !== null);
    const totalDowntimeMin = runs.reduce((s, r) => s + (toNum(r.downtimeMin) ?? 0), 0);
    const machinesUsed = new Set(machineRows.map((m) => m.machineId)).size;

    const summary = {
      totalRuns: runs.length,
      runsWithOee: oeeVals.length,
      avgOee: round1(avgOf(oeeVals)),
      avgAvailability: round1(avgOf(availVals)),
      avgPerformance: round1(avgOf(perfVals)),
      avgQuality: round1(avgOf(qualVals)),
      totalDowntimeMin: round1(totalDowntimeMin),
      machinesUsed,
    };

    // ─── Trend (grouped by day, ascending) ───────────────────────────────
    const dayMap = new Map<string, { oee: number[]; avail: number[]; perf: number[]; qual: number[]; runs: number }>();
    for (const r of runs) {
      const day = new Date(r.date).toISOString().split('T')[0];
      const entry = dayMap.get(day) ?? { oee: [], avail: [], perf: [], qual: [], runs: 0 };
      entry.runs += 1;
      const o = toNum(r.oeePct); if (o !== null) entry.oee.push(o);
      const a = toNum(r.availabilityPct); if (a !== null) entry.avail.push(a);
      const p = toNum(r.performancePct); if (p !== null) entry.perf.push(p);
      const q = toNum(r.qualityPct); if (q !== null) entry.qual.push(q);
      dayMap.set(day, entry);
    }
    const trend = Array.from(dayMap.entries())
      .map(([date, v]) => ({
        date,
        runs: v.runs,
        avgOee: round1(avgOf(v.oee)),
        avgAvailability: round1(avgOf(v.avail)),
        avgPerformance: round1(avgOf(v.perf)),
        avgQuality: round1(avgOf(v.qual)),
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // ─── Per Machine ─────────────────────────────────────────────────────
    const machineMap = new Map<string, {
      machineId: string; code: string; name: string;
      oee: number[]; avail: number[]; perf: number[]; qual: number[];
      runs: number; totalRunMin: number; totalDowntimeMin: number; totalAllocatedQty: number;
    }>();
    for (const m of machineRows) {
      const entry = machineMap.get(m.machineId) ?? {
        machineId: m.machineId,
        code: m.machine?.code ?? '',
        name: m.machine?.name ?? '',
        oee: [], avail: [], perf: [], qual: [],
        runs: 0, totalRunMin: 0, totalDowntimeMin: 0, totalAllocatedQty: 0,
      };
      entry.runs += 1;
      entry.totalRunMin += toNum(m.runMin) ?? 0;
      entry.totalDowntimeMin += toNum(m.downtimeMin) ?? 0;
      entry.totalAllocatedQty += toNum(m.allocatedQty) ?? 0;
      const o = toNum(m.oeePct); if (o !== null) entry.oee.push(o);
      const a = toNum(m.availabilityPct); if (a !== null) entry.avail.push(a);
      const p = toNum(m.performancePct); if (p !== null) entry.perf.push(p);
      const q = toNum(m.qualityPct); if (q !== null) entry.qual.push(q);
      machineMap.set(m.machineId, entry);
    }
    const perMachine = Array.from(machineMap.values())
      .map((m) => ({
        machineId: m.machineId,
        code: m.code,
        name: m.name,
        runs: m.runs,
        avgOee: round1(avgOf(m.oee)),
        avgAvailability: round1(avgOf(m.avail)),
        avgPerformance: round1(avgOf(m.perf)),
        avgQuality: round1(avgOf(m.qual)),
        totalRunMin: round1(m.totalRunMin),
        totalDowntimeMin: round1(m.totalDowntimeMin),
        totalAllocatedQty: round1(m.totalAllocatedQty),
      }))
      .sort((a, b) => b.avgOee - a.avgOee);

    // ─── Per Shift ───────────────────────────────────────────────────────
    const shiftMap = new Map<string, { oee: number[]; avail: number[]; perf: number[]; qual: number[]; runs: number }>();
    for (const r of runs) {
      const shift = r.shift && r.shift.trim() ? r.shift : '(Tanpa Shift)';
      const entry = shiftMap.get(shift) ?? { oee: [], avail: [], perf: [], qual: [], runs: 0 };
      entry.runs += 1;
      const o = toNum(r.oeePct); if (o !== null) entry.oee.push(o);
      const a = toNum(r.availabilityPct); if (a !== null) entry.avail.push(a);
      const p = toNum(r.performancePct); if (p !== null) entry.perf.push(p);
      const q = toNum(r.qualityPct); if (q !== null) entry.qual.push(q);
      shiftMap.set(shift, entry);
    }
    const perShift = Array.from(shiftMap.entries())
      .map(([shift, v]) => ({
        shift,
        runs: v.runs,
        avgOee: round1(avgOf(v.oee)),
        avgAvailability: round1(avgOf(v.avail)),
        avgPerformance: round1(avgOf(v.perf)),
        avgQuality: round1(avgOf(v.qual)),
      }))
      .sort((a, b) => a.shift.localeCompare(b.shift, 'id'));

    // ─── Downtime by Category (Pareto, sorted by totalMin desc) ──────────
    const dtMap = new Map<string, { totalMin: number; count: number }>();
    for (const d of downtimeRows) {
      const cat = d.category && d.category.trim() ? d.category : 'Lain';
      const entry = dtMap.get(cat) ?? { totalMin: 0, count: 0 };
      entry.totalMin += toNum(d.durationMin) ?? 0;
      entry.count += 1;
      dtMap.set(cat, entry);
    }
    const downtimeByCategory = Array.from(dtMap.entries())
      .map(([category, v]) => ({ category, totalMin: round1(v.totalMin), count: v.count }))
      .sort((a, b) => b.totalMin - a.totalMin);

    return res.json({
      summary,
      trend,
      perMachine,
      perShift,
      downtimeByCategory,
    });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/dashboard/oee error');
    return res.status(500).json({ error: 'Gagal mengambil laporan OEE.' });
  }
});

export default router;
