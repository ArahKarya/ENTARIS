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
