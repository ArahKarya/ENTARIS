import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { AuthRequest, roleMiddleware } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { CreateInventoryItemSchema, UpdateInventoryItemSchema } from '../../utils/schemas';
import { BusinessError } from '../../utils/errors';
import { logger } from '../../lib/logger';

const router = Router();

// GET /api/inventory/items
// When `warehouseId` is provided, `currentStock` is overridden with the
// per-warehouse stock from inventory_stocks (0 if no row). Without the param,
// the response shows the global total denormalized on inventory_items.
router.get('/', async (req, res) => {
  try {
    const { page = '1', limit = '100', search, isActive, warehouseId } = req.query;
    const take = Math.min(Number(limit) || 100, 200);
    const skip = (Number(page) - 1) * take;

    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { code: { contains: search as string, mode: 'insensitive' } },
      ];
    }

    const [allItems, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        include: { account: { select: { id: true, name: true, accountNumber: true } } },
      }),
      prisma.inventoryItem.count({ where }),
    ]);

    let items = allItems;
    if (typeof warehouseId === 'string' && warehouseId.length > 0) {
      const stockRows = await prisma.inventoryStock.findMany({
        where: { warehouseId, itemId: { in: allItems.map((i) => i.id) } },
        select: { itemId: true, currentStock: true },
      });
      const stockByItem = new Map(stockRows.map((s) => [s.itemId, s.currentStock]));
      items = allItems.map((i) => ({
        ...i,
        currentStock: stockByItem.get(i.id) ?? 0,
      })) as typeof allItems;
    }

    // Sort by current stock quantity descending
    items.sort((a, b) => Number(b.currentStock) - Number(a.currentStock));

    const paged = items.slice(skip, skip + take);
    return res.json({ data: paged, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/items error');
    return res.status(500).json({ error: 'Gagal mengambil data item stok.' });
  }
});

// GET /api/inventory/items/:id/batches?warehouseId=X
// Returns the inbound stock movement batches for an item, with per-batch
// remaining availability for production input batch picker.
//
// Batch = a non-cancelled inbound StockMovement (In / AdjustmentIn).
//   qtyConsumedByProduction = SUM(production_run_items.quantity WHERE
//                              sourceMovementId = batch.id AND parent run not cancelled)
//   qtyAvailable = batch.quantity - qtyConsumedByProduction
//
// Caveat: other outbound (sales, transfer, material issue) is NOT yet batch-
// tracked (Phase 5 will extend tracking). So SUM(qtyAvailable across batches)
// may exceed currentStock for that item/warehouse — caller should compare with
// the returned `currentStock` and warn if mismatch is material.
router.get('/:id/batches', async (req, res) => {
  try {
    const itemId = req.params.id as string;
    const warehouseId = typeof req.query.warehouseId === 'string' && req.query.warehouseId.length > 0
      ? req.query.warehouseId
      : null;

    const item = await prisma.inventoryItem.findUnique({
      where: { id: itemId },
      select: { id: true, code: true, name: true, unit: true, currentStock: true },
    });
    if (!item) return res.status(404).json({ error: 'Item tidak ditemukan.' });

    let currentStock: number = Number(item.currentStock);
    if (warehouseId) {
      const stockRow = await prisma.inventoryStock.findFirst({
        where: { itemId, warehouseId },
        select: { currentStock: true },
      });
      currentStock = Number(stockRow?.currentStock ?? 0);
    }

    // 1. All inbound movements for this item/warehouse, non-cancelled.
    // TransferIn disertakan: stok yang dipindah antar-gudang membawa cost-nya
    // (unit_cost = WAC saat transfer) dan layak jadi batch yang bisa dipilih di
    // gudang tujuan — mis. PK/Glosor diproduksi di GILING lalu ditransfer ke
    // POLES untuk diproduksi lagi. Konsumsi & FIFO-absorb di bawah sudah
    // memperhitungkan TransferOut + currentStock per gudang, jadi aman.
    const inboundFilter: any = {
      itemId,
      isCancelled: false,
      movementType: { in: ['In', 'AdjustmentIn', 'TransferIn'] },
    };
    if (warehouseId) inboundFilter.warehouseId = warehouseId;

    const inbound = await prisma.stockMovement.findMany({
      where: inboundFilter,
      orderBy: { date: 'asc' },
      select: {
        id: true, movementNumber: true, date: true, quantity: true, unitCost: true,
        referenceType: true, referenceId: true, referenceNumber: true,
        warehouseId: true,
      },
    });

    if (inbound.length === 0) {
      return res.json({ data: [], item, currentStock });
    }

    // 2. Universal consumption: sum outbound stockMovements that link back to
    // each inbound batch via stock_movements.source_movement_id. This covers
    // production input, sales, transfer, and adjustment Out — anywhere the
    // submit service sets the back-link.
    const consumed = await prisma.stockMovement.groupBy({
      by: ['sourceMovementId'],
      where: {
        sourceMovementId: { in: inbound.map((m) => m.id) },
        isCancelled: false,
        movementType: { in: ['Out', 'AdjustmentOut', 'TransferOut'] },
      },
      _sum: { quantity: true },
    });
    const consumedMap = new Map<string, number>();
    for (const c of consumed) {
      if (c.sourceMovementId) {
        consumedMap.set(c.sourceMovementId, Number(c._sum.quantity ?? 0));
      }
    }

    // 3. Compose raw per-batch availability from EXPLICIT tracking only.
    const rawBatches = inbound.map((m) => {
      const qtyConsumedTracked = consumedMap.get(m.id) ?? 0;
      return {
        id: m.id,
        movementNumber: m.movementNumber,
        date: m.date,
        qtyInbound: Number(m.quantity),
        unitCost: Number(m.unitCost),
        qtyConsumedTracked,
        qtyAvailableTracked: Number(m.quantity) - qtyConsumedTracked,
        sourceType: m.referenceType ?? 'Other',
        sourceRef: m.referenceNumber ?? null,
        sourceRefId: m.referenceId ?? null,
      };
    });

    // 4. FIFO-absorb untracked outbound (legacy sales/transfers before batch
    // picker existed) so the picker never shows more than physically present.
    //
    // untrackedConsumption = max(0, sum(qtyAvailableTracked) - currentStock)
    // — the excess of explicit availability over actual warehouse stock is
    // the historical untracked consumption. Allocate it FIFO from the oldest
    // batches (rawBatches is already sorted asc by date) so the remaining
    // visible batches accurately reflect what's still on the floor.
    const totalAvailableTracked = rawBatches.reduce((s, b) => s + b.qtyAvailableTracked, 0);
    let untrackedRemaining = Math.max(0, totalAvailableTracked - currentStock);

    const batches = rawBatches
      .map((b) => {
        let qtyAvailable = b.qtyAvailableTracked;
        let qtyConsumedUntracked = 0;
        if (untrackedRemaining > 0 && qtyAvailable > 0) {
          const absorb = Math.min(qtyAvailable, untrackedRemaining);
          qtyAvailable -= absorb;
          qtyConsumedUntracked = absorb;
          untrackedRemaining -= absorb;
        }
        return {
          id: b.id,
          movementNumber: b.movementNumber,
          date: b.date,
          qtyInbound: b.qtyInbound,
          unitCost: b.unitCost,
          qtyConsumed: b.qtyConsumedTracked + qtyConsumedUntracked,
          qtyAvailable,
          sourceType: b.sourceType,
          sourceRef: b.sourceRef,
          sourceRefId: b.sourceRefId,
        };
      })
      .filter((b) => b.qtyAvailable > 0.001);

    return res.json({ data: batches, item, currentStock });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/items/:id/batches error');
    return res.status(500).json({ error: 'Gagal mengambil daftar batch stok.' });
  }
});

