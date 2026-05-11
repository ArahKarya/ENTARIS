import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { prisma } from '../lib/prisma';
import { AuthRequest, roleMiddleware } from '../middleware/auth';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { BusinessError, handleRouteError } from '../utils/errors';
import { validateBody } from '../utils/validate';
import { logger } from '../lib/logger';

const router = Router();

const TransferItemSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.coerce.number().positive('Qty harus > 0.'),
  description: z.string().nullable().optional(),
});

const CreateTransferSchema = z.object({
  date: z.string().min(1, 'Tanggal wajib diisi.'),
  fromWarehouseId: z.string().uuid('Gudang asal wajib dipilih.'),
  toWarehouseId: z.string().uuid('Gudang tujuan wajib dipilih.'),
  notes: z.string().nullable().optional(),
  items: z.array(TransferItemSchema).min(1, 'Minimal satu item.'),
}).refine((d) => d.fromWarehouseId !== d.toWarehouseId, {
  message: 'Gudang asal dan tujuan harus berbeda.',
  path: ['toWarehouseId'],
});

// GET /api/stock-transfers
router.get('/', async (req, res) => {
  try {
    const { status, page = '1', limit = '50' } = req.query;
    const take = Math.min(Number(limit) || 50, 200);
    const skip = (Number(page) - 1) * take;
    const where: Prisma.StockTransferWhereInput = {};
    if (status) where.status = status as any;

    const [data, total] = await Promise.all([
      prisma.stockTransfer.findMany({
        where,
        include: {
          fromWarehouse: { select: { id: true, code: true, name: true } },
          toWarehouse: { select: { id: true, code: true, name: true } },
          items: {
            include: { item: { select: { id: true, code: true, name: true, unit: true } } },
          },
          user: { select: { id: true, fullName: true } },
        },
        orderBy: { date: 'desc' },
        skip,
        take,
      }),
      prisma.stockTransfer.count({ where }),
    ]);

    return res.json({ data, total, page: Number(page), limit: take });
  } catch (error) {
    return handleRouteError(res, error, 'GET /stock-transfers', 'Gagal mengambil daftar transfer.');
  }
});

// GET /:id
router.get('/:id', async (req, res) => {
  try {
    const transfer = await prisma.stockTransfer.findUnique({
      where: { id: req.params.id as string },
      include: {
        fromWarehouse: true,
        toWarehouse: true,
        items: { include: { item: true } },
        user: { select: { id: true, fullName: true } },
      },
    });
    if (!transfer) return res.status(404).json({ error: 'Transfer tidak ditemukan.' });
    return res.json(transfer);
  } catch (error) {
    return handleRouteError(res, error, 'GET /stock-transfers/:id', 'Gagal mengambil detail transfer.');
  }
});

