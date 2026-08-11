import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { AuthRequest, requireCap } from '../../middleware/auth';
import { hasCap } from '../../services/permissionService';
import { validateBody } from '../../utils/validate';
import { CreateProductionRunSchema, UpdateProductionRunSchema } from '../../utils/schemas';
import { handleRouteError } from '../../utils/errors';
import { cancelProductionRunInTx } from '../../services/productionRunCancel';
import { submitProductionRunInTx } from '../../services/productionRunSubmit';
import { editProductionRunInTx } from '../../services/productionRunEdit';
import { needsApproval, queueApproval, approvalsLink } from '../../services/approvalGate';
import { notifyAdmins } from '../../services/notificationService';
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
          // OEE: lightweight machine label for the list view.
          machine: { select: { id: true, code: true, name: true } },
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
        // OEE: legacy single-machine master (backward compat) + B2 multi-machine
        // rows (per-machine A/P/Q/OEE) + downtime breakdown for the detail drawer.
        machine: { select: { id: true, code: true, name: true, unit: true, idealRatePerHour: true } },
        runMachines: {
          include: {
            machine: { select: { id: true, code: true, name: true, unit: true, idealRatePerHour: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        downtimes: {
          include: { machine: { select: { id: true, code: true, name: true } } },
          orderBy: { createdAt: 'asc' },
        },
        createdBy: { select: { id: true, fullName: true } },
      },
    });
    if (!run) return res.status(404).json({ error: 'Data proses produksi tidak ditemukan.' });

    // Fetch related journal entry for GL info.
    // Editing a posted PR creates revision journals (JV-<runNumber>-R1, -R2, …)
    // sharing the same prefix; the original JV-<runNumber> becomes Cancelled.
    // Show the newest ACTIVE (non-Cancelled) journal by that prefix so the UI
    // reflects the current GL state instead of always the first-ever posting.
    const jvPrefix = `JV-${run.runNumber}`;
    const journal = await prisma.journalEntry.findFirst({
      where: { entryNumber: { startsWith: jvPrefix }, status: { not: 'Cancelled' } },
      orderBy: { entryNumber: 'desc' },
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
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateProductionRunSchema, req.body, res);
  if (!body) return;
  if (body.allowNegativeStock && !(await hasCap(req.user!.role, 'inventory.negative_stock'))) {
    return res.status(403).json({ error: 'Anda tidak berwenang bypass validasi stok.' });
  }

  try {
    // Approval gate: tanpa capability bypass → masuk antrian, dokumen dibuat saat approve.
    if (await needsApproval(req.user!.role)) {
      const amount = (body.inputs ?? []).reduce((s: number, it: any) => s + Number(it.quantity ?? 0), 0);
      const request = await prisma.$transaction((tx) =>
        queueApproval(tx, {
          documentType: 'ProductionRun',
          payload: req.body,
          amount,
          requestedBy: req.user!.userId,
          label: 'Data Produksi (Input bahan baku)',
        }),
      );
      const requester = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { fullName: true } });
      const link = approvalsLink(request.id);
      await notifyAdmins({
        type: 'approval_pending',
        title: '🔔 Persetujuan: Data Produksi',
        message: `Data Produksi (${amount.toLocaleString('id-ID')} kg input) dari ${requester?.fullName ?? 'staf'} menunggu persetujuan Anda.${link ? `\n\n🔗 Buka & proses: ${link}` : ''}`,
        metadata: { kind: 'approval', requestId: request.id, documentType: 'ProductionRun' },
        excludeUserId: req.user!.userId,
      });
      return res.status(202).json({ pendingApproval: true, request, message: 'Data produksi menunggu persetujuan manajer sebelum diproses.' });
    }
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
router.put('/:id', async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const body = validateBody(UpdateProductionRunSchema, req.body, res);
  if (!body) return;
  if (body.allowNegativeStock && !(await hasCap(req.user!.role, 'inventory.negative_stock'))) {
    return res.status(403).json({ error: 'Anda tidak berwenang bypass validasi stok.' });
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
router.put('/:id/cancel', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
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