// POST /api/inventory/items
router.post('/', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateInventoryItemSchema, req.body, res);
  if (!body) return;

  try {
    const existing = await prisma.inventoryItem.findUnique({ where: { code: body.code } });
    if (existing) throw new BusinessError(`Kode item '${body.code}' sudah digunakan.`);

    const item = await prisma.inventoryItem.create({
      data: {
        code: body.code,
        name: body.name,
        unit: body.unit,
        category: body.category || null,
        description: body.description || null,
        minimumStock: body.minimumStock ?? 0,
        accountId: body.accountId || null,
      },
      include: { account: { select: { id: true, name: true, accountNumber: true } } },
    });
    return res.status(201).json(item);
  } catch (error: any) {
    if (error instanceof BusinessError) return res.status(400).json({ error: error.message });
    logger.error({ error }, 'POST /inventory/items error');
    return res.status(500).json({ error: 'Gagal membuat item stok.' });
  }
});

// PUT /api/inventory/items/:id
router.put('/:id', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const id = req.params.id as string;
  const body = validateBody(UpdateInventoryItemSchema, req.body, res);
  if (!body) return;

  try {
    const item = await prisma.inventoryItem.update({
      where: { id },
      data: {
        ...(body.code && { code: body.code }),
        ...(body.name && { name: body.name }),
        ...(body.unit && { unit: body.unit }),
        category: body.category ?? undefined,
        description: body.description ?? undefined,
        ...(body.minimumStock !== undefined && { minimumStock: body.minimumStock }),
        ...(body.accountId !== undefined && { accountId: body.accountId || null }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
      },
      include: { account: { select: { id: true, name: true, accountNumber: true } } },
    });
    return res.json(item);
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Item stok tidak ditemukan.' });
    if (error instanceof BusinessError) return res.status(400).json({ error: error.message });
    logger.error({ error }, 'PUT /inventory/items/:id error');
    return res.status(500).json({ error: 'Gagal mengupdate item stok.' });
  }
});

// DELETE /api/inventory/items/:id
router.delete('/:id', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;

    // Check if item has stock movements
    const movementCount = await prisma.stockMovement.count({
      where: { itemId: id, isCancelled: false },
    });
    if (movementCount > 0) {
      return res.status(400).json({
        error: `Item memiliki ${movementCount} mutasi stok aktif. Batalkan semua mutasi terlebih dahulu atau nonaktifkan item.`,
      });
    }

    // Check if item is used in purchase/sales invoice items
    const purchaseUsage = await prisma.purchaseInvoiceItem.count({ where: { inventoryItemId: id as string } });
    const salesUsage = await prisma.salesInvoiceItem.count({ where: { inventoryItemId: id as string } });
    if (purchaseUsage > 0 || salesUsage > 0) {
      return res.status(400).json({
        error: 'Item sudah digunakan di invoice. Nonaktifkan item jika tidak ingin dipakai lagi.',
      });
    }

    // Safe to delete — also remove cancelled movements
    await prisma.stockMovement.deleteMany({ where: { itemId: id as string } });
    await prisma.inventoryItem.delete({ where: { id: id as string } });

    return res.json({ message: 'Item stok berhasil dihapus.' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Item stok tidak ditemukan.' });
    logger.error({ error }, 'DELETE /inventory/items/:id error');
    return res.status(500).json({ error: 'Gagal menghapus item stok.' });
  }
});

export default router;
