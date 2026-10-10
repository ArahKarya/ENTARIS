import { Router } from 'express';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { clearable } from '../../utils/clearable';
import { CreateInventoryItemSchema, UpdateInventoryItemSchema } from '../../utils/schemas';
import { BusinessError, handleRouteError } from '../../utils/errors';
import { parseListPaging, parseSort } from '../../utils/listQuery';
import {
  DEFAULT_ITEM_SORT,
  ITEM_SORT_FIELDS,
  filterByStockStatus,
  itemDbWhere,
  itemStockStatus,
  parseItemListFilters,
  sortItems,
  summarizeItems,
  usesListMode,
} from '../../services/inventoryItemList';
import { logger } from '../../lib/logger';

const router = Router();

// Loads items matching the DB filter; with `warehouseId` the `currentStock`
// of each item is replaced by its stock in that warehouse (0 if no row).
async function loadItems(where: Record<string, unknown>, warehouseId: string | undefined) {
  const allItems = await prisma.inventoryItem.findMany({
    where,
    include: { account: { select: { id: true, name: true, accountNumber: true } } },
  });
  if (!warehouseId) return allItems;
  const stockRows = await prisma.inventoryStock.findMany({
    where: { warehouseId, itemId: { in: allItems.map((i) => i.id) } },
    select: { itemId: true, currentStock: true },
  });
  const stockByItem = new Map(stockRows.map((s) => [s.itemId, s.currentStock]));
  return allItems.map((i) => ({
    ...i,
    currentStock: stockByItem.get(i.id) ?? 0,
  })) as typeof allItems;
}

// GET /api/inventory/items: with `warehouseId`, currentStock is that warehouse's stock (0 if no row), else the global total.
// Sending sort/stockStatus/category switches to list-page mode (services/inventoryItemList); pickers rely on the default response.
router.get('/', async (req, res) => {
  try {
    const query = req.query as Record<string, unknown>;
    const parsed = parseItemListFilters(query);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { filters } = parsed;

    if (usesListMode(query)) {
      const { page, limit, skip } = parseListPaging(query, { defaultLimit: 100, maxLimit: 200 });
      const sort = parseSort(query.sort, ITEM_SORT_FIELDS, DEFAULT_ITEM_SORT);
      const loaded = await loadItems(itemDbWhere(filters), filters.warehouseId);
      const rows = sortItems(filterByStockStatus(loaded, filters.stockStatus), sort);
      const data = rows.slice(skip, skip + limit).map((i) => ({
        ...i,
        stockStatus: itemStockStatus(i.currentStock, i.minimumStock),
      }));
      return res.json({ data, total: rows.length, page, limit });
    }

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

    const [items, total] = await Promise.all([
      loadItems(where, typeof warehouseId === 'string' && warehouseId.length > 0 ? warehouseId : undefined),
      prisma.inventoryItem.count({ where }),
    ]);

    // Sort by current stock quantity descending
    items.sort((a, b) => Number(b.currentStock) - Number(a.currentStock));

    const paged = items.slice(skip, skip + take);
    return res.json({ data: paged, total, page: Number(page), limit: take });
  } catch (error) {
    logger.error({ error }, 'GET /inventory/items error');
    return res.status(500).json({ error: 'Gagal mengambil data item stok.' });
  }
});

// GET /api/inventory/items/summary — KPI totals for the same filters as the
// list (search, isActive, warehouseId, category, stockStatus). Same RBAC as
// the list (GET open to the inventory mount). Declared before /:id routes.
router.get('/summary', async (req, res) => {
  try {
    const parsed = parseItemListFilters(req.query as Record<string, unknown>);
    if (!parsed.ok) return res.status(400).json({ error: parsed.error });
    const { filters } = parsed;
    const [loaded, categoryRows] = await Promise.all([
      loadItems(itemDbWhere(filters), filters.warehouseId),
      prisma.inventoryItem.findMany({ distinct: ['category'], select: { category: true } }),
    ]);
    const rows = filterByStockStatus(loaded, filters.stockStatus);
    return res.json(summarizeItems(rows, categoryRows.map((r) => r.category)));
  } catch (error) {
    return handleRouteError(res, error, 'GET /inventory/items/summary', 'Gagal menghitung ringkasan item stok.');
  }
});

// GET /api/inventory/items/:id/batches?warehouseId=X: inbound batches (non-cancelled inbound movements) with remaining qty
// for the production batch picker. Callers should compare the batch total with the returned `currentStock`.
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

    // TransferIn counts as a batch: it carries the WAC at transfer time, so goods moved between warehouses stay pickable.
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

    // Consumption = outbound movements linked back to the batch via source_movement_id (any submit service that sets it).
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

    // Availability from explicit tracking only.
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

    // Untracked outbound = max(0, tracked availability - currentStock), absorbed FIFO from the oldest batches
    // (rawBatches is sorted by date asc) so the picker never shows more than is physically present.
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
router.post('/', async (req: AuthRequest, res) => {
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
router.put('/:id', async (req: AuthRequest, res) => {
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
        category: clearable(body.category),
        description: clearable(body.description),
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
router.delete('/:id', async (req: AuthRequest, res) => {
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

    return res.json({ message: 'Item stok dihapus.' });
  } catch (error: any) {
    if (error.code === 'P2025') return res.status(404).json({ error: 'Item stok tidak ditemukan.' });
    logger.error({ error }, 'DELETE /inventory/items/:id error');
    return res.status(500).json({ error: 'Gagal menghapus item stok.' });
  }
});

export default router;
