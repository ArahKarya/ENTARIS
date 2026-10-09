// GA's own sparepart/consumable stock, separate from the accounting inventory: no journals or account balances.
// Mounted with requirePerm('ga_inventory') in index.ts. Every movement updates per-location stock atomically in a transaction.

import { Router, type Response } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { z } from 'zod';
import multer from 'multer';
import crypto from 'crypto';
import path from 'path';
import { promises as fs } from 'fs';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';
import { parseListPaging, parseSort } from '../../utils/listQuery';
import {
  buildGaItemFilter,
  buildGaMovementWhere,
  DEFAULT_GA_ITEM_SORT,
  DEFAULT_GA_MOVEMENT_SORT,
  filterGaItems,
  GA_ITEM_SORT_FIELDS,
  GA_MOVEMENT_SORT_FIELDS,
  gaMovementOrderBy,
  sortGaItems,
  summarizeGaItems,
  toGaItemRow,
  type GaItemFilter,
} from '../../services/gaInventoryList';

const router = Router();

// Gambar item (1 foto per item, disimpan di uploads/ga/items)
const UPLOADS_DIR = path.resolve(process.env.UPLOADS_DIR || './uploads');
const ITEM_IMAGES_DIR = path.join(UPLOADS_DIR, 'ga', 'items');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    cb(null, allowed.includes(file.mimetype));
  },
});


// Schemas (inline: GA-specific, kept out of shared schemas.ts)
const InventoryItemSchema = z.object({
  sku: z.string().min(1).max(100),
  name: z.string().min(1).max(200),
  categoryId: z.string().min(1),
  uom: z.string().min(1).max(20),
  minStock: z.number().nonnegative().default(0),
  isActive: z.boolean().default(true),
});

const MovementSchema = z.object({
  itemId: z.string().min(1),
  type: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT']),
  quantity: z.number().positive('Qty harus lebih dari 0.'),
  fromLocationId: z.string().optional().nullable(),
  toLocationId: z.string().optional().nullable(),
  referenceNo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// Sum per-location quantities of an item into a single Decimal total.
function sumStock(stocks: { quantity: Prisma.Decimal }[]): Decimal {
  return stocks.reduce(
    (sum, s) => sum.plus(new Decimal(s.quantity.toString())),
    new Decimal(0),
  );
}

// Items
// GET /api/ga/inventory/items: by default an array ordered by SKU (limit <= 500; pickers and AIRA tools depend on it);
// `paginated=1` returns `{ data, total, page, limit }`, with `locationStock` when locationId is set. Invalid filters -> 400.
router.get('/items', async (req: AuthRequest, res) => {
  try {
    if (req.query.paginated === '1') return await listItemsPaged(req.query as Record<string, unknown>, res);

    const where: Prisma.GaInventoryItemWhereInput = {};
    if (req.query.categoryId) where.categoryId = String(req.query.categoryId);
    if (req.query.q) {
      const q = String(req.query.q);
      where.OR = [
        { sku: { contains: q, mode: 'insensitive' } },
        { name: { contains: q, mode: 'insensitive' } },
      ];
    }

    const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? '200'), 10) || 200, 1), 500);
    const page = Math.max(parseInt(String(req.query.page ?? '1'), 10) || 1, 1);
    const skip = (page - 1) * limit;

    const items = await prisma.gaInventoryItem.findMany({
      where,
      orderBy: { sku: 'asc' },
      skip,
      take: limit,
      include: {
        category: { select: { code: true, name: true, type: true } },
        stocks: { select: { quantity: true } },
      },
    });

    const enriched = items.map((it) => {
      const totalStock = sumStock(it.stocks);
      const minStock = new Decimal(it.minStock.toString());
      return {
        id: it.id,
        sku: it.sku,
        name: it.name,
        uom: it.uom,
        minStock: minStock.toNumber(),
        imagePath: it.imagePath,
        isActive: it.isActive,
        category: it.category,
        totalStock: totalStock.toNumber(),
        lowStock: totalStock.lessThan(minStock),
      };
    });

    return res.json(enriched);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/inventory/items', 'Gagal mengambil data item.');
  }
});

/** Every item matching the filter, with totals + stock state (see services/gaInventoryList). */
async function loadFilteredItems(filter: GaItemFilter) {
  const items = await prisma.gaInventoryItem.findMany({
    where: filter.where,
    orderBy: { sku: 'asc' },
    include: {
      category: { select: { code: true, name: true, type: true } },
      stocks: { select: { quantity: true, locationId: true } },
    },
  });
  return filterGaItems(
    items.map((it) => toGaItemRow(it, filter.locationId)),
    filter.stockStatus,
  );
}

