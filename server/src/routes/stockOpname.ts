import { Router } from 'express';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { validateBody } from '../utils/validate';
import { CreateStockOpnameSchema, SubmitStockOpnameSchema } from '../utils/schemas';
import { BusinessError, handleRouteError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import { updateAccountBalance, recalculateAccountBalances } from '../utils/accountBalance';
import { cancelJournalsByPrefix } from '../utils/journalCancel';
import { systemAccounts } from '../services/systemAccounts';
import { logger } from '../lib/logger';
import { resolveWarehouseId, adjustWarehouseStock } from '../utils/warehouseStock';

const router = Router();

// GET /api/stock-opname — List all sessions
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '20', status } = req.query;
    const take = Math.min(Number(limit) || 20, 100);
    const skip = (Number(page) - 1) * take;

    const where: any = {};
    if (status && typeof status === 'string') {
      where.status = status;
    }

    const [data, total] = await Promise.all([
      prisma.stockOpname.findMany({
        where,
        include: {
          createdBy: { select: { fullName: true } },
          _count: { select: { items: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.stockOpname.count({ where }),
    ]);

    // Compute summary per session
    const result = await Promise.all(
      data.map(async (so) => {
        const items = await prisma.stockOpnameItem.findMany({
          where: { stockOpnameId: so.id },
          select: { difference: true, totalValue: true },
        });
        const totalVariance = items.reduce((s, i) => s + Math.abs(Number(i.totalValue)), 0);
        const itemsWithDiff = items.filter((i) => Number(i.difference) !== 0).length;
        return { ...so, totalVariance, itemsWithDiff };
      })
    );

    return res.json({ data: result, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /stock-opname error');
    return res.status(500).json({ error: 'Gagal mengambil data stok opname.' });
  }
});

// GET /api/stock-opname/:id — Get detail
router.get('/:id', async (req, res) => {
  try {
    const so = await prisma.stockOpname.findUnique({
      where: { id: req.params.id as string },
      include: {
        createdBy: { select: { fullName: true } },
        items: {
          include: {
            item: { select: { id: true, name: true, code: true, unit: true, currentStock: true, averageCost: true } },
          },
          orderBy: { item: { code: 'asc' } },
        },
      },
    });
    if (!so) return res.status(404).json({ error: 'Stok opname tidak ditemukan.' });
    return res.json(so);
  } catch (error) {
    logger.error({ error }, 'GET /stock-opname/:id error');
    return res.status(500).json({ error: 'Gagal mengambil detail stok opname.' });
  }
});

// POST /api/stock-opname — Create and submit in one step
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateStockOpnameSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const txDate = new Date(body.date);
      const fiscalYear = await tx.fiscalYear.findFirst({
        where: { isClosed: false, startDate: { lte: txDate }, endDate: { gte: txDate } },
      });
      if (!fiscalYear) throw new BusinessError('Tidak ada tahun fiskal aktif untuk tanggal ini.');

      // Check no other Draft exists
      const existingDraft = await tx.stockOpname.findFirst({ where: { status: 'Draft' as any } });
      if (existingDraft) throw new BusinessError('Masih ada stok opname Draft yang belum selesai.');

      const opnameNumber = await generateDocumentNumber(tx, 'SO', txDate, fiscalYear.id);

      // Fetch all items for averageCost + name. systemStock source depends
      // on whether the user picked a warehouse — when set, compare against
      // the per-warehouse balance from inventory_stocks so opname only
      // affects that warehouse. When not set, fall back to the global total.
      const allItemIds = body.items.map((i: any) => i.itemId);
      const allItems = await tx.inventoryItem.findMany({
        where: { id: { in: allItemIds } },
        select: { id: true, name: true, currentStock: true, averageCost: true, accountId: true },
      });
      const itemMap = new Map(allItems.map((i) => [i.id, i]));

      for (const input of body.items) {
        if (!itemMap.has(input.itemId)) {
          throw new BusinessError(`Item dengan ID ${input.itemId} tidak ditemukan.`);
        }
      }

      // Pre-fetch per-warehouse stock when scoped to a specific warehouse.
      const perWarehouseStock = new Map<string, number>();
      if (body.warehouseId) {
        const rows = await tx.inventoryStock.findMany({
          where: { warehouseId: body.warehouseId, itemId: { in: allItemIds } },
          select: { itemId: true, currentStock: true },
        });
        for (const r of rows) perWarehouseStock.set(r.itemId, Number(r.currentStock));
      }

      // Build opname items with difference calculation
      const opnameItems = body.items.map((input: any) => {
        const item = itemMap.get(input.itemId)!;
        const systemStock = body.warehouseId
          ? (perWarehouseStock.get(input.itemId) ?? 0)
          : Number(item.currentStock);
        const actualStock = input.actualStock;
        const diff = new Decimal(actualStock).minus(new Decimal(systemStock)).toDecimalPlaces(3).toNumber();
        const unitCost = Number(item.averageCost);
        const totalValue = new Decimal(Math.abs(diff)).mul(new Decimal(unitCost)).toDecimalPlaces(2).toNumber();

        return {
          itemId: input.itemId,
          systemStock,
          actualStock,
          difference: diff,
          unitCost,
          totalValue,
          notes: input.notes || null,
        };
      });

      // Filter items with actual difference
      const itemsWithDiff = opnameItems.filter((i: any) => i.difference !== 0);

      // Create the StockOpname record
      const so = await tx.stockOpname.create({
        data: {
          opnameNumber,
          date: txDate,
          status: 'Submitted' as any,
          notes: body.notes || null,
          fiscalYearId: fiscalYear.id,
          createdById: req.user!.userId,
          submittedAt: new Date(),
          items: { create: opnameItems },
        },
      });

      // Process adjustments for items with difference
      if (itemsWithDiff.length > 0) {
        const defaultInvAccount = await systemAccounts.getAccount('INVENTORY');
        const varianceAccount = await systemAccounts.getAccount('INVENTORY_VARIANCE');
        // Stock opname applies to one warehouse per session. Prefer the
        // explicit pick from the UI; fall back to default warehouse if set;
        // otherwise force the user to pick. (Multi-warehouse opname → run a
        // separate session per warehouse.)
        const opnameWarehouseId = await resolveWarehouseId(tx, body.warehouseId);
        if (!opnameWarehouseId) {
          throw new BusinessError(
            'Gudang opname wajib dipilih. Pilih gudang di form atau set salah satu gudang sebagai default.',
          );
        }

        const journalItems: { accountId: string; debit: number; credit: number; description: string }[] = [];
        const movementIds: { itemId: string; movementId: string }[] = [];

        for (const opItem of itemsWithDiff) {
          const item = itemMap.get(opItem.itemId)!;
          const absDiff = Math.abs(opItem.difference);
          const isIncrease = opItem.difference > 0;
          const movementType = isIncrease ? 'AdjustmentIn' : 'AdjustmentOut';

          // Create stock movement
          const movNumber = await generateDocumentNumber(tx, 'SM', txDate, fiscalYear.id);
          const movement = await tx.stockMovement.create({
            data: {
              movementNumber: movNumber,
              date: txDate,
              itemId: opItem.itemId,
              warehouseId: opnameWarehouseId,
              movementType,
              quantity: absDiff,
              unitCost: opItem.unitCost,
              totalValue: opItem.totalValue,
              referenceType: 'StockOpname',
              referenceId: so.id,
              referenceNumber: opnameNumber,
              offsetAccountId: varianceAccount.id,
              notes: `Stok opname ${opnameNumber}: ${item.name}`,
              fiscalYearId: fiscalYear.id,
              createdById: req.user!.userId,
            },
          });

          movementIds.push({ itemId: opItem.itemId, movementId: movement.id });

          // Update inventory stock (item-level total + per-warehouse)
          await tx.inventoryItem.update({
            where: { id: opItem.itemId },
            data: { currentStock: { increment: opItem.difference } },
          });
          await adjustWarehouseStock(tx, opItem.itemId, opnameWarehouseId, opItem.difference);

          // Build GL entries
          const invAcctId = item.accountId || defaultInvAccount.id;
          if (isIncrease) {
            // Surplus: DR Inventory / CR Selisih Persediaan
            journalItems.push(
              { accountId: invAcctId, debit: opItem.totalValue, credit: 0, description: `Surplus stok ${item.name}: ${opnameNumber}` },
              { accountId: varianceAccount.id, debit: 0, credit: opItem.totalValue, description: `Surplus stok ${item.name}: ${opnameNumber}` },
            );
          } else {
            // Deficit: DR Selisih Persediaan / CR Inventory
            journalItems.push(
              { accountId: varianceAccount.id, debit: opItem.totalValue, credit: 0, description: `Defisit stok ${item.name}: ${opnameNumber}` },
              { accountId: invAcctId, debit: 0, credit: opItem.totalValue, description: `Defisit stok ${item.name}: ${opnameNumber}` },
            );
          }
        }

        // Create journal entry
        if (journalItems.length > 0) {
          const jvNumber = `JV-${opnameNumber}`;
          const journal = await tx.journalEntry.create({
            data: {
              entryNumber: jvNumber,
              date: txDate,
              narration: `Penyesuaian stok opname: ${opnameNumber}`,
              status: 'Submitted',
              fiscalYearId: fiscalYear.id,
              createdBy: req.user!.userId,
              submittedAt: new Date(),
              items: { create: journalItems },
            },
          });

          await tx.accountingLedgerEntry.createMany({
            data: journalItems.map((ji) => ({
              date: txDate,
              accountId: ji.accountId,
              debit: ji.debit,
              credit: ji.credit,
              referenceType: 'JournalEntry',
              referenceId: journal.id,
              description: ji.description,
              fiscalYearId: fiscalYear.id,
            })),
          });

          // Recalculate balances from JE sums for affected accounts (prevents drift)
          const affectedAccountIds = [...new Set(journalItems.map(ji => ji.accountId))];
          await recalculateAccountBalances(tx, affectedAccountIds);
        }

        // Update movementId on opname items
        for (const { itemId, movementId } of movementIds) {
          await tx.stockOpnameItem.updateMany({
            where: { stockOpnameId: so.id, itemId },
            data: { movementId },
          });
        }
      }

      return tx.stockOpname.findUnique({
        where: { id: so.id },
        include: {
          createdBy: { select: { fullName: true } },
          items: {
            include: { item: { select: { id: true, name: true, code: true, unit: true } } },
            orderBy: { item: { code: 'asc' } },
          },
        },
      });
    }, { timeout: 30000 });

    return res.status(201).json(result);
  } catch (error: any) {
    return handleRouteError(res, error, 'POST /stock-opname', 'Gagal membuat stok opname.');
  }
});

