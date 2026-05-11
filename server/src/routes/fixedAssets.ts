import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { roleMiddleware, AuthRequest } from '../middleware/auth';
import { logger } from '../lib/logger';
import { validateBody } from '../utils/validate';
import Decimal from 'decimal.js';

const router = Router();

router.use(roleMiddleware(['Admin', 'Accountant']));

// ── Schemas ─────────────────────────────────────────────────────────────────
const CreateFixedAssetSchema = z.object({
  name: z.string().min(1, 'Nama aset wajib diisi.').max(200),
  category: z.string().min(1, 'Kategori wajib diisi.').max(100),
  description: z.string().max(500).nullable().optional(),
  acquisitionDate: z.string().min(1, 'Tanggal akuisisi wajib diisi.'),
  acquisitionCost: z.coerce.number().positive('Harga perolehan harus lebih dari 0.'),
  usefulLifeMonths: z.coerce.number().int().positive('Umur ekonomis (bulan) harus lebih dari 0.').max(1200),
  salvageValue: z.coerce.number().min(0).optional().default(0),
  depreciationMethod: z.enum(['straight_line']).optional().default('straight_line'),
  assetAccountId: z.string().uuid('assetAccountId harus UUID valid.'),
  depreciationAccountId: z.string().uuid('depreciationAccountId harus UUID valid.'),
  accumulatedDepAccountId: z.string().uuid('accumulatedDepAccountId harus UUID valid.'),
});

const DepreciateSchema = z.object({
  entryId: z.string().uuid('entryId harus UUID valid.'),
});

const DisposeSchema = z.object({
  disposalDate: z.string().min(1, 'Tanggal pelepasan wajib diisi.'),
  disposalAmount: z.coerce.number().min(0).optional().default(0),
});