async function listItemsPaged(query: Record<string, unknown>, res: Response) {
  const filter = buildGaItemFilter(query);
  if (!filter.ok) return res.status(400).json({ error: filter.error });
  const { page, limit, skip } = parseListPaging(query, { defaultLimit: 200, maxLimit: 500 });
  const sort = parseSort(query.sort, GA_ITEM_SORT_FIELDS, DEFAULT_GA_ITEM_SORT);
  const rows = sortGaItems(await loadFilteredItems(filter), sort);
  return res.json({ data: rows.slice(skip, skip + limit).map((r) => r.row), total: rows.length, page, limit });
}

// GET /api/ga/inventory/items/summary — KPI counts for the same filters as the
// paged list (`paginated=1`). Declared before '/items/:id'.
router.get('/items/summary', async (req, res) => {
  try {
    const filter = buildGaItemFilter(req.query as Record<string, unknown>);
    if (!filter.ok) return res.status(400).json({ error: filter.error });
    return res.json(summarizeGaItems(await loadFilteredItems(filter)));
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/inventory/items/summary', 'Gagal menghitung ringkasan item.');
  }
});

// GET /api/ga/inventory/items/:id — detail with per-location stock.
router.get('/items/:id', async (req, res) => {
  try {
    const item = await prisma.gaInventoryItem.findUnique({
      where: { id: String(req.params.id) },
      include: {
        category: true,
        stocks: {
          include: { location: { select: { id: true, code: true, name: true } } },
        },
      },
    });
    if (!item) return res.status(404).json({ error: 'Item tidak ditemukan.' });

    return res.json({
      ...item,
      minStock: new Decimal(item.minStock.toString()).toNumber(),
      stocks: item.stocks.map((s) => ({
        ...s,
        quantity: new Decimal(s.quantity.toString()).toNumber(),
      })),
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/inventory/items/:id', 'Gagal mengambil detail item.');
  }
});

// POST /api/ga/inventory/items — create item.
router.post('/items', async (req: AuthRequest, res) => {
  const input = validateBody(InventoryItemSchema, req.body, res);
  if (!input) return;
  try {
    const created = await prisma.gaInventoryItem.create({ data: input });
    return res.status(201).json({ id: created.id });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/inventory/items', 'Gagal membuat item.');
  }
});

// PUT /api/ga/inventory/items/:id — update item (partial).
router.put('/items/:id', async (req: AuthRequest, res) => {
  const input = validateBody(InventoryItemSchema.partial(), req.body, res);
  if (!input) return;
  try {
    const updated = await prisma.gaInventoryItem.update({
      where: { id: String(req.params.id) },
      data: input,
    });
    return res.json({ id: updated.id });
  } catch (error) {
    return handleRouteError(res, error, 'PUT /ga/inventory/items/:id', 'Gagal update item.');
  }
});

// POST /api/ga/inventory/items/:id/image — upload/ganti gambar item.
router.post('/items/:id/image', upload.single('image'), async (req: AuthRequest, res) => {
  if (!req.file) return res.status(400).json({ error: 'File gambar wajib diupload (JPG/PNG/WEBP, maks 5 MB).' });
  try {
    const item = await prisma.gaInventoryItem.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, imagePath: true },
    });
    if (!item) return res.status(404).json({ error: 'Item tidak ditemukan.' });

    await fs.mkdir(ITEM_IMAGES_DIR, { recursive: true });
    const ext = req.file.mimetype === 'image/png' ? '.png' : req.file.mimetype === 'image/webp' ? '.webp' : '.jpg';
    const name = `${crypto.randomUUID()}${ext}`;
    await fs.writeFile(path.join(ITEM_IMAGES_DIR, name), req.file.buffer);

    // Hapus file lama supaya tidak menumpuk.
    if (item.imagePath) {
      await fs.unlink(path.join(UPLOADS_DIR, item.imagePath)).catch(() => undefined);
    }

    const imagePath = path.join('ga', 'items', name);
    await prisma.gaInventoryItem.update({
      where: { id: item.id },
      data: { imagePath },
    });
    return res.status(201).json({ id: item.id, imagePath });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/inventory/items/:id/image', 'Gagal upload gambar item.');
  }
});

