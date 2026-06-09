// GA Inventory — General Affairs' OWN sparepart/consumable stock.
// SEPARATE domain from the ERP's accounting inventory (Persediaan / stock GL):
// no journal entries, no account balances, just physical stock per location.
//
// Ported from ga-monitor (server/src/routes/inventory.ts). Mounted under
// /api/ga/inventory with requirePerm('ga_inventory') by routes/ga/index.ts —
// so NO auth/permission middleware inside this file.
//
// Domain:
//   - GaInventoryItem: catalogue (sku/name/category/uom/minStock).
//   - GaStockByLocation: per-location quantity (@@unique itemId+locationId).
//   - GaInventoryMovement: IN/OUT/TRANSFER/ADJUSTMENT — each movement updates
//     per-location stock atomically inside a prisma.$transaction.
//   - Low-stock: total stock across locations vs item.minStock.

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { AuthRequest } from '../../middleware/auth';
import { validateBody } from '../../utils/validate';
import { handleRouteError } from '../../utils/errors';
import { logger } from '../../lib/logger';

const router = Router();

// ── Schemas (inline — GA-specific, kept out of shared schemas.ts) ──────
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

// ── Items ──────────────────────────────────────────────────────────
// GET /api/ga/inventory/items — list with total stock + low-stock flag.
router.get('/items', async (req: AuthRequest, res) => {
  try {
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

    const [items, total] = await prisma.$transaction([
      prisma.gaInventoryItem.findMany({
        where,
        orderBy: { sku: 'asc' },
        skip,
        take: limit,
        include: {
          category: { select: { code: true, name: true, type: true } },
          stocks: { select: { quantity: true } },
        },
      }),
      prisma.gaInventoryItem.count({ where }),
    ]);

    const enriched = items.map((it) => {
      const totalStock = sumStock(it.stocks);
      const minStock = new Decimal(it.minStock.toString());
      return {
        id: it.id,
        sku: it.sku,
        name: it.name,
        uom: it.uom,
        minStock: minStock.toNumber(),
        isActive: it.isActive,
        category: it.category,
        totalStock: totalStock.toNumber(),
        lowStock: totalStock.lessThan(minStock),
      };
    });

    if (req.query.paginated === '1') {
      return res.json({ data: enriched, total, page, limit });
    }
    return res.json(enriched);
  } catch (error) {
    return handleRouteError(res, error, 'GET /ga/inventory/items', 'Gagal mengambil data item.');
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

// ── Movements ──────────────────────────────────────────────────────
// GET /api/ga/inventory/movements — list/filter (latest 100).
router.get('/movements', async (req: AuthRequest, res) => {
  try {
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

// POST /api/ga/inventory/movements — record movement + update stock in a tx.
//   IN          : increment toLocation (upsert).
//   OUT         : decrement fromLocation (guard not negative).
//   TRANSFER    : decrement fromLocation, increment toLocation.
//   ADJUSTMENT  : delta applied to toLocation (mirrors GA source semantics).
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

// ── Low stock report ───────────────────────────────────────────────
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

export default router;
