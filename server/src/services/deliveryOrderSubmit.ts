import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { adjustWarehouseStock, resolveWarehouseId, getWarehouseStockMap } from '../utils/warehouseStock';
import { logger } from '../lib/logger';
import { linkTemporaryNotesToDoInTx } from './temporaryDeliveryNote';

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
  negativeStockReason?: string | null;
  temporaryNoteIds?: string[];
}

/**
 * Submit a delivery order. Out movements lock unitCost from averageCost so the later sales invoice
 * posts COGS at delivery-time cost. No GL impact here (the invoice posts it). Caller owns the transaction.
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

  // Check stock per (item, warehouse) from inventory_stocks; currentStock is a cross-warehouse
  // total and must not gate a per-warehouse shipment.
  const qtyByItemWh = new Map<string, { itemId: string; warehouseId: string; qty: number }>();
  for (const it of body.items) {
    if (!it.inventoryItemId) continue;
    const whId = await resolveWarehouseId(tx, it.warehouseId);
    if (!whId) throw new BusinessError(`Item '${it.itemName}' perlu pilih gudang sumber.`);
    const key = `${it.inventoryItemId}::${whId}`;
    const prev = qtyByItemWh.get(key);
    if (prev) prev.qty += it.quantity;
    else qtyByItemWh.set(key, { itemId: it.inventoryItemId, warehouseId: whId, qty: it.quantity });
  }
  if (qtyByItemWh.size > 0) {
    const entries = Array.from(qtyByItemWh.values());
    const invItems = await tx.inventoryItem.findMany({
      where: { id: { in: Array.from(new Set(entries.map((e) => e.itemId))) } },
      select: { id: true, name: true, unit: true, isActive: true },
    });
    const itemById = new Map(invItems.map((i) => [i.id, i]));
    const whIds = Array.from(new Set(entries.map((e) => e.warehouseId)));
    const warehouses = await tx.warehouse.findMany({
      where: { id: { in: whIds } },
      select: { id: true, name: true },
    });
    const whById = new Map(warehouses.map((w) => [w.id, w]));
    const stockMap = await getWarehouseStockMap(
      tx,
      entries.map((e) => ({ itemId: e.itemId, warehouseId: e.warehouseId })),
    );

    for (const e of entries) {
      const inv = itemById.get(e.itemId);
      if (!inv) throw new BusinessError('Item tidak ditemukan.');
      if (!inv.isActive) throw new BusinessError(`Item '${inv.name}' tidak aktif.`);

      const available = stockMap.get(`${e.itemId}::${e.warehouseId}`) ?? 0;
      if (available < e.qty) {
        const whName = whById.get(e.warehouseId)?.name ?? 'gudang';
        if (!body.allowNegativeStock) {
          throw new BusinessError(
            `Stok '${inv.name}' di gudang ${whName} tidak cukup. Tersedia: ${available.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${inv.unit}, dibutuhkan: ${e.qty.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${inv.unit}. Buat produksi/transfer/penerimaan dulu.`,
          );
        }
        logger.warn(
          {
            itemId: inv.id,
            itemName: inv.name,
            warehouseId: e.warehouseId,
            warehouseName: whName,
            available,
            needed: e.qty,
            partyId: body.partyId,
            userId,
            reason: body.negativeStockReason,
          },
          'DO submitted with negative stock bypass',
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

      // Block oversold lines: negative per-warehouse stock corrupts WAC and COGS.
      // allowNegativeStock still bypasses this, same as the aggregate pre-check.
      const warehouseStock = await tx.inventoryStock.findUnique({
        where: { itemId_warehouseId: { itemId: inventoryItem.id, warehouseId } },
        select: { currentStock: true },
      });
      const availableQty = warehouseStock ? Number(warehouseStock.currentStock) : 0;
      if (availableQty < qty && !body.allowNegativeStock) {
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

  // Tautkan Surat Jalan Sementara (Open, pelanggan sama) ke DO ini — satu transaksi dengan pembuatan DO.
  if (body.temporaryNoteIds && body.temporaryNoteIds.length > 0) {
    await linkTemporaryNotesToDoInTx(tx, deliveryOrder.id, body.partyId, body.temporaryNoteIds);
  }

  logger.info({ doNumber, items: body.items.length, partyId: body.partyId }, 'Delivery order submitted');

  return tx.deliveryOrder.findUniqueOrThrow({
    where: { id: deliveryOrder.id },
    include: { items: true, customer: true },
  });
}