// GET /api/ga/inventory/items/:id/image — serve file gambar item.
router.get('/items/:id/image', async (req, res) => {
  try {
    const item = await prisma.gaInventoryItem.findUnique({
      where: { id: String(req.params.id) },
      select: { imagePath: true },
    });
    if (!item?.imagePath) return res.status(404).json({ error: 'Gambar tidak ditemukan.' });

    // Path-traversal guard: file hasil resolve wajib tetap di dalam UPLOADS_DIR.
    const full = path.normalize(path.join(UPLOADS_DIR, item.imagePath));
    if (!full.startsWith(UPLOADS_DIR + path.sep)) {
      return res.status(400).json({ error: 'Path file tidak valid.' });
    }

    const ext = path.extname(full).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.sendFile(full);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/inventory/items/:id/image', 'Gagal mengambil gambar item.');
  }
});

// DELETE /api/ga/inventory/items/:id/image — hapus gambar item.
router.delete('/items/:id/image', async (req: AuthRequest, res) => {
  try {
    const item = await prisma.gaInventoryItem.findUnique({
      where: { id: String(req.params.id) },
      select: { id: true, imagePath: true },
    });
    if (!item) return res.status(404).json({ error: 'Item tidak ditemukan.' });
    if (item.imagePath) {
      await fs.unlink(path.join(UPLOADS_DIR, item.imagePath)).catch(() => undefined);
      await prisma.gaInventoryItem.update({ where: { id: item.id }, data: { imagePath: null } });
    }
    return res.status(204).end();
  } catch (error) {
    return handleRouteError(res, error, 'DELETE /ga/inventory/items/:id/image', 'Gagal menghapus gambar item.');
  }
});

// Movements
// GET /api/ga/inventory/movements: without `page` the latest 100 as an array (AIRA gi_movements);
// with `page` returns `{ data, total, page, limit }` (limit <= 200, business time zone dates). Invalid filters -> 400.
router.get('/movements', async (req: AuthRequest, res) => {
  try {
    if (req.query.page !== undefined) return await listMovementsPaged(req.query as Record<string, unknown>, res);
    const where: Prisma.GaInventoryMovementWhereInput = {};
    if (req.query.itemId) where.itemId = String(req.query.itemId);
    if (req.query.type) {
      where.type = String(req.query.type) as Prisma.GaInventoryMovementWhereInput['type'];
    }

    const movements = await prisma.gaInventoryMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        item: { select: { sku: true, name: true, uom: true } },
        fromLocation: { select: { code: true, name: true } },
        toLocation: { select: { code: true, name: true } },
      },
    });
    return res.json(
      movements.map((m) => ({ ...m, quantity: new Decimal(m.quantity.toString()).toNumber() })),
    );
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/inventory/movements', 'Gagal mengambil data movement.');
  }
});

const MOVEMENT_LIST_INCLUDE = {
  item: { select: { sku: true, name: true, uom: true } },
  fromLocation: { select: { code: true, name: true } },
  toLocation: { select: { code: true, name: true } },
} satisfies Prisma.GaInventoryMovementInclude;

async function listMovementsPaged(query: Record<string, unknown>, res: Response) {
  const filter = buildGaMovementWhere(query);
  if (!filter.ok) return res.status(400).json({ error: filter.error });
  const { page, limit, skip } = parseListPaging(query, { defaultLimit: 25, maxLimit: 200 });
  const sort = parseSort(query.sort, GA_MOVEMENT_SORT_FIELDS, DEFAULT_GA_MOVEMENT_SORT);
  const [rows, total] = await prisma.$transaction([
    prisma.gaInventoryMovement.findMany({
      where: filter.where,
      orderBy: gaMovementOrderBy(sort),
      skip,
      take: limit,
      include: MOVEMENT_LIST_INCLUDE,
    }),
    prisma.gaInventoryMovement.count({ where: filter.where }),
  ]);
  const data = rows.map((m) => ({ ...m, quantity: new Decimal(m.quantity.toString()).toNumber() }));
  return res.json({ data, total, page, limit });
}

