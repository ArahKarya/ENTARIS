import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { BusinessError, handleRouteError } from '../utils/errors';
import { validateBody } from '../utils/validate';
import { buildStockSnapshot } from '../services/stockSnapshot';

const router = Router();

const CreateWarehouseSchema = z.object({
  code: z.string().min(1, 'Kode wajib diisi.').max(30).regex(/^[A-Za-z0-9_-]+$/, 'Kode hanya huruf, angka, dash, underscore.'),
  name: z.string().min(1, 'Nama wajib diisi.').max(100),
  location: z.string().max(200).nullable().optional(),
  description: z.string().max(500).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  isDefault: z.boolean().optional().default(false),
  sortOrder: z.coerce.number().int().optional().default(0),
});

const UpdateWarehouseSchema = CreateWarehouseSchema.partial();

// GET /api/warehouses
router.get('/', async (req, res) => {
  try {
    const { active } = req.query;
    const where: Prisma.WarehouseWhereInput = {};
    if (active === 'true') where.isActive = true;
    else if (active === 'false') where.isActive = false;

    const warehouses = await prisma.warehouse.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Attach total stock value & item count per warehouse
    const ids = warehouses.map((w) => w.id);
    const stockAgg = ids.length
      ? await prisma.inventoryStock.groupBy({
          by: ['warehouseId'],
          where: { warehouseId: { in: ids } },
          _count: { _all: true },
          _sum: { currentStock: true },
        })
      : [];
    const aggMap = new Map(stockAgg.map((a) => [a.warehouseId, a]));

    const data = warehouses.map((w) => {
      const agg = aggMap.get(w.id);
      return {
        ...w,
        itemCount: agg?._count._all ?? 0,
        totalStock: Number(agg?._sum.currentStock ?? 0),
      };
    });
    return res.json({ data });
  } catch (error) {
    return handleRouteError(res, error, 'GET /warehouses', 'Gagal mengambil daftar gudang.');
  }
});

// GET /api/warehouses/stock-snapshot?date=YYYY-MM-DD[&warehouseIds=a,b]
// Stok per gudang "as of" akhir tanggal tsb, direkonstruksi dari riwayat
// pergerakan stok. Dipakai untuk unduh stok terakhir per tanggal.
// NOTE: harus didefinisikan SEBELUM '/:id' agar tidak ketangkap route param.
router.get('/stock-snapshot', async (req, res) => {
  try {
    const { date, warehouseIds } = req.query;
    const dateStr = typeof date === 'string' && date ? date : new Date().toISOString().slice(0, 10);
    if (isNaN(new Date(dateStr).getTime())) {
      return res.status(400).json({ error: 'Parameter date tidak valid.' });
    }
    const ids = typeof warehouseIds === 'string' && warehouseIds
      ? warehouseIds.split(',').map((s) => s.trim()).filter(Boolean)
      : undefined;
    const snapshot = await buildStockSnapshot(dateStr, ids);
    return res.json(snapshot);
  } catch (error) {
    return handleRouteError(res, error, 'GET /warehouses/stock-snapshot', 'Gagal membuat snapshot stok.');
  }
});

// GET /api/warehouses/:id — detail with stock breakdown
router.get('/:id', async (req, res) => {
  try {
    const wh = await prisma.warehouse.findUnique({
      where: { id: req.params.id as string },
      include: {
        stocks: {
          where: { currentStock: { not: 0 } },
          include: { item: { select: { id: true, code: true, name: true, unit: true, averageCost: true } } },
          orderBy: { currentStock: 'desc' },
        },
      },
    });
    if (!wh) return res.status(404).json({ error: 'Gudang tidak ditemukan.' });
    return res.json(wh);
  } catch (error) {
    return handleRouteError(res, error, 'GET /warehouses/:id', 'Gagal mengambil detail gudang.');
  }
});

// POST /api/warehouses
router.post('/', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateWarehouseSchema, req.body, res);
  if (!body) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.warehouse.create({
        data: {
          code: body.code.toUpperCase(),
          name: body.name,
          location: body.location || null,
          description: body.description || null,
          isActive: body.isActive ?? true,
          isDefault: body.isDefault ?? false,
          sortOrder: body.sortOrder ?? 0,
        },
      });
    });
    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /warehouses', 'Gagal menyimpan gudang.');
  }
});

// PUT /api/warehouses/:id
router.put('/:id', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  const body = validateBody(UpdateWarehouseSchema, req.body, res);
  if (!body) return;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.warehouse.findUnique({ where: { id: req.params.id as string } });
      if (!existing) throw new BusinessError('Gudang tidak ditemukan.');
      if (body.isDefault === true && !existing.isDefault) {
        await tx.warehouse.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.warehouse.update({
        where: { id: existing.id },
        data: {
          code: body.code ? body.code.toUpperCase() : undefined,
          name: body.name,
          location: body.location !== undefined ? (body.location || null) : undefined,
          description: body.description !== undefined ? (body.description || null) : undefined,
          isActive: body.isActive,
          isDefault: body.isDefault,
          sortOrder: body.sortOrder,
        },
      });
    });
    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PUT /warehouses/:id', 'Gagal memperbarui gudang.');
  }
});

// DELETE /api/warehouses/:id — only if no stock & no movements
router.delete('/:id', roleMiddleware(['Admin']), async (req, res) => {
  try {
    const id = req.params.id as string;
    const wh = await prisma.warehouse.findUnique({ where: { id } });
    if (!wh) return res.status(404).json({ error: 'Gudang tidak ditemukan.' });
    if (wh.isDefault) return res.status(400).json({ error: 'Gudang default tidak bisa dihapus. Set gudang lain sebagai default dulu.' });

    const [stockCount, movementCount, transferCount] = await Promise.all([
      prisma.inventoryStock.count({ where: { warehouseId: id, currentStock: { not: 0 } } }),
      prisma.stockMovement.count({ where: { warehouseId: id } }),
      prisma.stockTransfer.count({ where: { OR: [{ fromWarehouseId: id }, { toWarehouseId: id }] } }),
    ]);
    if (stockCount > 0) {
      return res.status(400).json({ error: `Gudang masih punya ${stockCount} item dengan saldo. Pindahkan stok ke gudang lain dulu.` });
    }
    if (movementCount > 0 || transferCount > 0) {
      return res.status(400).json({
        error: 'Gudang punya riwayat transaksi. Nonaktifkan saja (jangan hapus) supaya riwayat tetap terbaca.',
      });
    }

    // Safe to hard-delete: clean zero-stock rows + the warehouse itself
    await prisma.$transaction(async (tx) => {
      await tx.inventoryStock.deleteMany({ where: { warehouseId: id } });
      await tx.warehouse.delete({ where: { id } });
    });
    return res.json({ success: true });
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /warehouses/:id', 'Gagal menghapus gudang.');
  }
});

export default router;