// GET / — list all fixed assets
router.get('/', async (req, res) => {
  try {
    const { status, category } = req.query;
    const where: any = {};
    if (status) where.status = status;
    if (category) where.category = category;

    const assets = await prisma.fixedAsset.findMany({
      where,
      include: {
        assetAccount: { select: { id: true, accountNumber: true, name: true } },
        depreciationAccount: { select: { id: true, accountNumber: true, name: true } },
        accumulatedDepAccount: { select: { id: true, accountNumber: true, name: true } },
        user: { select: { fullName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json(assets);
  } catch (error) {
    logger.error(error, 'GET /fixed-assets error');
    res.status(500).json({ error: 'Gagal mengambil data aset tetap.' });
  }
});

// GET /categories — distinct categories
router.get('/categories', async (_req, res) => {
  try {
    const cats = await prisma.fixedAsset.findMany({
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    res.json(cats.map((c) => c.category));
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil kategori.' });
  }
});

// GET /:id — single asset with depreciation schedule
router.get('/:id', async (req, res) => {
  try {
    const asset = await prisma.fixedAsset.findUnique({
      where: { id: req.params.id },
      include: {
        assetAccount: { select: { id: true, accountNumber: true, name: true } },
        depreciationAccount: { select: { id: true, accountNumber: true, name: true } },
        accumulatedDepAccount: { select: { id: true, accountNumber: true, name: true } },
        depreciationEntries: { orderBy: { periodDate: 'asc' } },
        user: { select: { fullName: true } },
      },
    });
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan.' });
    res.json(asset);
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil data aset.' });
  }
});

// POST / — create new fixed asset
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateFixedAssetSchema, req.body, res);
  if (!body) return;
  try {
    const {
      name, category, description, acquisitionDate, acquisitionCost,
      usefulLifeMonths, salvageValue, depreciationMethod,
      assetAccountId, depreciationAccountId, accumulatedDepAccountId,
    } = body;

    const fiscalYear = await prisma.fiscalYear.findFirst({
      where: { startDate: { lte: new Date(acquisitionDate) }, endDate: { gte: new Date(acquisitionDate) } },
    });
    if (!fiscalYear) return res.status(400).json({ error: 'Tahun buku tidak ditemukan untuk tanggal akuisisi.' });

    // Generate asset number
    const count = await prisma.fixedAsset.count();
    const assetNumber = `FA-${String(count + 1).padStart(4, '0')}`;

    const cost = new Decimal(acquisitionCost);
    const salvage = new Decimal(salvageValue || 0);

    const asset = await prisma.fixedAsset.create({
      data: {
        assetNumber,
        name,
        category,
        description,
        acquisitionDate: new Date(acquisitionDate),
        acquisitionCost: cost.toNumber(),
        usefulLifeMonths,
        salvageValue: salvage.toNumber(),
        depreciationMethod: depreciationMethod || 'straight_line',
        bookValue: cost.toNumber(),
        assetAccountId,
        depreciationAccountId,
        accumulatedDepAccountId,
        fiscalYearId: fiscalYear.id,
        createdBy: req.user!.userId,
      },
      include: {
        assetAccount: { select: { id: true, accountNumber: true, name: true } },
        depreciationAccount: { select: { id: true, accountNumber: true, name: true } },
        accumulatedDepAccount: { select: { id: true, accountNumber: true, name: true } },
      },
    });

    // Generate depreciation schedule
    const monthlyDep = cost.minus(salvage).div(usefulLifeMonths);
    const entries = [];
    for (let i = 1; i <= usefulLifeMonths; i++) {
      const periodDate = new Date(acquisitionDate);
      periodDate.setMonth(periodDate.getMonth() + i);
      periodDate.setDate(1); // first of each month
      entries.push({
        fixedAssetId: asset.id,
        periodDate,
        amount: i === usefulLifeMonths
          ? cost.minus(salvage).minus(monthlyDep.times(usefulLifeMonths - 1)).toNumber()
          : monthlyDep.toDecimalPlaces(2).toNumber(),
      });
    }

    await prisma.depreciationEntry.createMany({ data: entries });

    res.status(201).json(asset);
  } catch (error) {
    logger.error(error, 'POST /fixed-assets error');
    res.status(500).json({ error: 'Gagal membuat aset tetap.' });
  }
});

// POST /:id/depreciate — post depreciation for a specific period
router.post('/:id/depreciate', async (req: AuthRequest, res) => {
  const body = validateBody(DepreciateSchema, req.body, res);
  if (!body) return;
  try {
    const { entryId } = body;

    const entry = await prisma.depreciationEntry.findUnique({
      where: { id: entryId },
      include: { fixedAsset: true },
    });
    if (!entry) return res.status(404).json({ error: 'Jadwal depresiasi tidak ditemukan.' });
    if (entry.isPosted) return res.status(400).json({ error: 'Depresiasi sudah diposting.' });

    const asset = entry.fixedAsset;

    const result = await prisma.$transaction(async (tx) => {
      const fiscalYear = await tx.fiscalYear.findFirst({
        where: { startDate: { lte: entry.periodDate }, endDate: { gte: entry.periodDate } },
      });
      if (!fiscalYear) throw new Error('Tahun buku tidak ditemukan.');

      // Generate journal entry number
      const count = await tx.journalEntry.count();
      const entryNumber = `DEP-${String(count + 1).padStart(6, '0')}`;

      const journal = await tx.journalEntry.create({
        data: {
          entryNumber,
          date: entry.periodDate,
          status: 'Submitted',
          narration: `Depresiasi ${asset.name} - ${entry.periodDate.toISOString().substring(0, 7)}`,
          fiscalYearId: fiscalYear.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: [
              { accountId: asset.depreciationAccountId, debit: Number(entry.amount), credit: 0, description: `Beban depresiasi ${asset.name}` },
              { accountId: asset.accumulatedDepAccountId, debit: 0, credit: Number(entry.amount), description: `Akm. depresiasi ${asset.name}` },
            ],
          },
        },
      });

      // Create ALE
      const jeItems = await tx.journalItem.findMany({ where: { journalEntryId: journal.id } });
      for (const item of jeItems) {
        await tx.accountingLedgerEntry.create({
          data: {
            date: journal.date,
            accountId: item.accountId,
            debit: item.debit,
            credit: item.credit,
            referenceType: 'JournalEntry',
            referenceId: journal.id,
            description: item.description || '',
            fiscalYearId: fiscalYear.id,
          },
        });
      }

      // Update account balances
      const { updateAccountBalance } = await import('../utils/accountBalance');
      for (const item of jeItems) {
        await updateAccountBalance(tx, item.accountId, Number(item.debit), Number(item.credit));
      }

      // Mark depreciation as posted
      await tx.depreciationEntry.update({
        where: { id: entry.id },
        data: { isPosted: true, journalEntryId: journal.id },
      });

      // Update asset
      const newAccDep = new Decimal(asset.accumulatedDepreciation.toString()).plus(entry.amount.toString());
      const newBookValue = new Decimal(asset.acquisitionCost.toString()).minus(newAccDep);
      await tx.fixedAsset.update({
        where: { id: asset.id },
        data: {
          accumulatedDepreciation: newAccDep.toNumber(),
          bookValue: newBookValue.toNumber(),
        },
      });

      return journal;
    }, { timeout: 15000 });

    res.json({ success: true, journalEntryId: result.id });
  } catch (error) {
    logger.error(error, 'POST /fixed-assets/:id/depreciate error');
    res.status(500).json({ error: 'Gagal posting depresiasi.' });
  }
});

// POST /:id/dispose — dispose of an asset
router.post('/:id/dispose', async (req: AuthRequest, res) => {
  const body = validateBody(DisposeSchema, req.body, res);
  if (!body) return;
  try {
    const { disposalDate, disposalAmount } = body;
    const asset = await prisma.fixedAsset.findUnique({ where: { id: req.params.id as string } });
    if (!asset) return res.status(404).json({ error: 'Aset tidak ditemukan.' });
    if (asset.status !== 'Active') return res.status(400).json({ error: 'Aset sudah tidak aktif.' });

    await prisma.fixedAsset.update({
      where: { id: asset.id },
      data: {
        status: 'Disposed',
        disposalDate: new Date(disposalDate),
        disposalAmount: Number(disposalAmount || 0),
      },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error(error, 'POST /fixed-assets/:id/dispose error');
    res.status(500).json({ error: 'Gagal disposisi aset.' });
  }
});

// GET /summary — asset summary by category
router.get('/summary/by-category', async (_req, res) => {
  try {
    const summary = await prisma.$queryRaw<Array<{
      category: string;
      count: bigint;
      total_cost: number;
      total_accumulated: number;
      total_book_value: number;
    }>>`
      SELECT category,
             COUNT(*) as count,
             SUM(acquisition_cost) as total_cost,
             SUM(accumulated_depreciation) as total_accumulated,
             SUM(book_value) as total_book_value
        FROM fixed_assets
       WHERE status = 'Active'
       GROUP BY category
       ORDER BY category
    `;

    res.json(summary.map((s) => ({
      ...s,
      count: Number(s.count),
      total_cost: Number(s.total_cost),
      total_accumulated: Number(s.total_accumulated),
      total_book_value: Number(s.total_book_value),
    })));
  } catch (error) {
    res.status(500).json({ error: 'Gagal mengambil ringkasan aset.' });
  }
});

export default router;