// PUT /api/stock-opname/:id/cancel — Cancel and reverse all adjustments
router.put('/:id/cancel', roleMiddleware(['Admin']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;

  try {
    await prisma.$transaction(async (tx) => {
      const so = await tx.stockOpname.findUnique({
        where: { id },
        include: { items: { include: { item: true } } },
      }) as any;
      if (!so) throw new BusinessError('Stok opname tidak ditemukan.');
      if (so.status === 'Cancelled') throw new BusinessError('Stok opname sudah dibatalkan.');
      if (so.status === 'Draft') throw new BusinessError('Stok opname Draft tidak perlu dibatalkan.');

      // Reverse stock movements
      const itemsWithMovement = so.items.filter((i: any) => i.movementId);
      for (const opItem of itemsWithMovement) {
        const diff = Number(opItem.difference);
        if (diff === 0) continue;

        // Check stock sufficiency for surplus reversal (reducing stock)
        if (diff > 0 && Number(opItem.item.currentStock) < diff) {
          throw new BusinessError(
            `Tidak dapat membatalkan: stok '${opItem.item.name}' tidak mencukupi untuk pembalikan.`
          );
        }

        // Reverse stock (item-level total + per-warehouse from the original movement)
        await tx.inventoryItem.update({
          where: { id: opItem.itemId },
          data: { currentStock: { increment: -diff } },
        });
        if (opItem.movementId) {
          const mov = await tx.stockMovement.findUnique({
            where: { id: opItem.movementId },
            select: { warehouseId: true },
          });
          await adjustWarehouseStock(tx, opItem.itemId, mov?.warehouseId ?? null, -diff);
          await tx.stockMovement.update({
            where: { id: opItem.movementId },
            data: { isCancelled: true },
          });
        }
      }

      // Cancel ALL related journals + ledger entries (including any revisions)
      const jvNumber = `JV-${so.opnameNumber}`;

      // Collect affected account IDs BEFORE cancelling
      const relatedJEItems = await tx.journalItem.findMany({
        where: {
          journalEntry: { entryNumber: { startsWith: jvNumber }, status: { not: 'Cancelled' } },
        },
        select: { accountId: true },
      });
      const cancelAffectedAccountIds = [...new Set(relatedJEItems.map(ji => ji.accountId))];

      await cancelJournalsByPrefix(tx, jvNumber);

      // Recalculate balances from JE sums (prevents drift)
      if (cancelAffectedAccountIds.length > 0) {
        await recalculateAccountBalances(tx, cancelAffectedAccountIds);
      }

      await tx.stockOpname.update({
        where: { id },
        data: { status: 'Cancelled' as any, cancelledAt: new Date() },
      });
    }, { timeout: 15000 });

    return res.json({ message: 'Stok opname berhasil dibatalkan.' });
  } catch (error: any) {
    return handleRouteError(res, error, 'PUT /stock-opname/:id/cancel', 'Gagal membatalkan stok opname.');
  }
});

export default router;
