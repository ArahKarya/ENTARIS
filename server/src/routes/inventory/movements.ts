import { Router } from 'express';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { AuthRequest, requireCap } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { CreateStockMovementSchema, UpdateStockMovementSchema } from '../../utils/schemas';
import { BusinessError, handleRouteError } from '../../utils/errors';
import { documentMovementLockMessage } from '../../services/documentMovementLock';
import { generateDocumentNumber } from '../../utils/documentNumber';
import { updateAccountBalance, recalculateAccountBalances } from '../../utils/accountBalance';
import { systemAccounts } from '../../services/systemAccounts';
import { logger } from '../../lib/logger';
import { calcWeightedAverage } from '../../utils/weightedAverage';
import { settleCogsBackfillForItem } from '../../services/cogsBackfillService';
import { reverseCogsSettlementsByTrigger } from '../../services/cogsBackfillReverse';
import { recomputeAverageCostFromReplay } from '../../services/averageCostRecompute';
import { adjustWarehouseStock } from '../../utils/warehouseStock';
import { parseListPaging, parseSort } from '../../utils/listQuery';
import {
  DEFAULT_STOCK_MOVEMENT_SORT,
  LEGACY_STOCK_MOVEMENT_ORDER,
  STOCK_MOVEMENT_SORT_FIELDS,
  buildStockMovementWhere,
  stockMovementOrderBy,
  summarizeStockMovements,
} from '../../services/stockMovementList';

const router = Router();

// GET /api/inventory/movements: paged list (limit <= 200), business-day date range.
// Without `sort` the order is movement number desc.
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const { page, limit: take, skip } = parseListPaging(query, { defaultLimit: 50, maxLimit: 200 });
    const filter = buildStockMovementWhere(query);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const { where } = filter;
    const orderBy = query.sort === undefined
      ? LEGACY_STOCK_MOVEMENT_ORDER
      : stockMovementOrderBy(parseSort(query.sort, STOCK_MOVEMENT_SORT_FIELDS, DEFAULT_STOCK_MOVEMENT_SORT));

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          item: { select: { id: true, name: true, code: true, unit: true } },
          warehouse: { select: { id: true, name: true, code: true } },
          offsetAccount: { select: { id: true, name: true, accountNumber: true } },
        },
        orderBy,
        skip,
        take,
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return res.json({ data: movements, total, page, limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/movements error');
    return res.status(500).json({ error: 'Gagal mengambil data gerakan stok.' });
  }
});

// GET /api/inventory/movements/summary — KPI totals (counts, qty & value in /
// out, cancelled) for the same filters as the list. Declared before /:id.
router.get('/summary', async (req, res) => {
  try {
    const filter = buildStockMovementWhere(req.query as Record<string, unknown>);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    const groups = await prisma.stockMovement.groupBy({
      by: ['movementType', 'isCancelled'],
      where: filter.where,
      _count: { _all: true },
      _sum: { quantity: true, totalValue: true },
    });
    return res.json(summarizeStockMovements(groups));
  } catch (error) {
    return handleRouteError(res, error, 'GET /inventory/movements/summary', 'Gagal menghitung ringkasan gerakan stok.');
  }
});