// POST /api/ga/inventory/movements: IN adds to toLocation, OUT takes from fromLocation (never below zero),
// TRANSFER does both, ADJUSTMENT applies a delta to toLocation.
router.post('/movements', async (req: AuthRequest, res) => {
  const input = validateBody(MovementSchema, req.body, res);
  if (!input) return;

  if (input.type === 'IN' && !input.toLocationId) {
    return res.status(400).json({ error: 'IN butuh toLocation.' });
  }
  if (input.type === 'OUT' && !input.fromLocationId) {
    return res.status(400).json({ error: 'OUT butuh fromLocation.' });
  }
  if (input.type === 'TRANSFER' && (!input.fromLocationId || !input.toLocationId)) {
    return res.status(400).json({ error: 'TRANSFER butuh fromLocation dan toLocation.' });
  }
  if (input.type === 'ADJUSTMENT' && !input.toLocationId) {
    return res.status(400).json({ error: 'ADJUSTMENT butuh toLocation.' });
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const qty = new Decimal(input.quantity);

      // Upsert per-location stock by a signed delta; guard against negative.
      const applyStock = async (locationId: string, delta: Decimal) => {
        const existing = await tx.gaStockByLocation.findUnique({
          where: { itemId_locationId: { itemId: input.itemId, locationId } },
        });
        if (existing) {
          const next = new Decimal(existing.quantity.toString()).plus(delta);
          if (next.lessThan(0)) throw new Error('Stok tidak mencukupi.');
          await tx.gaStockByLocation.update({
            where: { id: existing.id },
            data: { quantity: next.toString() },
          });
        } else {
          if (delta.lessThan(0)) throw new Error('Stok tidak mencukupi.');
          await tx.gaStockByLocation.create({
            data: { itemId: input.itemId, locationId, quantity: delta.toString() },
          });
        }
      };

      if (input.type === 'IN' && input.toLocationId) {
        await applyStock(input.toLocationId, qty);
      } else if (input.type === 'OUT' && input.fromLocationId) {
        await applyStock(input.fromLocationId, qty.negated());
      } else if (input.type === 'TRANSFER' && input.fromLocationId && input.toLocationId) {
        await applyStock(input.fromLocationId, qty.negated());
        await applyStock(input.toLocationId, qty);
      } else if (input.type === 'ADJUSTMENT' && input.toLocationId) {
        await applyStock(input.toLocationId, qty);
      }

      return tx.gaInventoryMovement.create({
        data: {
          itemId: input.itemId,
          type: input.type,
          quantity: qty.toString(),
          fromLocationId: input.fromLocationId || null,
          toLocationId: input.toLocationId || null,
          referenceNo: input.referenceNo || null,
          notes: input.notes || null,
          createdBy: req.user!.userId,
        },
      });
    });

    // Post-movement: low-stock log hook (notifications are out of scope here).
    try {
      const item = await prisma.gaInventoryItem.findUnique({
        where: { id: input.itemId },
        include: { stocks: { select: { quantity: true } } },
      });
      if (item) {
        const totalStock = sumStock(item.stocks);
        const minStock = new Decimal(item.minStock.toString());
        if (minStock.greaterThan(0) && totalStock.lessThanOrEqualTo(minStock)) {
          logger.warn(
            { itemId: item.id, sku: item.sku, totalStock: totalStock.toString(), minStock: minStock.toString() },
            'GA inventory stock at/below minimum',
          );
        }
      }
    } catch (hookErr) {
      logger.warn({ err: hookErr }, 'GA stock-low hook failed');
    }

    return res.status(201).json({ id: result.id });
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/inventory/movements', 'Gagal mencatat movement.');
  }
});

// Low stock report
// GET /api/ga/inventory/low-stock — active items below their minStock.
router.get('/low-stock', async (_req, res) => {
  try {
    const items = await prisma.gaInventoryItem.findMany({
      where: { isActive: true },
      include: {
        category: { select: { name: true, type: true } },
        stocks: { select: { quantity: true } },
      },
    });

    const low = items
      .map((it) => {
        const totalStock = sumStock(it.stocks);
        const minStock = new Decimal(it.minStock.toString());
        return {
          id: it.id,
          sku: it.sku,
          name: it.name,
          uom: it.uom,
          category: it.category.name,
          type: it.category.type,
          totalStock: totalStock.toNumber(),
          minStock: minStock.toNumber(),
          shortfall: minStock.minus(totalStock).toNumber(),
        };
      })
      .filter((it) => it.shortfall > 0)
      .sort((a, b) => b.shortfall - a.shortfall);

    return res.json(low);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/inventory/low-stock', 'Gagal mengambil laporan stok rendah.');
  }
});

