import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { adjustWarehouseStock } from '../utils/warehouseStock';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

export interface SubmitDeliveryOrderInput {
  date: string;
  partyId: string;
  nomorMobil?: string | null;
  driverName?: string | null;
  recipientName?: string | null;
  notes?: string | null;
  items: Array<{
    inventoryItemId?: string | null;
    warehouseId?: string | null;
    itemName: string;
    quantity: number;
    unit: string;
    description?: string | null;
  }>;
  allowNegativeStock?: boolean;
}

/**
 * Submit a delivery order (Surat Jalan):
 *   - validate fiscal year is open + customer is active
 *   - validate stock availability per inventory item (aggregate across lines,
 *     skip non-inventory rows) — same allowNegativeStock override as sales
 *   - create DeliveryOrder header in Submitted status
 *   - for each inventory line: resolve source warehouse, decrement totals at
 *     inventory_items + per-warehouse inventory_stocks, write a stockMovement
 *     of type Out with unitCost locked from inventoryItem.averageCost (so a
 *     later sales invoice posts COGS at the cost at *delivery* time)
 *   - link each DeliveryOrderItem to its stockMovement (null for service/
 *     non-inventory lines)
 *
 * No GL impact at this stage — the journal is posted by the matching sales
 * invoice. Caller owns the surrounding $transaction.
 */
export async function submitDeliveryOrderInTx(
  tx: Tx,
  body: SubmitDeliveryOrderInput,
  userId: string,
) {
  const parsedDate = new Date(body.date);
  if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');

  const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

  const party = await tx.party.findUnique({ where: { id: body.partyId } });
  if (!party) throw new BusinessError('Pelanggan tidak ditemukan.');
  if (!party.isActive) throw new BusinessError(`Pelanggan '${party.name}' tidak aktif.`);
  if (party.partyType !== 'Customer' && party.partyType !== 'Both') {
    throw new BusinessError(`Party '${party.name}' bukan pelanggan.`);
  }

  const doNumber = await generateDocumentNumber(tx, 'DO', parsedDate, fiscalYear.id);

  // Stock availability check: aggregate qty per inventoryItemId.
  const qtyByItem = new Map<string, number>();
  for (const it of body.items) {
    if (!it.inventoryItemId) continue;
    qtyByItem.set(it.inventoryItemId, (qtyByItem.get(it.inventoryItemId) ?? 0) + it.quantity);
  }
  if (qtyByItem.size > 0) {
    const invItems = await tx.inventoryItem.findMany({
      where: { id: { in: Array.from(qtyByItem.keys()) } },
      select: { id: true, name: true, unit: true, currentStock: true, isActive: true },
    });
    for (const inv of invItems) {
      const needed = qtyByItem.get(inv.id) ?? 0;
      if (!inv.isActive) throw new BusinessError(`Item '${inv.name}' tidak aktif.`);
      if (Number(inv.currentStock) < needed) {
        if (!body.allowNegativeStock) {
          throw new BusinessError(
            `Stok '${inv.name}' tidak cukup. Tersedia: ${Number(inv.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${inv.unit}, dibutuhkan: ${needed.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${inv.unit}.`,
          );
        }
        logger.warn(
          { itemId: inv.id, itemName: inv.name, available: Number(inv.currentStock), needed, partyId: body.partyId },
          'Delivery order submitted with insufficient stock (allowNegativeStock=true)',
        );
      }
    }
  }

  const deliveryOrder = await tx.deliveryOrder.create({
    data: {
      doNumber,
      date: parsedDate,
      partyId: body.partyId,
      status: 'Submitted',
      notes: body.notes || null,
      nomorMobil: body.nomorMobil || null,
      driverName: body.driverName || null,
      recipientName: body.recipientName || null,
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      submittedAt: new Date(),
    },
  });

  // Per-line: decrement stock + create stockMovement + create DO item row.
  for (const it of body.items) {
    let stockMovementId: string | null = null;

    if (it.inventoryItemId) {
      const inventoryItem = await tx.inventoryItem.findUnique({ where: { id: it.inventoryItemId } });
      if (!inventoryItem) throw new BusinessError(`Item '${it.itemName}' tidak ditemukan.`);

      let warehouseId = it.warehouseId ?? null;
      if (!warehouseId) {
        const defaultWh = await tx.warehouse.findFirst({
          where: { isDefault: true, isActive: true },
          select: { id: true },
        });
        warehouseId = defaultWh?.id ?? null;
      }
      if (!warehouseId) {
        throw new BusinessError(`Item '${inventoryItem.name}' perlu pilih gudang sumber.`);
      }

      const qty = it.quantity;
      const unitCost = Number(inventoryItem.averageCost);
      const totalValue = new Decimal(qty).times(new Decimal(unitCost)).toDecimalPlaces(2).toNumber();

      // Block oversold: per-warehouse stock must be enough. Selling more than
      // physically available cascades into negative inventory, which then
      // corrupts WAC formula and produces absurd COGS (see incident 2026-05).
      const warehouseStock = await tx.inventoryStock.findUnique({
        where: { itemId_warehouseId: { itemId: inventoryItem.id, warehouseId } },
        select: { currentStock: true },
      });
      const availableQty = warehouseStock ? Number(warehouseStock.currentStock) : 0;
      if (availableQty < qty) {
        const wh = await tx.warehouse.findUnique({ where: { id: warehouseId }, select: { code: true, name: true } });
        throw new BusinessError(
          `Stok '${inventoryItem.name}' di gudang ${wh?.code ?? warehouseId} kurang. ` +
            `Tersedia ${availableQty} ${inventoryItem.unit}, diminta ${qty} ${inventoryItem.unit}. ` +
            `Buat produksi/transfer/penerimaan dulu sebelum kirim.`,
        );
      }

      await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: { currentStock: { decrement: qty } },
      });
      await adjustWarehouseStock(tx, inventoryItem.id, warehouseId, -qty);

      const movementNumber = await generateDocumentNumber(tx, 'SM', parsedDate, fiscalYear.id);
      const movement = await tx.stockMovement.create({
        data: {
          movementNumber,
          date: parsedDate,
          itemId: inventoryItem.id,
          warehouseId,
          movementType: 'Out',
          quantity: qty,
          unitCost,
          totalValue,
          notes: `Auto dari ${doNumber}`,
          referenceType: 'DeliveryOrder',
          referenceId: deliveryOrder.id,
          referenceNumber: doNumber,
          fiscalYearId: fiscalYear.id,
          createdById: userId,
        },
      });
      stockMovementId = movement.id;

      await tx.deliveryOrderItem.create({
        data: {
          deliveryOrderId: deliveryOrder.id,
          inventoryItemId: inventoryItem.id,
          warehouseId,
          itemName: it.itemName,
          quantity: qty,
          unit: it.unit,
          description: it.description || null,
          stockMovementId,
        },
      });
    } else {
      await tx.deliveryOrderItem.create({
        data: {
          deliveryOrderId: deliveryOrder.id,
          inventoryItemId: null,
          warehouseId: it.warehouseId || null,
          itemName: it.itemName,
          quantity: it.quantity,
          unit: it.unit,
          description: it.description || null,
          stockMovementId: null,
        },
      });
    }
  }

  logger.info({ doNumber, items: body.items.length, partyId: body.partyId }, 'Delivery order submitted');

  // findUniqueOrThrow keeps the return type non-nullable for callers — the row
  // was just created in the same transaction so the `findFirst` would never
  // return null in practice.
  return tx.deliveryOrder.findUniqueOrThrow({
    where: { id: deliveryOrder.id },
    include: { items: true, customer: true },
  });
}