// POST /api/inventory/movements
router.post('/', async (req: AuthRequest, res) => {
  const body = validateBody(CreateStockMovementSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const txDate = new Date(body.date);
      const fiscalYear = await tx.fiscalYear.findFirst({
        where: {
          isClosed: false,
          startDate: { lte: txDate },
          endDate: { gte: txDate },
        },
      });
      if (!fiscalYear) throw new BusinessError('Tidak ada tahun fiskal aktif untuk tanggal transaksi ini.');

      const item = await tx.inventoryItem.findUnique({ where: { id: body.itemId } });
      if (!item) throw new BusinessError('Item stok tidak ditemukan.');
      if (!item.isActive) throw new BusinessError('Item stok tidak aktif.');

      // Warehouse from the body, else the default warehouse.
      let warehouseId: string | null = body.warehouseId || null;
      if (!warehouseId) {
        const defaultWh = await tx.warehouse.findFirst({ where: { isDefault: true, isActive: true } });
        warehouseId = defaultWh?.id ?? null;
      }
      if (!warehouseId) throw new BusinessError('Gudang tidak ditemukan dan tidak ada gudang default aktif.');

      const qty = body.quantity;
      const isOut = body.movementType === 'Out' || body.movementType === 'AdjustmentOut';
      const isIn = body.movementType === 'In' || body.movementType === 'AdjustmentIn';

      // Stock check is per warehouse (the source of truth) and only for regular Out.
      const stockRow = await tx.inventoryStock.findUnique({
        where: { itemId_warehouseId: { itemId: item.id, warehouseId } },
      });
      const stockAtWarehouse = Number(stockRow?.currentStock ?? 0);
      if (isOut && stockAtWarehouse < qty) {
        const wh = await tx.warehouse.findUnique({ where: { id: warehouseId } });
        throw new BusinessError(
          `Stok di ${wh?.name ?? 'gudang'} tidak cukup. Tersedia: ${stockAtWarehouse.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${item.unit}`,
        );
      }

      const movementDate = new Date(body.date);
      const movementNumber = await generateDocumentNumber(tx, 'SM', movementDate, fiscalYear.id);

      // Decimal math avoids float tails in GL amounts.
      const unitCost = body.unitCost ?? 0;
      const totalValue = new Decimal(qty).mul(new Decimal(unitCost)).toDecimalPlaces(2).toNumber();

      // Keep inventory_stocks (per warehouse) and the denormalized inventory_items.current_stock in sync.
      const stockDelta = isIn ? qty : -qty;
      await tx.inventoryStock.upsert({
        where: { itemId_warehouseId: { itemId: item.id, warehouseId } },
        create: { itemId: item.id, warehouseId, currentStock: stockDelta },
        update: { currentStock: { increment: stockDelta } },
      });
      const updateData: Record<string, unknown> = { currentStock: { increment: stockDelta } };
      if (isIn && unitCost > 0) {
        updateData.averageCost = calcWeightedAverage(item.currentStock, item.averageCost, qty, unitCost);
      }
      await tx.inventoryItem.update({
        where: { id: item.id },
        data: updateData,
      });

      // Always post to the GL when totalValue > 0.
      // Auto-resolve offsetAccountId: use provided value, or fall back to item's inventory account
      let resolvedOffsetAccountId = body.offsetAccountId || null;
      let journalEntryId: string | null = null;
      if (totalValue > 0) {
        // Use item's accountId or fall back to default INVENTORY account (1.4.0)
        let inventoryAccountId = item.accountId;
        if (!inventoryAccountId) {
          const defaultInvAccount = await systemAccounts.getAccount('INVENTORY');
          inventoryAccountId = defaultInvAccount.id;
        }

        // If no offset account provided, use Ekuitas Saldo Awal as default for opening stock
        if (!resolvedOffsetAccountId) {
          const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');
          resolvedOffsetAccountId = openingEquity.id;
        }

        // Prevent offset account being the same as inventory account (would cancel out)
        if (resolvedOffsetAccountId === inventoryAccountId) {
          const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');
          resolvedOffsetAccountId = openingEquity.id;
        }

        const userId = req.user!.userId;
        const typeLabels: Record<string, string> = {
          In: 'Stok Masuk',
          Out: 'Stok Keluar',
          AdjustmentIn: 'Penyesuaian Stok +',
          AdjustmentOut: 'Penyesuaian Stok −',
        };

        // Determine DR/CR
        let debitAccountId: string;
        let creditAccountId: string;

        if (isIn) {
          debitAccountId = inventoryAccountId;
          creditAccountId = resolvedOffsetAccountId!;
        } else {
          debitAccountId = resolvedOffsetAccountId!;
          creditAccountId = inventoryAccountId;
        }

        const entryNumber = await generateDocumentNumber(tx, 'JV', movementDate, fiscalYear.id);

        // Ledger and journal lines carry the narration so Buku Besar and the
        // reconciliation workspace show a description instead of an empty cell.
        const narration = `${typeLabels[body.movementType]}: ${item.name} ${qty} ${item.unit}${body.notes ? ' - ' + body.notes : ''}`;

        const je = await tx.journalEntry.create({
          data: {
            entryNumber,
            date: movementDate,
            status: 'Submitted',
            submittedAt: new Date(),
            narration,
            fiscalYearId: fiscalYear.id,
            createdBy: userId,
            items: {
              create: [
                { accountId: debitAccountId, debit: totalValue, credit: 0, description: narration },
                { accountId: creditAccountId, debit: 0, credit: totalValue, description: narration },
              ],
            },
          },
          include: { items: true },
        });

        // Post to immutable ledger
        await tx.accountingLedgerEntry.createMany({
          data: [
            {
              accountId: debitAccountId,
              date: movementDate,
              debit: totalValue,
              credit: 0,
              referenceType: 'JournalEntry',
              referenceId: je.id,
              description: narration,
              fiscalYearId: fiscalYear.id,
            },
            {
              accountId: creditAccountId,
              date: movementDate,
              debit: 0,
              credit: totalValue,
              referenceType: 'JournalEntry',
              referenceId: je.id,
              description: narration,
              fiscalYearId: fiscalYear.id,
            },
          ],
        });

        await updateAccountBalance(tx, debitAccountId, totalValue, 0);
        await updateAccountBalance(tx, creditAccountId, 0, totalValue);

        journalEntryId = je.id;
      }

      const movement = await tx.stockMovement.create({
        data: {
          movementNumber,
          date: movementDate,
          itemId: item.id,
          warehouseId,
          movementType: body.movementType as any,
          quantity: qty,
          unitCost,
          totalValue,
          notes: body.notes || null,
          referenceType: body.referenceType || null,
          referenceId: body.referenceId || null,
          referenceNumber: body.referenceNumber || null,
          offsetAccountId: resolvedOffsetAccountId || body.offsetAccountId || null,
          // Outbound adjustments may link to an inbound batch so batch consumption stays accurate.
          sourceMovementId:
            (body.movementType === 'Out' || body.movementType === 'AdjustmentOut') && body.sourceMovementId
              ? body.sourceMovementId
              : null,
          journalEntryId,
          fiscalYearId: fiscalYear.id,
          createdById: req.user!.userId,
        },
        include: {
          item: { select: { id: true, name: true, code: true, unit: true } },
        },
      });

      // Stock-in auto-settles pending COGS backfill.
      if (isIn) {
        await settleCogsBackfillForItem(tx, {
          itemId: item.id,
          qtyAvailable: qty,
          unitCostNow: unitCost,
          fiscalYearId: fiscalYear.id,
          userId: req.user!.userId,
          settleDate: movementDate,
          source: { type: 'StockMovement', refId: movement.id, refNo: movementNumber },
        });
      }

      return movement;
    }, { timeout: 15000 });

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /inventory/movements', 'Gagal mencatat gerakan stok.');
  }
});

