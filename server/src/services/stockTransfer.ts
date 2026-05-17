import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

export interface SubmitStockTransferInput {
  date: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  notes?: string | null;
  nomorMobil?: string | null;
  driverName?: string | null;
  recipientName?: string | null;
  items: Array<{ itemId: string; quantity: number; description?: string | null }>;
}

/**
 * Submit a stock transfer:
 *   - validate both warehouses exist & active
 *   - validate stock availability at source warehouse per-item
 *   - decrement source / increment destination in inventory_stocks
 *   - create paired StockMovement rows: TransferOut at source, TransferIn at
 *     destination (no GL impact — same account, net zero)
 *   - inventory_items.current_stock (total across warehouses) is unchanged
 */
export async function submitStockTransferInTx(
  tx: Tx,
  body: SubmitStockTransferInput,
  userId: string,
) {
  const date = new Date(body.date);
  if (isNaN(date.getTime())) throw new BusinessError('Format tanggal tidak valid.');
  if (body.fromWarehouseId === body.toWarehouseId) {
    throw new BusinessError('Gudang sumber dan tujuan tidak boleh sama.');
  }

  const fy = await getOpenFiscalYear(tx, date);
  const transferNumber = await generateDocumentNumber(tx, 'ST', date, fy.id);

  const fromWh = await tx.warehouse.findUnique({ where: { id: body.fromWarehouseId } });
  const toWh = await tx.warehouse.findUnique({ where: { id: body.toWarehouseId } });
  if (!fromWh || !toWh) throw new BusinessError('Gudang tidak ditemukan.');
  if (!fromWh.isActive || !toWh.isActive) {
    throw new BusinessError('Gudang sumber/tujuan tidak aktif.');
  }

  // Per-item stock check at source.
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

  const transfer = await tx.stockTransfer.create({
    data: {
      transferNumber,
      date,
      fromWarehouseId: body.fromWarehouseId,
      toWarehouseId: body.toWarehouseId,
      status: 'Submitted',
      notes: body.notes || null,
      nomorMobil: body.nomorMobil ?? null,
      driverName: body.driverName ?? null,
      recipientName: body.recipientName ?? null,
      fiscalYearId: fy.id,
      createdBy: userId,
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

  // Adjust stocks + create paired movements per line.
  for (const it of body.items) {
    const item = await tx.inventoryItem.findUnique({ where: { id: it.itemId } });
    if (!item) throw new BusinessError('Item tidak ditemukan.');
    const qty = it.quantity;
    const unitCost = Number(item.averageCost);
    const totalValue = qty * unitCost;

    await tx.inventoryStock.upsert({
      where: { itemId_warehouseId: { itemId: it.itemId, warehouseId: body.fromWarehouseId } },
      create: { itemId: it.itemId, warehouseId: body.fromWarehouseId, currentStock: -qty },
      update: { currentStock: { decrement: qty } },
    });
    await tx.inventoryStock.upsert({
      where: { itemId_warehouseId: { itemId: it.itemId, warehouseId: body.toWarehouseId } },
      create: { itemId: it.itemId, warehouseId: body.toWarehouseId, currentStock: qty },
      update: { currentStock: { increment: qty } },
    });

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
        createdById: userId,
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
        createdById: userId,
      },
    });
  }

  logger.info({ transferNumber, items: body.items.length }, 'Stock transfer submitted');
  return transfer;
}

/**
 * Reverse a submitted stock transfer:
 *   - source += qty, destination -= qty (inventory_stocks)
 *   - mark paired stockMovements isCancelled
 *   - flip transfer status to Cancelled
 */
export async function cancelStockTransferInTx(
  tx: Tx,
  transferId: string,
) {
  const transfer = await tx.stockTransfer.findUnique({
    where: { id: transferId },
    include: { items: true },
  });
  if (!transfer) throw new BusinessError('Transfer tidak ditemukan.');
  if (transfer.status === 'Cancelled') throw new BusinessError('Transfer sudah dibatalkan.');

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

  await tx.stockMovement.updateMany({
    where: { referenceType: 'StockTransfer', referenceId: transferId },
    data: { isCancelled: true },
  });

  return tx.stockTransfer.update({
    where: { id: transferId },
    data: { status: 'Cancelled', cancelledAt: new Date() },
  });
}
