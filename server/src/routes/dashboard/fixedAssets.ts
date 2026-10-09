// GET /api/dashboard/fixed-assets: one request feeds all four fixed-asset widgets.
// Gated by the reports permission on the /api/dashboard mount in index.ts.
import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { logger } from '../../lib/logger';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const assets = await prisma.fixedAsset.findMany({
      where: { status: 'Active' },
      select: {
        id: true, assetNumber: true, name: true, category: true,
        acquisitionDate: true, acquisitionCost: true,
        accumulatedDepreciation: true, bookValue: true,
        usefulLifeMonths: true,
      },
    });

    const totalCost = assets.reduce((s, a) => s + Number(a.acquisitionCost), 0);
    const totalAccumulated = assets.reduce((s, a) => s + Number(a.accumulatedDepreciation), 0);
    const totalBookValue = assets.reduce((s, a) => s + Number(a.bookValue), 0);

    // Depreciation entries (this month + YTD)
    const [thisMonthAgg, ytdAgg, upcomingEntries] = await Promise.all([
      prisma.depreciationEntry.aggregate({
        where: {
          periodDate: { gte: monthStart, lte: monthEnd },
        },
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.depreciationEntry.aggregate({
        where: {
          periodDate: { gte: yearStart, lte: monthEnd },
          isPosted: true,
        },
        _sum: { amount: true },
      }),
      // Next 5 upcoming unposted entries (after today)
      prisma.depreciationEntry.findMany({
        where: {
          periodDate: { gte: monthStart },
          isPosted: false,
        },
        orderBy: { periodDate: 'asc' },
        take: 5,
        include: {
          fixedAsset: { select: { assetNumber: true, name: true, category: true } },
        },
      }),
    ]);

    const summary = {
      count: assets.length,
      totalCost,
      totalAccumulated,
      totalBookValue,
      depreciationThisMonth: Number(thisMonthAgg._sum.amount ?? 0),
      depreciationThisMonthEntries: thisMonthAgg._count._all,
      depreciationYTD: Number(ytdAgg._sum.amount ?? 0),
    };

    const byCategoryMap = new Map<string, { count: number; totalCost: number; totalBookValue: number }>();
    for (const a of assets) {
      const entry = byCategoryMap.get(a.category) ?? { count: 0, totalCost: 0, totalBookValue: 0 };
      entry.count++;
      entry.totalCost += Number(a.acquisitionCost);
      entry.totalBookValue += Number(a.bookValue);
      byCategoryMap.set(a.category, entry);
    }
    const byCategory = Array.from(byCategoryMap.entries())
      .map(([category, d]) => ({
        category,
        count: d.count,
        totalCost: d.totalCost,
        totalBookValue: d.totalBookValue,
        pct: totalBookValue > 0 ? +((d.totalBookValue / totalBookValue) * 100).toFixed(1) : 0,
      }))
      .sort((a, b) => b.totalBookValue - a.totalBookValue);

    const topAssets = [...assets]
      .sort((a, b) => Number(b.bookValue) - Number(a.bookValue))
      .slice(0, 10)
      .map((a) => {
        const cost = Number(a.acquisitionCost);
        const accum = Number(a.accumulatedDepreciation);
        return {
          id: a.id,
          assetNumber: a.assetNumber,
          name: a.name,
          category: a.category,
          acquisitionDate: a.acquisitionDate,
          acquisitionCost: cost,
          bookValue: Number(a.bookValue),
          accumulatedDepreciation: accum,
          accumPct: cost > 0 ? +((accum / cost) * 100).toFixed(1) : 0,
        };
      });

    const depreciationDue = {
      thisMonthAmount: summary.depreciationThisMonth,
      thisMonthEntries: summary.depreciationThisMonthEntries,
      upcoming: upcomingEntries.map((e) => ({
        id: e.id,
        assetNumber: e.fixedAsset.assetNumber,
        assetName: e.fixedAsset.name,
        category: e.fixedAsset.category,
        amount: Number(e.amount),
        dueDate: e.periodDate,
      })),
    };

    return res.json({ summary, byCategory, topAssets, depreciationDue });
  } catch (error) {
    logger.error({ error }, 'GET /dashboard/fixed-assets error');
    return res.status(500).json({ error: 'Gagal mengambil dashboard aset tetap.' });
  }
});

export default router;