// POST / — create + submit (single step for now)
router.post('/', roleMiddleware(['Admin', 'Accountant', 'StaffProduksi']), async (req: AuthRequest, res) => {
  const body = validateBody(CreateTransferSchema, req.body, res);
  if (!body) return;

  try {
    const date = new Date(body.date);
    if (isNaN(date.getTime())) throw new BusinessError('Format tanggal tidak valid.');

    const result = await prisma.$transaction(async (tx) => {
      const fy = await getOpenFiscalYear(tx, date);
      const transferNumber = await generateDocumentNumber(tx, 'ST', date, fy.id);

      // Validate warehouses exist & active
      const fromWh = await tx.warehouse.findUnique({ where: { id: body.fromWarehouseId } });
      const toWh = await tx.warehouse.findUnique({ where: { id: body.toWarehouseId } });
      if (!fromWh || !toWh) throw new BusinessError('Gudang tidak ditemukan.');
      if (!fromWh.isActive || !toWh.isActive) throw new BusinessError('Gudang sumber/tujuan tidak aktif.');

      // Validate items + stock availability at source warehouse
      for (const it of body.items) {
        const stockRow = await tx.inventoryStock.findUnique({
          where: { itemId_warehouseId: { itemId: it.itemId, warehouseId: body.fromWarehouseId } },
        });
        const available = stockRow ? new Decimal(stockRow.currentStock.toString()) : new Decimal(0);
        if (available.lt(it.quantity)) {
          const item = await tx.inventoryItem.findUnique({ where: { id: it.itemId } });
          throw new BusinessError(
            `Stok item "${item?.name ?? it.itemId}" di ${fromWh.name} hanya ${available.toFixed(3)} ${item?.unit ?? ''}, tidak cukup untuk transfer ${it.quantity}.`,
          );
        }
      }

      // Create transfer header + items
      const transfer = await tx.stockTransfer.create({
        data: {
          transferNumber,
          date,
          fromWarehouseId: body.fromWarehouseId,
          toWarehouseId: body.toWarehouseId,
          status: 'Submitted',
          notes: body.notes || null,
          fiscalYearId: fy.id,
          createdBy: req.user!.userId,
          submittedAt: new Date(),
          items: {
            create: body.items.map((it) => ({
              itemId: it.itemId,
              quantity: it.quantity,
              description: it.description || null,
            })),
          },
        },
        include: { items: true },
      });

      // For each item: create 2 movements + adjust 2 inventory_stock rows
      for (const it of body.items) {
        const item = await tx.inventoryItem.findUnique({ where: { id: it.itemId } });
        if (!item) throw new BusinessError('Item tidak ditemukan.');
        const qty = it.quantity;
        const unitCost = Number(item.averageCost);
        const totalValue = qty * unitCost;

        // Decrement source warehouse stock
        await tx.inventoryStock.upsert({
          where: { itemId_warehouseId: { itemId: it.itemId, warehouseId: body.fromWarehouseId } },
          create: { itemId: it.itemId, warehouseId: body.fromWarehouseId, currentStock: -qty },
          update: { currentStock: { decrement: qty } },
        });
        // Increment destination warehouse stock
        await tx.inventoryStock.upsert({
          where: { itemId_warehouseId: { itemId: it.itemId, warehouseId: body.toWarehouseId } },
          create: { itemId: it.itemId, warehouseId: body.toWarehouseId, currentStock: qty },
          update: { currentStock: { increment: qty } },
        });

        // Create paired stock movements (no GL — same account, net zero)
        const smOutNo = await generateDocumentNumber(tx, 'SM', date, fy.id);
        const smOut = await tx.stockMovement.create({
          data: {
            movementNumber: smOutNo,
            date,
            itemId: it.itemId,
            warehouseId: body.fromWarehouseId,
            movementType: 'TransferOut',
            quantity: qty,
            unitCost,
            totalValue,
            notes: `Transfer ke ${toWh.name}`,
            referenceType: 'StockTransfer',
            referenceId: transfer.id,
            referenceNumber: transferNumber,
            fiscalYearId: fy.id,
            createdById: req.user!.userId,
          },
        });
        const smInNo = await generateDocumentNumber(tx, 'SM', date, fy.id);
        await tx.stockMovement.create({
          data: {
            movementNumber: smInNo,
            date,
            itemId: it.itemId,
            warehouseId: body.toWarehouseId,
            movementType: 'TransferIn',
            quantity: qty,
            unitCost,
            totalValue,
            notes: `Transfer dari ${fromWh.name} (ref: ${smOut.movementNumber})`,
            referenceType: 'StockTransfer',
            referenceId: transfer.id,
            referenceNumber: transferNumber,
            fiscalYearId: fy.id,
            createdById: req.user!.userId,
          },
        });

        // Note: inventory_items.current_stock (total) does NOT change because
        // total across warehouses is unchanged.
      }

      logger.info({ transferNumber, items: body.items.length }, 'Stock transfer submitted');
      return transfer;
    }, { timeout: 30000 });

    return res.status(201).json(result);
  } catch (error) {
    return handleRouteError(res, error, 'POST /stock-transfers', 'Gagal membuat transfer stok.');
  }
});

// PATCH /:id/cancel — reverse the transfer
router.patch('/:id/cancel', roleMiddleware(['Admin', 'Accountant']), async (req: AuthRequest, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const id = req.params.id as string;
      const transfer = await tx.stockTransfer.findUnique({
        where: { id },
        include: { items: true },
      });
      if (!transfer) throw new BusinessError('Transfer tidak ditemukan.');
      if (transfer.status === 'Cancelled') throw new BusinessError('Transfer sudah dibatalkan.');

      // Reverse stock: source += qty, destination -= qty
      for (const ti of transfer.items) {
        const qty = Number(ti.quantity);
        await tx.inventoryStock.update({
          where: { itemId_warehouseId: { itemId: ti.itemId, warehouseId: transfer.fromWarehouseId } },
          data: { currentStock: { increment: qty } },
        });
        await tx.inventoryStock.update({
          where: { itemId_warehouseId: { itemId: ti.itemId, warehouseId: transfer.toWarehouseId } },
          data: { currentStock: { decrement: qty } },
        });
      }

      // Soft-cancel the paired stock movements
      await tx.stockMovement.updateMany({
        where: { referenceType: 'StockTransfer', referenceId: id },
        data: { isCancelled: true },
      });

      return tx.stockTransfer.update({
        where: { id },
        data: { status: 'Cancelled', cancelledAt: new Date() },
      });
    });

    return res.json(result);
  } catch (error) {
    return handleRouteError(res, error, 'PATCH /stock-transfers/:id/cancel', 'Gagal membatalkan transfer.');
  }
});

export default router;