// GET /api/inventory/movements/:id — single movement for edit
router.get('/:id', async (req, res) => {
  try {
    const id = req.params.id as string;
    const movement = await prisma.stockMovement.findUnique({
      where: { id },
      include: {
        item: { select: { id: true, name: true, code: true, unit: true } },
        offsetAccount: { select: { id: true, name: true, accountNumber: true } },
      },
    });
    if (!movement) return res.status(404).json({ error: 'Gerakan stok tidak ditemukan.' });
    return res.json(movement);
  } catch (error) {
    return handleRouteError(res, error, 'GET /inventory/movements/:id', 'Gagal mengambil data gerakan stok.');
  }
});

// PUT /api/inventory/movements/:id — edit movement (cancel old + create new)
router.put('/:id', async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const body = validateBody(UpdateStockMovementSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const oldMov = await tx.stockMovement.findUnique({
        where: { id },
        include: { item: true },
      });
      if (!oldMov) throw new BusinessError('Gerakan stok tidak ditemukan.');
      if (oldMov.isCancelled) throw new BusinessError('Gerakan stok sudah dibatalkan, tidak bisa diedit.');

      // STT-linked movements must be edited from the STT page: a per-line edit would orphan the STT journal.
      const editLock = documentMovementLockMessage(oldMov.referenceType, 'edit');
      if (editLock) throw new BusinessError(editLock);

      // Reject if movement is linked to ProductionRun
      if (oldMov.referenceType === 'ProductionRun') {
        throw new BusinessError('Gerakan stok dari proses produksi tidak dapat diedit secara langsung.');
      }

      const oldIsIn = oldMov.movementType === 'In' || oldMov.movementType === 'AdjustmentIn';
      const oldQty = Number(oldMov.quantity);
      const oldReverseDelta = oldIsIn ? -oldQty : oldQty;

      // Check if reversal would cause negative stock
      const currentStock = Number(oldMov.item.currentStock);
      if (currentStock + oldReverseDelta < 0) {
        throw new BusinessError('Tidak dapat mengedit: pembalikan stok lama menyebabkan stok negatif.');
      }

      await tx.inventoryItem.update({
        where: { id: oldMov.itemId },
        data: { currentStock: { increment: oldReverseDelta } },
      });
      await adjustWarehouseStock(tx, oldMov.itemId, oldMov.warehouseId, oldReverseDelta);

      const oldAffectedAccountIds: string[] = [];
      if (oldMov.journalEntryId) {
        const oldJe = await tx.journalEntry.findUnique({
          where: { id: oldMov.journalEntryId },
          include: { items: true },
        });
        if (oldJe) {
          oldAffectedAccountIds.push(...oldJe.items.map(ji => ji.accountId));
          await tx.accountingLedgerEntry.updateMany({
            where: { referenceId: oldMov.journalEntryId },
            data: { isCancelled: true },
          });
          await tx.journalEntry.update({
            where: { id: oldMov.journalEntryId },
            data: { status: 'Cancelled', cancelledAt: new Date() },
          });
        }
      }

      const newIsIn = body.movementType === 'In' || body.movementType === 'AdjustmentIn';
      const newQty = body.quantity;

      // Re-fetch stock after reversal
      const itemAfterReversal = await tx.inventoryItem.findUnique({ where: { id: oldMov.itemId } });
      if (!itemAfterReversal) throw new BusinessError('Item stok tidak ditemukan.');

      if (body.movementType === 'Out' && Number(itemAfterReversal.currentStock) < newQty) {
        throw new BusinessError(
          `Stok tidak cukup. Stok saat ini (setelah pembalikan): ${Number(itemAfterReversal.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${itemAfterReversal.unit}`
        );
      }

      const newStockDelta = newIsIn ? newQty : -newQty;
      await tx.inventoryItem.update({
        where: { id: oldMov.itemId },
        data: { currentStock: { increment: newStockDelta } },
      });
      // Reuse the same warehouse the movement was originally posted to.
      await adjustWarehouseStock(tx, oldMov.itemId, oldMov.warehouseId, newStockDelta);

      const newUnitCost = body.unitCost ?? 0;
      const newTotalValue = new Decimal(newQty).mul(new Decimal(newUnitCost)).toDecimalPlaces(2).toNumber();
      let newJournalEntryId: string | null = null;
      let resolvedEditOffsetAccountId = body.offsetAccountId || null;

      if (newTotalValue > 0) {
        let inventoryAccountId = itemAfterReversal.accountId;
        if (!inventoryAccountId) {
          const defaultInvAccount = await systemAccounts.getAccount('INVENTORY');
          inventoryAccountId = defaultInvAccount.id;
        }

        // Auto-resolve offset account if not provided
        if (!resolvedEditOffsetAccountId) {
          const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');
          resolvedEditOffsetAccountId = openingEquity.id;
        }

        // Prevent offset account being the same as inventory account (would cancel out)
        if (resolvedEditOffsetAccountId === inventoryAccountId) {
          const openingEquity = await systemAccounts.getAccount('OPENING_EQUITY');
          resolvedEditOffsetAccountId = openingEquity.id;
        }

        const typeLabels: Record<string, string> = {
          In: 'Stok Masuk',
          Out: 'Stok Keluar',
          AdjustmentIn: 'Penyesuaian Stok +',
          AdjustmentOut: 'Penyesuaian Stok −',
        };

        let debitAccountId: string;
        let creditAccountId: string;

        if (newIsIn) {
          debitAccountId = inventoryAccountId;
          creditAccountId = resolvedEditOffsetAccountId;
        } else {
          debitAccountId = resolvedEditOffsetAccountId;
          creditAccountId = inventoryAccountId;
        }

        const movementDate = new Date(body.date);
        const fiscalYear = await tx.fiscalYear.findFirst({
          where: { isClosed: false, startDate: { lte: movementDate }, endDate: { gte: movementDate } },
        });
        if (!fiscalYear) throw new BusinessError('Tidak ada tahun fiskal aktif untuk tanggal transaksi ini.');

        const editNarration = `${typeLabels[body.movementType]}: ${itemAfterReversal.name} ${newQty} ${itemAfterReversal.unit}${body.notes ? ' - ' + body.notes : ''} (Edit)`;
        const entryNumber = await generateDocumentNumber(tx, 'JV', movementDate, fiscalYear.id);

        const je = await tx.journalEntry.create({
          data: {
            entryNumber,
            date: movementDate,
            status: 'Submitted',
            submittedAt: new Date(),
            narration: editNarration,
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            items: {
              create: [
                { accountId: debitAccountId, debit: newTotalValue, credit: 0, description: editNarration },
                { accountId: creditAccountId, debit: 0, credit: newTotalValue, description: editNarration },
              ],
            },
          },
          include: { items: true },
        });

        await tx.accountingLedgerEntry.createMany({
          data: [
            { accountId: debitAccountId, date: movementDate, debit: newTotalValue, credit: 0, referenceType: 'JournalEntry', referenceId: je.id, description: editNarration, fiscalYearId: fiscalYear.id },
            { accountId: creditAccountId, date: movementDate, debit: 0, credit: newTotalValue, referenceType: 'JournalEntry', referenceId: je.id, description: editNarration, fiscalYearId: fiscalYear.id },
          ],
        });

        // Recalculate balances for all affected accounts (old + new)
        const allAffectedIds = [...new Set([...oldAffectedAccountIds, debitAccountId, creditAccountId])];
        await recalculateAccountBalances(tx, allAffectedIds);

        newJournalEntryId = je.id;
      } else if (oldAffectedAccountIds.length > 0) {
        // No new GL but old was cancelled — recalculate old affected accounts
        await recalculateAccountBalances(tx, [...new Set(oldAffectedAccountIds)]);
      }

      const updated = await tx.stockMovement.update({
        where: { id },
        data: {
          date: new Date(body.date),
          movementType: body.movementType as any,
          quantity: newQty,
          unitCost: newUnitCost,
          totalValue: newTotalValue,
          notes: body.notes || null,
          referenceType: body.referenceType || null,
          referenceNumber: body.referenceNumber || null,
          offsetAccountId: resolvedEditOffsetAccountId || body.offsetAccountId || null,
          journalEntryId: newJournalEntryId,
        },
        include: {
          item: { select: { id: true, name: true, code: true, unit: true } },
        },
      });

      // Editing an inbound movement makes its COGS auto-settle stale: reverse it, then re-settle if still stock-in.
      await reverseCogsSettlementsByTrigger(tx, "StockMovement", oldMov.id);
      if (newIsIn && newQty > 0) {
        await settleCogsBackfillForItem(tx, {
          itemId: oldMov.itemId,
          qtyAvailable: newQty,
          unitCostNow: newUnitCost,
          fiscalYearId: oldMov.fiscalYearId,
          userId: req.user!.userId,
          settleDate: new Date(body.date),
          source: { type: "StockMovement", refId: oldMov.id, refNo: oldMov.movementNumber },
        });
      }

      // An edit can change type/qty/cost, so WAC is re-derived by replaying all active movements in order.
      await recomputeAverageCostFromReplay(tx, oldMov.itemId);

      return updated;
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /inventory/movements/:id', 'Gagal mengupdate gerakan stok.');
  }
});

