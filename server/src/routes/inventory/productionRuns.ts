import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { AuthRequest, roleMiddleware } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { CreateProductionRunSchema, UpdateProductionRunSchema } from '../../utils/schemas';
import { handleRouteError } from '../../utils/errors';
import { cancelProductionRunInTx } from '../../services/productionRunCancel';
import { submitProductionRunInTx } from '../../services/productionRunSubmit';
import { editProductionRunInTx } from '../../services/productionRunEdit';
import { logger } from '../../lib/logger';

const router = Router();

// GET /api/inventory/production-runs
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '50', startDate, endDate } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: any = {};
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }

    const [runs, total] = await Promise.all([
      prisma.productionRun.findMany({
        where,
        include: {
          items: {
            include: {
              item: { select: { id: true, name: true, unit: true, code: true } },
            },
          },
          createdBy: { select: { id: true, fullName: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.productionRun.count({ where }),
    ]);

    return res.json({ data: runs, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/production-runs error');
    return res.status(500).json({ error: 'Gagal mengambil data proses produksi.' });
  }
});

// GET /api/inventory/production-runs/:id
router.get('/:id', async (req, res) => {
  try {
    const run = await prisma.productionRun.findUnique({
      where: { id: req.params.id as string },
      include: {
        items: {
          include: {
            item: { select: { id: true, name: true, unit: true, code: true, averageCost: true } },
            warehouse: { select: { id: true, code: true, name: true } },
            sourceMovement: {
              select: {
                id: true, movementNumber: true, date: true, quantity: true, unitCost: true,
                referenceType: true, referenceNumber: true,
              },
            },
          },
        },
        runCosts: {
          include: {
            costAccount: { select: { id: true, accountNumber: true, name: true } },
            standard: { select: { id: true, name: true } },
          },
        },
        runProcesses: {
          include: { process: { select: { id: true, name: true } } },
          orderBy: { process: { sortOrder: 'asc' } },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!run) return res.status(404).json({ error: 'Data proses produksi tidak ditemukan.' });

    // Fetch related journal entry for GL info
    const jvNumber = `JV-${run.runNumber}`;
    const journal = await prisma.journalEntry.findUnique({
      where: { entryNumber: jvNumber },
      include: {
        items: {
          include: { account: { select: { id: true, accountNumber: true, name: true } } },
        },
      },
    });

    return res.json({ ...run, journal: journal || null });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/production-runs/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail proses produksi.' });
  }
});

// POST /api/inventory/production-runs — record a production run.
// Heavy lifting (inputs/outputs validation, multi-account JE, stock movements,
// WAC, COGS backfill) lives in services/productionRunSubmit.ts.
router.post('/', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateProductionRunSchema, req.body, res);
  if (!body) return;
  if (body.allowNegativeStock && req.user!.role !== 'Admin') {
    return res.status(403).json({ error: 'Hanya Admin yang dapat bypass validasi stok.' });
  }

  try {
    const result = await prisma.$transaction(
      (tx) => submitProductionRunInTx(tx, body, req.user!.userId),
      { timeout: 30000 },
    );
    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /inventory/production-runs', 'Gagal mencatat proses produksi.');
  }
});


// PUT /api/inventory/production-runs/:id — Edit (cancel old + recreate with same runNumber)
// PUT /api/inventory/production-runs/:id — Edit (cancel old + recreate with
// same runNumber, JE revisioned as JV-{runNo}-R{n}). Heavy logic lives in
// services/productionRunEdit.ts.
router.put('/:id', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const body = validateBody(UpdateProductionRunSchema, req.body, res);
  if (!body) return;
  if (body.allowNegativeStock && req.user!.role !== 'Admin') {
    return res.status(403).json({ error: 'Hanya Admin yang dapat bypass validasi stok.' });
  }

  try {
    const result = await prisma.$transaction(
      (tx) => editProductionRunInTx(tx, id, body, req.user!.userId),
      { timeout: 30000 },
    );
    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /inventory/production-runs/:id', 'Gagal mengedit proses produksi.');
  }
});


// PUT /api/inventory/production-runs/:id/cancel
router.put('/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const allowNegativeStock = req.query.allowNegativeStock === 'true' || req.body?.allowNegativeStock === true;
  const negativeStockReason = typeof req.body?.negativeStockReason === 'string' ? req.body.negativeStockReason : null;
  if (allowNegativeStock && (!negativeStockReason || negativeStockReason.trim().length < 10)) {
    return res.status(400).json({ error: 'Alasan bypass stok minus wajib diisi (minimal 10 karakter).' });
  }

  try {
    await prisma.$transaction(
      (tx) => cancelProductionRunInTx(tx, id, { allowNegativeStock, negativeStockReason }),
      { timeout: 15000 },
    );
    return res.json({ message: 'Proses produksi berhasil dibatalkan.' });
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /inventory/production-runs/:id/cancel', 'Gagal membatalkan proses produksi.');
  }
});

export default router;
