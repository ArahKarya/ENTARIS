import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AuthRequest, requireCap } from '../../middleware/auth';
import { hasCap } from '../../services/permissionService';
import { validateBody } from '../../utils/validate';
import { CreateProductionRunSchema, UpdateProductionRunSchema } from '../../utils/schemas';
import { handleRouteError } from '../../utils/errors';
import { cancelProductionRunInTx } from '../../services/productionRunCancel';
import { createDraft } from '../../services/productionRunDraft';
import { editProductionRunInTx } from '../../services/productionRunEdit';
import { needsApproval } from '../../services/approvalGate';
import { queueEditApproval } from '../../services/approvalEditRequests';
import { logger } from '../../lib/logger';
import { parseListPaging, parseSort } from '../../utils/listQuery';
import {
  DEFAULT_PRODUCTION_RUN_SORT,
  LEGACY_PRODUCTION_RUN_ORDER,
  PRODUCTION_RUN_SORT_FIELDS,
  buildProductionRunWhere,
  productionRunOrderBy,
  summarizeProductionRuns,
} from '../../services/productionRunList';

const router = Router();

// GET /api/inventory/production-runs
// Query: page, limit (≤200), status (active | cancelled), machineId,
// startDate/endDate (YYYY-MM-DD, business-day range), search (run/reference
// no., notes, item name/code), sort (date | runNumber | yieldPct, "-" = desc).
// Without `sort` the historic order (date desc) is kept.
// → { data, total, page, limit }
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 50, maxLimit: 200 });
    const filter = buildProductionRunWhere(query);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { where } = filter;
    const orderBy = query.sort === undefined
      ? LEGACY_PRODUCTION_RUN_ORDER
      : productionRunOrderBy(parseSort(query.sort, PRODUCTION_RUN_SORT_FIELDS, DEFAULT_PRODUCTION_RUN_SORT));

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
        orderBy,
        skip,
        take,
      }),
      prisma.productionRun.count({ where }),
    ]);

    return res.json({ data: runs, total, page, limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/production-runs error');
    return res.status(500).json({ error: 'Gagal mengambil data proses produksi.' });
  }
});

// GET /api/inventory/production-runs/summary — KPI totals (run counts, input /
// main output / by-product qty and overall yield of non-cancelled runs) for the
// same filters as the list. Same RBAC as the list. Declared before /:id.
router.get('/summary', async (req, res) => {
  try {
    const filter = buildProductionRunWhere(req.query as Record<string, unknown>);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { where } = filter;
    const activeRuns: Prisma.ProductionRunWhereInput = { AND: [where, { isCancelled: false }] };
    const [counts, lines, runs, inputs, units] = await Promise.all([
      prisma.productionRun.groupBy({ by: ['isCancelled'], where, _count: { _all: true } }),
      prisma.productionRunItem.groupBy({
        by: ['lineType', 'isByProduct'],
        where: { productionRun: activeRuns },
        _sum: { quantity: true },
      }),
      prisma.productionRun.findMany({ where: activeRuns, select: { id: true, yieldPct: true } }),
      prisma.productionRunItem.groupBy({
        by: ['productionRunId'],
        where: { lineType: 'Input', productionRun: activeRuns },
        _sum: { quantity: true },
      }),
      prisma.inventoryItem.findMany({
        where: { productionLines: { some: { productionRun: activeRuns } } },
        distinct: ['unit'],
        select: { unit: true },
      }),
    ]);
    const inputByRun = new Map(inputs.map((i) => [i.productionRunId, i._sum.quantity]));
    const yields = runs.map((r) => ({ yieldPct: r.yieldPct, inputQty: inputByRun.get(r.id) ?? null }));
    return res.json(summarizeProductionRuns(counts, lines, yields, units.map((u) => u.unit)));
  } catch (error) {
    return handleRouteError(res, error, 'GET /inventory/production-runs/summary', 'Gagal menghitung ringkasan proses produksi.');
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

    // Ringkasan nilai GL nyata dari stock_movements (bukan WAC saat ini):
    // bahan baku keluar (Out) vs produk masuk (In) per output utama / produk samping.
    // rawMaterialPerKg = modal bahan baku murni (WAC 2) = nilai bahan ÷ kg output utama.
    const mainItemIds = new Set(
      run.items.filter((i: any) => i.lineType === 'Output' && !i.isByProduct).map((i: any) => i.itemId),
    );
    const mvs = await prisma.stockMovement.findMany({
      where: { referenceId: run.id, isCancelled: false },
      select: { movementType: true, itemId: true, quantity: true, totalValue: true },
    });
    let inputQty = 0, inputValue = 0, mainQty = 0, mainValue = 0, bpQty = 0, bpValue = 0;
    for (const m of mvs) {
      const q = Number(m.quantity), v = Number(m.totalValue);
      if (String(m.movementType) === 'Out') { inputQty += q; inputValue += v; }
      else if (mainItemIds.has(m.itemId)) { mainQty += q; mainValue += v; }
      else { bpQty += q; bpValue += v; }
    }
    const glSummary = mvs.length === 0 ? null : {
      inputQty, inputValue, mainQty, mainValue, byproductQty: bpQty, byproductValue: bpValue,
      // + = kredit ke 5.1 (biaya konversi dibebankan), − = debit (rugi produksi)
      conversionDiff: mainValue + bpValue - inputValue,
      rawMaterialPerKg: mainQty > 0 ? inputValue / mainQty : null,
      glPerKg: mainQty > 0 ? mainValue / mainQty : null,
      yieldPct: inputQty > 0 ? (mainQty / inputQty) * 100 : null,
    };

    return res.json({ ...run, journal: journal || null, glSummary });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/production-runs/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail proses produksi.' });
  }
});

// POST /api/inventory/production-runs — input produksi selalu disimpan sebagai
// DRAFT (tanpa efek stok/GL/HPP/OEE). Posting terpisah: POST /drafts/:id/post
// (routes/inventory/productionRunDrafts.ts → services/productionRunDraft.ts).
// Validasi payload sama persis seperti sebelumnya. → 201 { draft, warnings }
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateProductionRunSchema, req.body, res);
  if (!body) return;
  if (body.allowNegativeStock && !(await hasCap(req.user!.role, 'inventory.negative_stock'))) {
    return res.status(403).json({ error: 'Anda tidak berwenang bypass validasi stok.' });
  }

  try {
    // Raw body is stored as-is (full modal payload). Typed `any` only keeps the
    // baselined violation count of this file unchanged (eslint-suppressions.json is frozen).
    const rawBody: any = req.body;
    const result = await prisma.$transaction((tx) => createDraft(tx, body, rawBody, req.user!.userId));
    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /inventory/production-runs', 'Gagal menyimpan draft proses produksi.');
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
    // Approval gate: edit mengubah stok/GL/WAC → non-bypass hanya mengantrekan.
    if (await needsApproval(req.user!.role)) {
      const q = await queueEditApproval(prisma, { documentType: 'ProductionRunEdit', targetId: id, body, rawBody: req.body, userId: req.user!.userId });
      return q.ok ? res.status(q.status).json(q.body) : res.status(q.status).json({ error: q.error });
    }
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
