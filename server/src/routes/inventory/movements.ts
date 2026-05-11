import { Router } from 'express';
import Decimal from 'decimal.js';
import { prisma } from '../../lib/prisma';
import { AuthRequest, roleMiddleware } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { CreateStockMovementSchema, UpdateStockMovementSchema } from '../../utils/schemas';
import { BusinessError, handleRouteError } from '../../utils/errors';
import { generateDocumentNumber } from '../../utils/documentNumber';
import { updateAccountBalance, recalculateAccountBalances } from '../../utils/accountBalance';
import { systemAccounts } from '../../services/systemAccounts';
import { logger } from '../../lib/logger';
import { calcWeightedAverage } from '../../utils/weightedAverage';
import { settleCogsBackfillForItem } from '../../services/cogsBackfillService';

const router = Router();

// GET /api/inventory/movements
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '50', itemId, movementType, startDate, endDate } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;

    const where: any = {};
    if (itemId) where.itemId = itemId;
    if (movementType) where.movementType = movementType;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate as string);
      if (endDate) where.date.lte = new Date(endDate as string);
    }

    const [movements, total] = await Promise.all([
      prisma.stockMovement.findMany({
        where,
        include: {
          item: { select: { id: true, name: true, code: true, unit: true } },
          offsetAccount: { select: { id: true, name: true, accountNumber: true } },
        },
        orderBy: [{ movementNumber: 'desc' }],
        skip,
        take,
      }),
      prisma.stockMovement.count({ where }),
    ]);

    return res.json({ data: movements, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/movements error');
    return res.status(500).json({ error: 'Gagal mengambil data gerakan stok.' });
  }
});

