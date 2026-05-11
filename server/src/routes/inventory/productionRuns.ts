import { Router } from 'express';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { AuthRequest, roleMiddleware } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { CreateProductionRunSchema, UpdateProductionRunSchema } from '../../utils/schemas';
import { BusinessError, handleRouteError } from '../../utils/errors';
import { generateDocumentNumber } from '../../utils/documentNumber';
import { updateAccountBalance, recalculateAccountBalances } from '../../utils/accountBalance';
import { cancelJournalsByPrefix } from '../../utils/journalCancel';
import { systemAccounts } from '../../services/systemAccounts';
import { logger } from '../../lib/logger';
import { calcWeightedAverage } from '../../utils/weightedAverage';
import { settleCogsBackfillForItem } from '../../services/cogsBackfillService';
import { resolveWarehouseId, adjustWarehouseStock } from '../../utils/warehouseStock';

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
          },
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

// POST /api/inventory/production-runs
router.post('/', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateProductionRunSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Get active fiscal year for this transaction date
      const txDate = new Date(body.date);
      const fiscalYear = await tx.fiscalYear.findFirst({
        where: {
          isClosed: false,
          startDate: { lte: txDate },
          endDate: { gte: txDate },
        },
      });
      if (!fiscalYear) throw new BusinessError('Tidak ada tahun fiskal aktif untuk tanggal transaksi ini.');

      // 2. Pre-fetch all input and output items in a single query
      const allItemIds = [...body.inputs.map((i) => i.itemId), ...body.outputs.map((o) => o.itemId)];
      const allItems = await tx.inventoryItem.findMany({ where: { id: { in: allItemIds } } });
      const itemMap = new Map(allItems.map((i) => [i.id, i]));

      // Validate input items
      for (const input of body.inputs) {
        const item = itemMap.get(input.itemId);
        if (!item) throw new BusinessError(`Item input tidak ditemukan.`);
        if (!item.isActive) throw new BusinessError(`Item '${item.name}' tidak aktif.`);
        if (Number(item.currentStock) < input.quantity) {
          if (body.allowNegativeStock) {
            logger.warn(
              { itemId: item.id, itemName: item.name, currentStock: Number(item.currentStock), requested: input.quantity },
              'Production input with insufficient stock (allowNegativeStock=true)',
            );
          } else {
            throw new BusinessError(
              `Stok '${item.name}' tidak cukup. Stok saat ini: ${Number(item.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${item.unit}`
            );
          }
        }
      }

      // 3. Validate output items exist and are active. Enforce unit_price for
      // main output lines so the value is fully booked to inventory GL (schema
      // already validates this; this is a defense-in-depth check).
      for (const output of body.outputs) {
        const item = itemMap.get(output.itemId);
        if (!item) throw new BusinessError(`Item output tidak ditemukan.`);
        if (!item.isActive) throw new BusinessError(`Item output '${item.name}' tidak aktif.`);
        if (!output.isByProduct && (!output.unitPrice || output.unitPrice <= 0)) {
          throw new BusinessError(`Harga/HPP '${item.name}' wajib diisi dan lebih dari 0.`);
        }
      }

      // 4. Generate run number
      const runDate = new Date(body.date);
      const runNumber = await generateDocumentNumber(tx, 'PR', runDate, fiscalYear.id);

      // 5. Calculate yieldPct: total main output / total input × 100
      const totalInputQty = body.inputs.reduce((s, i) => s + i.quantity, 0);
      const totalMainOutputQty = body.outputs.filter(o => !o.isByProduct).reduce((s, o) => s + o.quantity, 0);
      const yieldPct = totalInputQty > 0 ? (totalMainOutputQty / totalInputQty) * 100 : null;

      // 6. Create the ProductionRun header
      const run = await tx.productionRun.create({
        data: {
          runNumber,
          date: runDate,
          notes: body.notes || null,
          referenceType: body.referenceType || null,
          referenceId: body.referenceId || null,
          referenceNumber: body.referenceNumber || null,
          yieldPct: yieldPct !== null ? yieldPct : null,
          fiscalYearId: fiscalYear.id,
          createdById: req.user!.userId,
        },
      });

      // 7. Process inputs: reduce stock + create StockMovement Out (with averageCost)
      // Production runs use the default warehouse for both consumption and yield.
      const productionWarehouseId = await resolveWarehouseId(tx, null);
      let totalInputValue = new Decimal(0);
      for (const input of body.inputs) {
        const item = itemMap.get(input.itemId);
        if (!item) continue;

        const avgCost = Number(item.averageCost);
        const inputUnitCost = avgCost > 0 ? avgCost : 0;
        const inputTotalValue = new Decimal(input.quantity).mul(new Decimal(inputUnitCost)).toDecimalPlaces(2).toNumber();
        totalInputValue = totalInputValue.plus(new Decimal(inputTotalValue));

        await tx.inventoryItem.update({
          where: { id: input.itemId },
          data: { currentStock: { decrement: input.quantity } },
        });
        await adjustWarehouseStock(tx, input.itemId, productionWarehouseId, -input.quantity);

        const movNumber = await generateDocumentNumber(tx, 'SM', runDate, fiscalYear.id);
        await tx.stockMovement.create({
          data: {
            movementNumber: movNumber,
            date: runDate,
            itemId: input.itemId,
            warehouseId: productionWarehouseId,
            movementType: 'Out',
            quantity: input.quantity,
            unitCost: inputUnitCost,
            totalValue: inputTotalValue,
            referenceType: 'ProductionRun',
            referenceId: run.id,
            referenceNumber: runNumber,
            notes: body.notes || null,
            fiscalYearId: fiscalYear.id,
            createdById: req.user!.userId,
          },
        });
      }

      // 8. Process outputs: increase stock + create StockMovement In (with user-entered HPP/kg)
      let totalOutputValue = new Decimal(0);
      for (const output of body.outputs) {
        const outputItem = await tx.inventoryItem.findUnique({ where: { id: output.itemId } });
        const unitCost = output.unitPrice ?? 0;

        const newAvgCost = outputItem && unitCost > 0
          ? calcWeightedAverage(outputItem.currentStock, outputItem.averageCost, output.quantity, unitCost)
          : undefined;

        await tx.inventoryItem.update({
          where: { id: output.itemId },
          data: {
            currentStock: { increment: output.quantity },
            ...(newAvgCost !== undefined ? { averageCost: newAvgCost } : {}),
          },
        });
        await adjustWarehouseStock(tx, output.itemId, productionWarehouseId, output.quantity);
        const totalValue = new Decimal(output.quantity).mul(new Decimal(unitCost)).toDecimalPlaces(2).toNumber();
        totalOutputValue = totalOutputValue.plus(new Decimal(totalValue));

        const movNumber = await generateDocumentNumber(tx, 'SM', runDate, fiscalYear.id);
        await tx.stockMovement.create({
          data: {
            movementNumber: movNumber,
            date: runDate,
            itemId: output.itemId,
            warehouseId: productionWarehouseId,
            movementType: 'In',
            quantity: output.quantity,
            unitCost,
            totalValue,
            referenceType: 'ProductionRun',
            referenceId: run.id,
            referenceNumber: runNumber,
            notes: body.notes || null,
            fiscalYearId: fiscalYear.id,
            createdById: req.user!.userId,
          },
        });

        // Auto-settle pending COGS backfill on output stock-in
        await settleCogsBackfillForItem(tx, {
          itemId: output.itemId,
          qtyAvailable: output.quantity,
          unitCostNow: unitCost,
          fiscalYearId: fiscalYear.id,
          userId: req.user!.userId,
          settleDate: runDate,
          source: { type: 'ProductionRun', refId: run.id, refNo: runNumber },
        });
      }

      // 8b. GL posting: DR output accounts / CR input accounts / CR conversion cost (if any)
      const defaultInvAccount = await systemAccounts.getAccount('INVENTORY');
      const inputNames = body.inputs.map(i => itemMap.get(i.itemId)?.name || '').join(', ');
      const outputNames = body.outputs.map(o => itemMap.get(o.itemId)?.name || '').join(', ');

      const jvNumber = `JV-${runNumber}`;
      const journalItems: { accountId: string; debit: number; credit: number; description: string }[] = [];

      // CR each input item's account
      let totalInputCost = new Decimal(0);
      for (const input of body.inputs) {
        const item = itemMap.get(input.itemId);
        if (!item) continue;
        const avgCost = Number(item.averageCost);
        const val = new Decimal(input.quantity).mul(new Decimal(avgCost > 0 ? avgCost : 0)).toDecimalPlaces(2).toNumber();
        if (val <= 0) continue;
        totalInputCost = totalInputCost.plus(new Decimal(val));
        const acctId = item.accountId || defaultInvAccount.id;
        journalItems.push({
          accountId: acctId,
          debit: 0, credit: val,
          description: `Bahan baku keluar ${item.name}: ${runNumber}`,
        });
      }

      // DR each output item's account (at HPP/unit price set by user)
      let totalOutputCost = new Decimal(0);
      for (const output of body.outputs) {
        const unitCost = output.unitPrice ?? 0;
        const val = new Decimal(output.quantity).mul(new Decimal(unitCost)).toDecimalPlaces(2).toNumber();
        if (val <= 0) continue;
        totalOutputCost = totalOutputCost.plus(new Decimal(val));
        const outItem = await tx.inventoryItem.findUnique({ where: { id: output.itemId }, select: { accountId: true, name: true } });
        const acctId = outItem?.accountId || defaultInvAccount.id;
        journalItems.push({
          accountId: acctId,
          debit: val, credit: 0,
          description: `Produksi masuk ${outItem?.name || ''}: ${runNumber}`,
        });
      }

      // Balance the journal: difference goes to HPP Beras (5.1)
      const diff = totalOutputCost.minus(totalInputCost).toDecimalPlaces(2).toNumber();
      if (Math.abs(diff) > 0) {
        const hppBerasAccount = await tx.account.findFirst({ where: { accountNumber: '5.1' } });
        const cogsAccount = hppBerasAccount || await systemAccounts.getAccount('COGS');
        if (diff > 0) {
          // Output > Input: HPP produksi (CR to balance)
          journalItems.push({
            accountId: cogsAccount.id,
            debit: 0, credit: diff,
            description: `HPP konversi produksi: ${runNumber}`,
          });
        } else {
          // Output < Input: rugi produksi (DR)
          journalItems.push({
            accountId: cogsAccount.id,
            debit: Math.abs(diff), credit: 0,
            description: `HPP rugi produksi: ${runNumber}`,
          });
        }
      }

      if (journalItems.length > 0) {
        const journalEntry = await tx.journalEntry.create({
          data: {
            entryNumber: jvNumber,
            date: runDate,
            narration: `Produksi: ${runNumber} — ${inputNames} → ${outputNames}`,
            status: 'Submitted',
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            submittedAt: new Date(),
            items: { create: journalItems },
          },
        });

        await tx.accountingLedgerEntry.createMany({
          data: journalItems.map(ji => ({
            date: runDate,
            accountId: ji.accountId,
            debit: ji.debit,
            credit: ji.credit,
            referenceType: 'JournalEntry',
            referenceId: journalEntry.id,
            description: ji.description,
            fiscalYearId: fiscalYear.id,
          })),
        });

        // Update account balances per account
        const balanceMap = new Map<string, { debit: number; credit: number }>();
        for (const ji of journalItems) {
          const entry = balanceMap.get(ji.accountId) || { debit: 0, credit: 0 };
          entry.debit += ji.debit;
          entry.credit += ji.credit;
          balanceMap.set(ji.accountId, entry);
        }
        for (const [acctId, bal] of balanceMap) {
          await updateAccountBalance(tx, acctId, bal.debit, bal.credit);
        }
      }

      // 9. Create ProductionRunItems for record-keeping
      const lineItems = [
        ...body.inputs.map(i => ({
          productionRunId: run.id,
          itemId: i.itemId,
          lineType: 'Input',
          quantity: i.quantity,
          unitPrice: null as number | null,
          yieldPct: null as number | null,
          isByProduct: false,
        })),
        ...body.outputs.map((o) => {
          const rPct = totalInputQty > 0 && !o.isByProduct
            ? (o.quantity / totalInputQty) * 100
            : null;
          return {
            productionRunId: run.id,
            itemId: o.itemId,
            lineType: o.isByProduct ? 'ByProduct' : 'Output',
            quantity: o.quantity,
            unitPrice: o.unitPrice ?? null,
            yieldPct: rPct,
            isByProduct: o.isByProduct ?? false,
          };
        }),
      ];

      await tx.productionRunItem.createMany({ data: lineItems });

      // Return full run with items
      return tx.productionRun.findUnique({
        where: { id: run.id },
        include: {
          items: {
            include: {
              item: { select: { id: true, name: true, unit: true, code: true } },
            },
          },
        },
      });
    }, { timeout: 30000 }); // heavy: multiple stock movements + GL entries

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /inventory/production-runs', 'Gagal mencatat proses produksi.');
  }
});