// Dashboard
// GET /api/ga/inventory/dashboard — ringkasan stok untuk kartu & grafik.
//   Semua angka dihitung on-the-fly dari GaStockByLocation & GaInventoryMovement
//   (tidak ada kolom cache), jadi selalu konsisten dengan mutasi.
router.get('/dashboard', async (_req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const [items, locations, movements30, recent] = await Promise.all([
      prisma.gaInventoryItem.findMany({
        include: {
          category: { select: { id: true, code: true, name: true, type: true } },
          stocks: { select: { quantity: true, locationId: true } },
        },
      }),
      prisma.gaLocation.findMany({
        orderBy: { code: 'asc' },
        select: { id: true, code: true, name: true },
      }),
      prisma.gaInventoryMovement.findMany({
        where: { createdAt: { gte: since } },
        select: { type: true, quantity: true, itemId: true },
      }),
      prisma.gaInventoryMovement.findMany({
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          item: { select: { sku: true, name: true, uom: true } },
          fromLocation: { select: { code: true } },
          toLocation: { select: { code: true } },
        },
      }),
    ]);

    let totalQty = new Decimal(0);
    let lowStock = 0;
    let outOfStock = 0;
    let activeItems = 0;

    const byCategory = new Map<string, { name: string; type: string; items: number; qty: Decimal }>();
    const byLocation = new Map<string, { code: string; name: string; items: number; qty: Decimal }>();
    for (const loc of locations) {
      byLocation.set(loc.id, { code: loc.code, name: loc.name, items: 0, qty: new Decimal(0) });
    }

    const lowList: {
      id: string; sku: string; name: string; uom: string; category: string;
      totalStock: number; minStock: number; shortfall: number;
    }[] = [];

    for (const it of items) {
      const total = sumStock(it.stocks);
      const min = new Decimal(it.minStock.toString());
      totalQty = totalQty.plus(total);
      if (it.isActive) activeItems += 1;
      if (total.lessThanOrEqualTo(0)) outOfStock += 1;
      if (total.lessThan(min)) {
        lowStock += 1;
        lowList.push({
          id: it.id, sku: it.sku, name: it.name, uom: it.uom,
          category: it.category?.name ?? '—',
          totalStock: total.toNumber(),
          minStock: min.toNumber(),
          shortfall: min.minus(total).toNumber(),
        });
      }

      const catKey = it.categoryId;
      const cat = byCategory.get(catKey) ?? {
        name: it.category?.name ?? '—',
        type: String(it.category?.type ?? '—'),
        items: 0,
        qty: new Decimal(0),
      };
      cat.items += 1;
      cat.qty = cat.qty.plus(total);
      byCategory.set(catKey, cat);

      for (const s of it.stocks) {
        const bucket = byLocation.get(s.locationId);
        if (!bucket) continue;
        const q = new Decimal(s.quantity.toString());
        bucket.qty = bucket.qty.plus(q);
        if (!q.isZero()) bucket.items += 1;
      }
    }

    const movementTotals: Record<string, { count: number; qty: number }> = {
      IN: { count: 0, qty: 0 },
      OUT: { count: 0, qty: 0 },
      TRANSFER: { count: 0, qty: 0 },
      ADJUSTMENT: { count: 0, qty: 0 },
    };
    const movedItems = new Set<string>();
    for (const m of movements30) {
      const bucket = movementTotals[m.type];
      if (bucket) {
        bucket.count += 1;
        bucket.qty += new Decimal(m.quantity.toString()).abs().toNumber();
      }
      movedItems.add(m.itemId);
    }

    return res.json({
      summary: {
        totalItems: items.length,
        activeItems,
        totalQty: totalQty.toNumber(),
        lowStockCount: lowStock,
        outOfStockCount: outOfStock,
        locationCount: locations.length,
        categoryCount: byCategory.size,
        movements30d: movements30.length,
        itemsMoved30d: movedItems.size,
      },
      movementTotals,
      byCategory: Array.from(byCategory.values())
        .map((c) => ({ ...c, qty: c.qty.toNumber() }))
        .sort((a, b) => b.qty - a.qty),
      byLocation: Array.from(byLocation.values())
        .map((l) => ({ ...l, qty: l.qty.toNumber() }))
        .sort((a, b) => b.qty - a.qty),
      lowStockItems: lowList.sort((a, b) => b.shortfall - a.shortfall).slice(0, 10),
      recentMovements: recent.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: new Decimal(m.quantity.toString()).toNumber(),
        createdAt: m.createdAt,
        item: m.item,
        fromLocation: m.fromLocation,
        toLocation: m.toLocation,
        referenceNo: m.referenceNo,
      })),
    });
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/inventory/dashboard', 'Gagal mengambil ringkasan stok.');
  }
});