// POST /api/inventory/movements
router.post('/', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateStockMovementSchema, req.body, res);
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

      // 2. Get item
      const item = await tx.inventoryItem.findUnique({ where: { id: body.itemId } });
      if (!item) throw new BusinessError('Item stok tidak ditemukan.');
      if (!item.isActive) throw new BusinessError('Item stok tidak aktif.');

      // 2b. Resolve warehouse — explicit from body OR default warehouse.
      let warehouseId: string | null = body.warehouseId || null;
      if (!warehouseId) {
        const defaultWh = await tx.warehouse.findFirst({ where: { isDefault: true, isActive: true } });
        warehouseId = defaultWh?.id ?? null;
      }
      if (!warehouseId) throw new BusinessError('Gudang tidak ditemukan dan tidak ada gudang default aktif.');

      const qty = body.quantity;
      const isOut = body.movementType === 'Out' || body.movementType === 'AdjustmentOut';
      const isIn = body.movementType === 'In' || body.movementType === 'AdjustmentIn';

      // 3. Validate stock availability per WAREHOUSE (only for regular Out).
      // Per-warehouse balance is the source of truth now.
      const stockRow = await tx.inventoryStock.findUnique({
        where: { itemId_warehouseId: { itemId: item.id, warehouseId } },
      });
      const stockAtWarehouse = Number(stockRow?.currentStock ?? 0);
      if (body.movementType === 'Out' && stockAtWarehouse < qty) {
        const wh = await tx.warehouse.findUnique({ where: { id: warehouseId } });
        throw new BusinessError(
          `Stok di ${wh?.name ?? 'gudang'} tidak cukup. Tersedia: ${stockAtWarehouse.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${item.unit}`,
        );
      }

      // 4. Generate movement number
      const movementDate = new Date(body.date);
      const movementNumber = await generateDocumentNumber(tx, 'SM', movementDate, fiscalYear.id);

      // 5. Calculate total value
      const unitCost = body.unitCost ?? 0;
      const totalValue = qty * unitCost;

      // 6. Update inventory_stocks (per-warehouse) AND inventory_items.current_stock (total denorm).
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

      // 7. GL posting — always post if totalValue > 0
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

        const je = await tx.journalEntry.create({
          data: {
            entryNumber,
            date: movementDate,
            status: 'Submitted',
            submittedAt: new Date(),
            narration: `${typeLabels[body.movementType]}: ${item.name} ${qty} ${item.unit}${body.notes ? ' - ' + body.notes : ''}`,
            fiscalYearId: fiscalYear.id,
            createdBy: userId,
            items: {
              create: [
                { accountId: debitAccountId, debit: totalValue, credit: 0 },
                { accountId: creditAccountId, debit: 0, credit: totalValue },
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
              fiscalYearId: fiscalYear.id,
            },
            {
              accountId: creditAccountId,
              date: movementDate,
              debit: 0,
              credit: totalValue,
              referenceType: 'JournalEntry',
              referenceId: je.id,
              fiscalYearId: fiscalYear.id,
            },
          ],
        });

        // Update account balances
        await updateAccountBalance(tx, debitAccountId, totalValue, 0);
        await updateAccountBalance(tx, creditAccountId, 0, totalValue);

        journalEntryId = je.id;
      }

      // 8. Create movement record
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
          journalEntryId,
          fiscalYearId: fiscalYear.id,
          createdById: req.user!.userId,
        },
        include: {
          item: { select: { id: true, name: true, code: true, unit: true } },
        },
      });

      // 9. Auto-settle pending COGS backfill on stock-in
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
router.put('/:id', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const body = validateBody(UpdateStockMovementSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // 1. Load existing movement
      const oldMov = await tx.stockMovement.findUnique({
        where: { id },
        include: { item: true },
      });
      if (!oldMov) throw new BusinessError('Gerakan stok tidak ditemukan.');
      if (oldMov.isCancelled) throw new BusinessError('Gerakan stok sudah dibatalkan, tidak bisa diedit.');

      // Reject if movement is linked to ProductionRun
      if (oldMov.referenceType === 'ProductionRun') {
        throw new BusinessError('Gerakan stok dari proses produksi tidak dapat diedit secara langsung.');
      }

      // 2. Reverse old stock impact
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

      // 3. Reverse old GL entries if exist
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

      // 4. Apply new stock impact
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

      // 5. Create new GL entries if needed
      const newUnitCost = body.unitCost ?? 0;
      const newTotalValue = newQty * newUnitCost;
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

        const entryNumber = await generateDocumentNumber(tx, 'JV', movementDate, fiscalYear.id);

        const je = await tx.journalEntry.create({
          data: {
            entryNumber,
            date: movementDate,
            status: 'Submitted',
            submittedAt: new Date(),
            narration: `${typeLabels[body.movementType]}: ${itemAfterReversal.name} ${newQty} ${itemAfterReversal.unit}${body.notes ? ' - ' + body.notes : ''} (Edit)`,
            fiscalYearId: fiscalYear.id,
            createdBy: req.user!.userId,
            items: {
              create: [
                { accountId: debitAccountId, debit: newTotalValue, credit: 0 },
                { accountId: creditAccountId, debit: 0, credit: newTotalValue },
              ],
            },
          },
          include: { items: true },
        });

        await tx.accountingLedgerEntry.createMany({
          data: [
            { accountId: debitAccountId, date: movementDate, debit: newTotalValue, credit: 0, referenceType: 'JournalEntry', referenceId: je.id, fiscalYearId: fiscalYear.id },
            { accountId: creditAccountId, date: movementDate, debit: 0, credit: newTotalValue, referenceType: 'JournalEntry', referenceId: je.id, fiscalYearId: fiscalYear.id },
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

      // 6. Update the movement record
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

      return updated;
    }, { timeout: 15000 });

    return res.json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /inventory/movements/:id', 'Gagal mengupdate gerakan stok.');
  }
});

// PUT /api/inventory/movements/:id/cancel
router.put('/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  try {
    await prisma.$transaction(async (tx) => {
      const movement = await tx.stockMovement.findUnique({
        where: { id },
        include: { item: true },
      });
      if (!movement) throw new BusinessError('Gerakan stok tidak ditemukan.');
      if (movement.isCancelled) throw new BusinessError('Gerakan stok sudah dibatalkan.');

      const isIn = movement.movementType === 'In' || movement.movementType === 'AdjustmentIn';
      const isOut = movement.movementType === 'Out' || movement.movementType === 'AdjustmentOut';
      const qty = Number(movement.quantity);

      // Validate reversal won't cause negative stock
      if (isIn && Number(movement.item.currentStock) < qty) {
        throw new BusinessError('Tidak dapat membatalkan: stok tidak mencukupi untuk pembalikan.');
      }

      // Reverse stock
      const reverseDelta = isOut ? qty : -qty;
      await tx.inventoryItem.update({
        where: { id: movement.itemId },
        data: { currentStock: { increment: reverseDelta } },
      });

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
    }, { timeout: 15000 });

    return res.json({ message: 'Gerakan stok berhasil dibatalkan.' });
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /inventory/movements/:id/cancel', 'Gagal membatalkan gerakan stok.');
  }
});

export default router;