// PUT /api/inventory/production-runs/:id — Edit (cancel old + recreate with same runNumber)
router.put('/:id', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const body = validateBody(UpdateProductionRunSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // ── 1. Load existing run ──
      const oldRun = await tx.productionRun.findUnique({
        where: { id },
        include: { items: { include: { item: true } } },
      });
      if (!oldRun) throw new BusinessError('Data proses produksi tidak ditemukan.');
      if (oldRun.isCancelled) throw new BusinessError('Proses produksi yang sudah dibatalkan tidak bisa diedit.');

      // ── 2. Reverse old stock movements ──
      const oldMovements = await tx.stockMovement.findMany({
        where: { referenceType: 'ProductionRun', referenceId: id, isCancelled: false },
        include: { item: true },
      });

      const outputItemIds = new Set<string>();

      for (const mov of oldMovements) {
        const isIn = mov.movementType === 'In' || mov.movementType === 'AdjustmentIn';
        const isOut = mov.movementType === 'Out' || mov.movementType === 'AdjustmentOut';
        const qty = Number(mov.quantity);

        if (isIn && Number(mov.item.currentStock) < qty) {
          if (body.allowNegativeStock) {
            logger.warn(
              { itemId: mov.itemId, itemName: mov.item.name, currentStock: Number(mov.item.currentStock), reverseQty: qty },
              'Production edit reverse with insufficient stock (allowNegativeStock=true)',
            );
          } else {
            throw new BusinessError(
              `Tidak dapat mengedit: stok '${mov.item.name}' tidak mencukupi untuk pembalikan.`
            );
          }
        }

        if (isIn) outputItemIds.add(mov.itemId);

        const reverseDelta = isOut ? qty : -qty;
        await tx.inventoryItem.update({
          where: { id: mov.itemId },
          data: { currentStock: { increment: reverseDelta } },
        });
        await adjustWarehouseStock(tx, mov.itemId, mov.warehouseId, reverseDelta);

        await tx.stockMovement.update({
          where: { id: mov.id },
          data: { isCancelled: true },
        });
      }

      // Recalculate averageCost for old output items
      for (const itemId of outputItemIds) {
        const activeInMovements = await tx.stockMovement.findMany({
          where: { itemId, movementType: { in: ['In', 'AdjustmentIn'] }, isCancelled: false },
          select: { quantity: true, unitCost: true },
        });
        if (activeInMovements.length === 0) {
          await tx.inventoryItem.update({ where: { id: itemId }, data: { averageCost: 0 } });
        } else {
          let totalQty = new Decimal(0), totalValue = new Decimal(0);
          for (const m of activeInMovements) {
            const q = new Decimal(Number(m.quantity));
            totalQty = totalQty.plus(q);
            totalValue = totalValue.plus(q.mul(new Decimal(Number(m.unitCost))));
          }
          await tx.inventoryItem.update({
            where: { id: itemId },
            data: { averageCost: totalQty.gt(0) ? totalValue.div(totalQty).toDecimalPlaces(2).toNumber() : 0 },
          });
        }
      }

      // ── 3. Cancel ALL active journals for this production run (including revisions) ──
      const oldJvNumber = `JV-${oldRun.runNumber}`;
      await cancelJournalsByPrefix(tx, oldJvNumber);

      // ── 4. Delete old run items ──
      await tx.productionRunItem.deleteMany({ where: { productionRunId: id } });

      // ── 5. Apply new data (same logic as POST, but reuse the run record) ──
      const txDate = new Date(body.date);
      const fiscalYear = await tx.fiscalYear.findFirst({
        where: { isClosed: false, startDate: { lte: txDate }, endDate: { gte: txDate } },
      });
      if (!fiscalYear) throw new BusinessError('Tidak ada tahun fiskal aktif untuk tanggal transaksi ini.');

      const allItemIds = [...body.inputs.map((i) => i.itemId), ...body.outputs.map((o) => o.itemId)];
      const allItems = await tx.inventoryItem.findMany({ where: { id: { in: allItemIds } } });
      const itemMap = new Map(allItems.map((i) => [i.id, i]));

      for (const input of body.inputs) {
        const item = itemMap.get(input.itemId);
        if (!item) throw new BusinessError('Item input tidak ditemukan.');
        if (!item.isActive) throw new BusinessError(`Item '${item.name}' tidak aktif.`);
        if (Number(item.currentStock) < input.quantity) {
          if (body.allowNegativeStock) {
            logger.warn(
              { itemId: item.id, itemName: item.name, currentStock: Number(item.currentStock), requested: input.quantity },
              'Production edit input with insufficient stock (allowNegativeStock=true)',
            );
          } else {
            throw new BusinessError(
              `Stok '${item.name}' tidak cukup. Stok saat ini: ${Number(item.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${item.unit}`
            );
          }
        }
      }

      for (const output of body.outputs) {
        const item = itemMap.get(output.itemId);
        if (!item) throw new BusinessError('Item output tidak ditemukan.');
        if (!item.isActive) throw new BusinessError(`Item output '${item.name}' tidak aktif.`);
        if (!output.isByProduct && (!output.unitPrice || output.unitPrice <= 0)) {
          throw new BusinessError(`Harga/HPP '${item.name}' wajib diisi dan lebih dari 0.`);
        }
      }

      const totalInputQty = body.inputs.reduce((s, i) => s + i.quantity, 0);
      const totalMainOutputQty = body.outputs.filter(o => !o.isByProduct).reduce((s, o) => s + o.quantity, 0);
      const yieldPct = totalInputQty > 0 ? (totalMainOutputQty / totalInputQty) * 100 : null;

      // Update header
      await tx.productionRun.update({
        where: { id },
        data: {
          date: txDate,
          notes: body.notes || null,
          referenceType: body.referenceType || null,
          referenceId: body.referenceId || null,
          referenceNumber: body.referenceNumber || null,
          yieldPct: yieldPct !== null ? yieldPct : null,
          fiscalYearId: fiscalYear.id,
        },
      });

      // Process inputs
      const productionWarehouseId = await resolveWarehouseId(tx, null);
      let totalInputValue = new Decimal(0);
      for (const input of body.inputs) {
        const item = itemMap.get(input.itemId);
        if (!item) continue;
        const avgCost = Number(item.averageCost);
        const inputUnitCost = avgCost > 0 ? avgCost : 0;
        const inputTotalValue = new Decimal(input.quantity).mul(new Decimal(inputUnitCost)).toDecimalPlaces(2).toNumber();
        totalInputValue = totalInputValue.plus(new Decimal(inputTotalValue));

        await tx.inventoryItem.update({
          where: { id: input.itemId },
          data: { currentStock: { decrement: input.quantity } },
        });
        await adjustWarehouseStock(tx, input.itemId, productionWarehouseId, -input.quantity);

        const movNumber = await generateDocumentNumber(tx, 'SM', txDate, fiscalYear.id);
        await tx.stockMovement.create({
          data: {
            movementNumber: movNumber, date: txDate, itemId: input.itemId,
            warehouseId: productionWarehouseId,
            movementType: 'Out', quantity: input.quantity, unitCost: inputUnitCost,
            totalValue: inputTotalValue, referenceType: 'ProductionRun', referenceId: id,
            referenceNumber: oldRun.runNumber, notes: body.notes || null,
            fiscalYearId: fiscalYear.id, createdById: req.user!.userId,
          },
        });
      }

      // Process outputs
      let totalOutputValue = new Decimal(0);
      for (const output of body.outputs) {
        const outputItem = await tx.inventoryItem.findUnique({ where: { id: output.itemId } });
        const unitCost = output.unitPrice ?? 0;
        const newAvgCost = outputItem && unitCost > 0
          ? calcWeightedAverage(outputItem.currentStock, outputItem.averageCost, output.quantity, unitCost)
          : undefined;

        await tx.inventoryItem.update({
          where: { id: output.itemId },
          data: {
            currentStock: { increment: output.quantity },
            ...(newAvgCost !== undefined ? { averageCost: newAvgCost } : {}),
          },
        });
        await adjustWarehouseStock(tx, output.itemId, productionWarehouseId, output.quantity);
        const totalValue = new Decimal(output.quantity).mul(new Decimal(unitCost)).toDecimalPlaces(2).toNumber();
        totalOutputValue = totalOutputValue.plus(new Decimal(totalValue));

        const movNumber = await generateDocumentNumber(tx, 'SM', txDate, fiscalYear.id);
        await tx.stockMovement.create({
          data: {
            movementNumber: movNumber, date: txDate, itemId: output.itemId,
            warehouseId: productionWarehouseId,
            movementType: 'In', quantity: output.quantity, unitCost, totalValue,
            referenceType: 'ProductionRun', referenceId: id,
            referenceNumber: oldRun.runNumber, notes: body.notes || null,
            fiscalYearId: fiscalYear.id, createdById: req.user!.userId,
          },
        });

        // Auto-settle pending COGS backfill on edited production output
        await settleCogsBackfillForItem(tx, {
          itemId: output.itemId,
          qtyAvailable: output.quantity,
          unitCostNow: unitCost,
          fiscalYearId: fiscalYear.id,
          userId: req.user!.userId,
          settleDate: txDate,
          source: { type: 'ProductionRun', refId: id, refNo: oldRun.runNumber },
        });
      }

      // GL posting
      const defaultInvAccount = await systemAccounts.getAccount('INVENTORY');
      const inputNames = body.inputs.map(i => itemMap.get(i.itemId)?.name || '').join(', ');
      const outputNames = body.outputs.map(o => itemMap.get(o.itemId)?.name || '').join(', ');

      const journalItems: { accountId: string; debit: number; credit: number; description: string }[] = [];

      let totalInputCost = new Decimal(0);
      for (const input of body.inputs) {
        const item = itemMap.get(input.itemId);
        if (!item) continue;
        const avgCost = Number(item.averageCost);
        const val = new Decimal(input.quantity).mul(new Decimal(avgCost > 0 ? avgCost : 0)).toDecimalPlaces(2).toNumber();
        if (val <= 0) continue;
        totalInputCost = totalInputCost.plus(new Decimal(val));
        journalItems.push({
          accountId: item.accountId || defaultInvAccount.id,
          debit: 0, credit: val,
          description: `Bahan baku keluar ${item.name}: ${oldRun.runNumber}`,
        });
      }

      let totalOutputCost = new Decimal(0);
      for (const output of body.outputs) {
        const unitCost = output.unitPrice ?? 0;
        const val = new Decimal(output.quantity).mul(new Decimal(unitCost)).toDecimalPlaces(2).toNumber();
        if (val <= 0) continue;
        totalOutputCost = totalOutputCost.plus(new Decimal(val));
        const outItem = await tx.inventoryItem.findUnique({ where: { id: output.itemId }, select: { accountId: true, name: true } });
        journalItems.push({
          accountId: outItem?.accountId || defaultInvAccount.id,
          debit: val, credit: 0,
          description: `Produksi masuk ${outItem?.name || ''}: ${oldRun.runNumber}`,
        });
      }

      const diff = totalOutputCost.minus(totalInputCost).toDecimalPlaces(2).toNumber();
      if (Math.abs(diff) > 0) {
        const hppBerasAccount = await tx.account.findFirst({ where: { accountNumber: '5.1' } });
        const cogsAccount = hppBerasAccount || await systemAccounts.getAccount('COGS');
        journalItems.push({
          accountId: cogsAccount.id,
          debit: diff > 0 ? 0 : Math.abs(diff),
          credit: diff > 0 ? diff : 0,
          description: `HPP ${diff > 0 ? 'konversi' : 'rugi'} produksi: ${oldRun.runNumber}`,
        });
      }

      if (journalItems.length > 0) {
        // Generate unique revision JV number (count only cancelled revisions to get next number)
        const cancelledCount = await tx.journalEntry.count({
          where: { entryNumber: { startsWith: oldJvNumber }, status: 'Cancelled' },
        });
        const revSuffix = `-R${cancelledCount > 0 ? cancelledCount : 1}`;
        const journalEntry = await tx.journalEntry.create({
          data: {
            entryNumber: oldJvNumber + revSuffix,
            date: txDate,
            narration: `Produksi (revisi): ${oldRun.runNumber} — ${inputNames} → ${outputNames}`,
            status: 'Submitted',
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            submittedAt: new Date(),
            items: { create: journalItems },
          },
        });

        await tx.accountingLedgerEntry.createMany({
          data: journalItems.map(ji => ({
            date: txDate, accountId: ji.accountId, debit: ji.debit, credit: ji.credit,
            referenceType: 'JournalEntry', referenceId: journalEntry.id,
            description: ji.description, fiscalYearId: fiscalYear.id,
          })),
        });
      }

      // Recalculate balances from JE sums for ALL accounts affected by this production run
      // (both old cancelled JEs and new JE). This prevents drift from incremental updates.
      {
        const allRelatedJEItems = await tx.journalItem.findMany({
          where: {
            journalEntry: { entryNumber: { startsWith: oldJvNumber } },
          },
          select: { accountId: true },
        });
        const affectedAccountIds = [...new Set(allRelatedJEItems.map(ji => ji.accountId))];
        if (affectedAccountIds.length > 0) {
          await recalculateAccountBalances(tx, affectedAccountIds);
        }
      }

      // Create new run items
      const lineItems = [
        ...body.inputs.map(i => ({
          productionRunId: id, itemId: i.itemId, lineType: 'Input',
          quantity: i.quantity, unitPrice: null as number | null,
          yieldPct: null as number | null, isByProduct: false,
        })),
        ...body.outputs.map((o) => ({
          productionRunId: id, itemId: o.itemId,
          lineType: o.isByProduct ? 'ByProduct' : 'Output',
          quantity: o.quantity, unitPrice: o.unitPrice ?? null,
          yieldPct: totalInputQty > 0 && !o.isByProduct ? (o.quantity / totalInputQty) * 100 : null,
          isByProduct: o.isByProduct ?? false,
        })),
      ];
      await tx.productionRunItem.createMany({ data: lineItems });

      return tx.productionRun.findUnique({
        where: { id },
        include: {
          items: { include: { item: { select: { id: true, name: true, unit: true, code: true } } } },
        },
      });
    }, { timeout: 30000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /inventory/production-runs/:id', 'Gagal mengedit proses produksi.');
  }
});