// PUT /api/inventory/movements/:id/cancel
router.put('/:id/cancel', requireCap('doc.cancel'), async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  try {
    await prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.findUnique({
        where: { id },
        include: { item: true },
      });
      if (!movement) throw new BusinessError('Gerakan stok tidak ditemukan.');
      if (movement.isCancelled) throw new BusinessError('Gerakan stok sudah dibatalkan.');
      const cancelLock = documentMovementLockMessage(movement.referenceType, 'cancel');
      if (cancelLock) throw new BusinessError(cancelLock);

      const isIn = movement.movementType === 'In' || movement.movementType === 'AdjustmentIn';
      const isOut = movement.movementType === 'Out' || movement.movementType === 'AdjustmentOut';
      const qty = Number(movement.quantity);

      // Validate reversal won't cause negative stock
      if (isIn && Number(movement.item.currentStock) < qty) {
        throw new BusinessError('Tidak dapat membatalkan: stok tidak mencukupi untuk pembalikan.');
      }

      // Reverse stock (item-level total + per-warehouse)
      const reverseDelta = isOut ? qty : -qty;
      await tx.inventoryItem.update({
        where: { id: movement.itemId },
        data: { currentStock: { increment: reverseDelta } },
      });
      await adjustWarehouseStock(tx, movement.itemId, movement.warehouseId, reverseDelta);

      // Cancel journal entry if exists
      if (movement.journalEntryId) {
        const je = await tx.journalEntry.findUnique({
          where: { id: movement.journalEntryId },
          include: { items: true },
        });
        await tx.journalEntry.update({
          where: { id: movement.journalEntryId },
          data: { status: 'Cancelled', cancelledAt: new Date() },
        });
        await tx.accountingLedgerEntry.updateMany({
          where: { referenceId: movement.journalEntryId },
          data: { isCancelled: true },
        });
        // Recalculate affected account balances from JE sums
        if (je) {
          const affectedIds = [...new Set(je.items.map(ji => ji.accountId))];
          await recalculateAccountBalances(tx, affectedIds);
        }
      }

      await tx.stockMovement.update({
        where: { id },
        data: { isCancelled: true },
      });
      // Balik auto-settle COGS yang dipicu movement manual ini
      await reverseCogsSettlementsByTrigger(tx, 'StockMovement', id);
      // Cancelled movement no longer contributes: re-derive WAC by replay.
      await recomputeAverageCostFromReplay(tx, movement.itemId);
    }, { timeout: 15000 });

    return res.json({ message: 'Gerakan stok dibatalkan.' });
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /inventory/movements/:id/cancel', 'Gagal membatalkan gerakan stok.');
  }
});

export default router;