// Tools
// GET /api/ga/inventory/export?type=items|movements — unduh CSV.
router.get('/export', async (req, res) => {
  const type = String(req.query.type || 'items');
  const csvCell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  try {
    let rows: (string | number)[][];
    let filename: string;

    if (type === 'movements') {
      const movements = await prisma.gaInventoryMovement.findMany({
        orderBy: { createdAt: 'desc' },
        take: 5000,
        include: {
          item: { select: { sku: true, name: true, uom: true } },
          fromLocation: { select: { code: true } },
          toLocation: { select: { code: true } },
        },
      });
      rows = [['Tanggal', 'Tipe', 'SKU', 'Nama Item', 'Qty', 'Satuan', 'Dari', 'Ke', 'Referensi', 'Catatan']];
      for (const m of movements) {
        rows.push([
          m.createdAt.toISOString().slice(0, 19).replace('T', ' '),
          m.type,
          m.item?.sku ?? '',
          m.item?.name ?? '',
          new Decimal(m.quantity.toString()).toNumber(),
          m.item?.uom ?? '',
          m.fromLocation?.code ?? '',
          m.toLocation?.code ?? '',
          m.referenceNo ?? '',
          m.notes ?? '',
        ]);
      }
      filename = 'ga-inventory-movements';
    } else {
      const items = await prisma.gaInventoryItem.findMany({
        orderBy: { sku: 'asc' },
        include: {
          category: { select: { name: true, type: true } },
          stocks: { select: { quantity: true } },
        },
      });
      rows = [['SKU', 'Nama', 'Kategori', 'Tipe', 'Satuan', 'Total Stok', 'Stok Minimum', 'Status', 'Aktif']];
      for (const it of items) {
        const total = sumStock(it.stocks);
        const min = new Decimal(it.minStock.toString());
        rows.push([
          it.sku,
          it.name,
          it.category?.name ?? '',
          String(it.category?.type ?? ''),
          it.uom,
          total.toNumber(),
          min.toNumber(),
          total.lessThan(min) ? 'Stok rendah' : 'Aman',
          it.isActive ? 'Ya' : 'Tidak',
        ]);
      }
      filename = 'ga-inventory-items';
    }

    const csv = '\uFEFF' + rows.map((r) => r.map(csvCell).join(';')).join('\r\n');
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}-${stamp}.csv"`);
    return res.send(csv);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/inventory/export', 'Gagal mengekspor data.');
  }
});

// POST /api/ga/inventory/stock-set — opname cepat: set stok ABSOLUT per lokasi.
//   Selisih terhadap stok sistem dicatat sebagai movement ADJUSTMENT (boleh minus),
//   supaya total stok tetap 100% turunan dari log mutasi.
const StockSetSchema = z.object({
  itemId: z.string().min(1),
  locationId: z.string().min(1),
  quantity: z.number().nonnegative('Stok hasil opname tidak boleh negatif.'),
  notes: z.string().optional().nullable(),
});

router.post('/stock-set', async (req: AuthRequest, res) => {
  const input = validateBody(StockSetSchema, req.body, res);
  if (!input) return;
  try {
    const result = await prisma.$transaction(async (tx) => {
      const target = new Decimal(input.quantity);
      const existing = await tx.gaStockByLocation.findUnique({
        where: { itemId_locationId: { itemId: input.itemId, locationId: input.locationId } },
      });
      const current = existing ? new Decimal(existing.quantity.toString()) : new Decimal(0);
      const delta = target.minus(current);
      if (delta.isZero()) return { changed: false, delta: 0, before: current.toNumber(), after: target.toNumber() };

      if (existing) {
        await tx.gaStockByLocation.update({
          where: { id: existing.id },
          data: { quantity: target.toString() },
        });
      } else {
        await tx.gaStockByLocation.create({
          data: { itemId: input.itemId, locationId: input.locationId, quantity: target.toString() },
        });
      }

      await tx.gaInventoryMovement.create({
        data: {
          itemId: input.itemId,
          type: 'ADJUSTMENT',
          quantity: delta.toString(),
          toLocationId: input.locationId,
          referenceNo: 'OPNAME',
          notes: input.notes || `Opname: ${current.toString()} → ${target.toString()}`,
          createdBy: req.user!.userId,
        },
      });

      return { changed: true, delta: delta.toNumber(), before: current.toNumber(), after: target.toNumber() };
    });

    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /ga/inventory/stock-set', 'Gagal menyimpan hasil opname.');
  }
});

export default router;