// PUT /api/inventory/production-runs/:id/cancel
router.put('/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  try {
    await prisma.$transaction(async (tx) => {
      const run = await tx.productionRun.findUnique({
        where: { id },
        include: { items: { include: { item: true } } },
      });
      if (!run) throw new BusinessError('Data proses produksi tidak ditemukan.');
      if (run.isCancelled) throw new BusinessError('Proses produksi sudah dibatalkan.');

      // Find all related StockMovements
      const movements = await tx.stockMovement.findMany({
        where: { referenceType: 'ProductionRun', referenceId: id, isCancelled: false },
        include: { item: true },
      });

      // Collect output item IDs that need averageCost recalculation
      const outputItemIds = new Set<string>();

      // Reverse each movement
      for (const mov of movements) {
        const isIn = mov.movementType === 'In' || mov.movementType === 'AdjustmentIn';
        const isOut = mov.movementType === 'Out' || mov.movementType === 'AdjustmentOut';
        const qty = Number(mov.quantity);

        // Check reversal won't cause negative stock for 'In' movements (reversing In = subtract)
        // Cancel accepts optional ?allowNegativeStock=true query param to bypass this guard.
        const allowNeg = req.query.allowNegativeStock === 'true';
        if (isIn && Number(mov.item.currentStock) < qty) {
          if (allowNeg) {
            logger.warn(
              { itemId: mov.itemId, itemName: mov.item.name, currentStock: Number(mov.item.currentStock), reverseQty: qty },
              'Production cancel reverse with insufficient stock (allowNegativeStock=true)',
            );
          } else {
            throw new BusinessError(
              `Tidak dapat membatalkan: stok '${mov.item.name}' tidak mencukupi untuk pembalikan.`
            );
          }
        }

        if (isIn) outputItemIds.add(mov.itemId);

        const reverseDelta = isOut ? qty : -qty;
        await tx.inventoryItem.update({
          where: { id: mov.itemId },
          data: { currentStock: { increment: reverseDelta } },
        });
        await adjustWarehouseStock(tx, mov.itemId, mov.warehouseId, reverseDelta);

        await tx.stockMovement.update({
          where: { id: mov.id },
          data: { isCancelled: true },
        });
      }

      // Recalculate averageCost for output items from remaining active In movements
      for (const itemId of outputItemIds) {
        const activeInMovements = await tx.stockMovement.findMany({
          where: {
            itemId,
            movementType: { in: ['In', 'AdjustmentIn'] },
            isCancelled: false,
          },
          select: { quantity: true, unitCost: true },
        });

        if (activeInMovements.length === 0) {
          await tx.inventoryItem.update({
            where: { id: itemId },
            data: { averageCost: 0 },
          });
        } else {
          let totalQty = new Decimal(0);
          let totalValue = new Decimal(0);
          for (const m of activeInMovements) {
            const q = new Decimal(Number(m.quantity));
            const c = new Decimal(Number(m.unitCost));
            totalQty = totalQty.plus(q);
            totalValue = totalValue.plus(q.mul(c));
          }
          const newAvgCost = totalQty.gt(0)
            ? totalValue.div(totalQty).toDecimalPlaces(2).toNumber()
            : 0;
          await tx.inventoryItem.update({
            where: { id: itemId },
            data: { averageCost: newAvgCost },
          });
        }
      }

      // Cancel ALL related journals + ledger entries (including revisions)
      const jvNumber = `JV-${run.runNumber}`;

      // Collect affected account IDs BEFORE cancelling (while JEs are still active)
      const relatedJEItems = await tx.journalItem.findMany({
        where: {
          journalEntry: { entryNumber: { startsWith: jvNumber }, status: { not: 'Cancelled' } },
        },
        select: { accountId: true },
      });
      const cancelAffectedAccountIds = [...new Set(relatedJEItems.map(ji => ji.accountId))];

      await cancelJournalsByPrefix(tx, jvNumber);

      // Recalculate balances from JE sums (prevents drift from incremental reversal)
      if (cancelAffectedAccountIds.length > 0) {
        await recalculateAccountBalances(tx, cancelAffectedAccountIds);
      }

      // Mark run as cancelled
      await tx.productionRun.update({
        where: { id },
        data: { isCancelled: true },
      });
    }, { timeout: 15000 });

    return res.json({ message: 'Proses produksi berhasil dibatalkan.' });
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /inventory/production-runs/:id/cancel', 'Gagal membatalkan proses produksi.');
  }
});

export default router;
