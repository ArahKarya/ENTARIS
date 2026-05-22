import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import { adjustWarehouseStock } from '../utils/warehouseStock';
import { logger } from '../lib/logger';
import type { SubmitDeliveryOrderInput } from './deliveryOrderSubmit';

type Tx = Prisma.TransactionClient;

/**
 * Edit a delivery order: cancel-but-keep-record then re-apply the new
 * header + items with the same doNumber. Used when the user fixes a typo
 * in qty / wrong item / wrong warehouse on a DO that's still Submitted
 * and not yet folded into an invoice.
 *
 * Steps:
 *   1. Load existing DO. Reject when Cancelled or already linked to an
 *      invoice (caller must un-invoice first).
 *   2. Reverse every active stockMovement created by this DO (restore
 *      item-level total + per-warehouse stock).
 *   3. Mark those movements isCancelled.
 *   4. Delete old DeliveryOrderItems.
 *   5. Re-validate stock availability for the NEW items (mirroring submit).
 *   6. Apply new items: decrement stock + create fresh Out movements with
 *      locked unitCost (current averageCost AT EDIT TIME — same semantics
 *      as a fresh DO).
 *   7. Persist new DeliveryOrderItem rows. Update header (date/notes/
 *      shipping meta).
 *
 * doNumber is preserved so any external printout / paper trail still
 * references the same physical delivery.
 */
export async function editDeliveryOrderInTx(
  tx: Tx,
  doId: string,
  body: SubmitDeliveryOrderInput,
  userId: string,
) {
  const oldDo = await tx.deliveryOrder.findUnique({
    where: { id: doId },
    include: { items: true },
  });
  if (!oldDo) throw new BusinessError('Surat jalan tidak ditemukan.');
  if (oldDo.status === 'Cancelled') {
    throw new BusinessError('Surat jalan sudah dibatalkan — tidak bisa diedit.');
  }
  if (oldDo.invoiceId) {
    throw new BusinessError(
      'Surat jalan sudah masuk invoice. Batalkan dulu invoice terkait sebelum edit.',
    );
  }

  // 1) Reverse old stock movements + restore stock.
  const oldMovements = await tx.stockMovement.findMany({
    where: { referenceType: 'DeliveryOrder', referenceId: doId, isCancelled: false },
  });
  for (const mov of oldMovements) {
    const qty = Number(mov.quantity);
    await tx.inventoryItem.update({
      where: { id: mov.itemId },
      data: { currentStock: { increment: qty } },
    });
    await adjustWarehouseStock(tx, mov.itemId, mov.warehouseId, qty);
    await tx.stockMovement.update({
      where: { id: mov.id },
      data: { isCancelled: true },
    });
  }

  // 2) Drop old item rows. Header is reused (preserves doNumber).
  await tx.deliveryOrderItem.deleteMany({ where: { deliveryOrderId: doId } });

  // 3) Validate party still active. Allow customer change as long as it's
  // a Customer/Both party — same rule as submit.
  const party = await tx.party.findUnique({ where: { id: body.partyId } });
  if (!party) throw new BusinessError('Data pelanggan tidak ditemukan.');
  if (!party.isActive) throw new BusinessError('Pelanggan sudah tidak aktif.');
  if (party.partyType !== 'Customer' && party.partyType !== 'Both') {
    throw new BusinessError('Surat jalan hanya bisa untuk Customer.');
  }

  const txDate = new Date(body.date);
  if (isNaN(txDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');

  // 4) Pre-validate stock per inventory item (post-reversal stock).
  const qtyByItem = new Map<string, number>();
  for (const it of body.items) {
    if (!it.inventoryItemId) continue;
    qtyByItem.set(
      it.inventoryItemId,
      (qtyByItem.get(it.inventoryItemId) ?? 0) + it.quantity,
    );
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
        // Strict mode: no allowNegativeStock bypass.
        throw new BusinessError(
          `Stok '${inv.name}' tidak cukup. Tersedia: ${Number(inv.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${inv.unit}, dibutuhkan: ${needed.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${inv.unit}.`,
        );
      }
    }
  }

  // 5) Update header (preserve doNumber).
  await tx.deliveryOrder.update({
    where: { id: doId },
    data: {
      date: txDate,
      partyId: body.partyId,
      nomorMobil: body.nomorMobil ?? null,
      driverName: body.driverName ?? null,
      recipientName: body.recipientName ?? null,
      notes: body.notes ?? null,
    },
  });

  // 6) Apply new items (mirrors submit body, sharing the same fiscal year
  // lookup pattern).
  const fiscalYear = await tx.fiscalYear.findFirst({
    where: { isClosed: false, startDate: { lte: txDate }, endDate: { gte: txDate } },
  });
  if (!fiscalYear) throw new BusinessError('Tidak ada tahun fiskal aktif untuk tanggal transaksi ini.');

  for (const it of body.items) {
    let stockMovementId: string | null = null;
    if (it.inventoryItemId) {
      const inventoryItem = await tx.inventoryItem.findUnique({
        where: { id: it.inventoryItemId },
      });
      if (!inventoryItem) throw new BusinessError(`Item '${it.itemName}' tidak ditemukan.`);

      let warehouseId: string | null = it.warehouseId ?? null;
      if (!warehouseId) {
        const defaultWh = await tx.warehouse.findFirst({
          where: { isDefault: true, isActive: true },
        });
        warehouseId = defaultWh?.id ?? null;
      }
      if (!warehouseId) {
        throw new BusinessError(
          `Item "${inventoryItem.name}" perlu dipilih gudang sumber.`,
        );
      }

      const qty = Number(it.quantity);
      const unitCost = Number(inventoryItem.averageCost);
      const totalValue = new Decimal(qty).times(new Decimal(unitCost)).toDecimalPlaces(2).toNumber();

      await tx.inventoryItem.update({
        where: { id: inventoryItem.id },
        data: { currentStock: { decrement: qty } },
      });
      await adjustWarehouseStock(tx, inventoryItem.id, warehouseId, -qty);

      const movementNumber = await generateDocumentNumber(tx, 'SM', txDate, fiscalYear.id);
      const movement = await tx.stockMovement.create({
        data: {
          movementNumber,
          date: txDate,
          itemId: inventoryItem.id,
          warehouseId,
          movementType: 'Out',
          quantity: qty,
          unitCost,
          totalValue,
          notes: `Auto dari ${oldDo.doNumber} (edited)`,
          referenceType: 'DeliveryOrder',
          referenceId: doId,
          referenceNumber: oldDo.doNumber,
          fiscalYearId: fiscalYear.id,
          createdById: userId,
        },
      });
      stockMovementId = movement.id;

      await tx.deliveryOrderItem.create({
        data: {
          deliveryOrderId: doId,
          inventoryItemId: inventoryItem.id,
          warehouseId,
          itemName: it.itemName,
          quantity: qty,
          unit: it.unit,
          description: it.description ?? null,
          stockMovementId,
        },
      });
    } else {
      // Non-inventory line: no movement, just persist the row.
      await tx.deliveryOrderItem.create({
        data: {
          deliveryOrderId: doId,
          inventoryItemId: null,
          warehouseId: it.warehouseId ?? null,
          itemName: it.itemName,
          quantity: it.quantity,
          unit: it.unit,
          description: it.description ?? null,
          stockMovementId: null,
        },
      });
    }
  }

  logger.info(
    { doId, doNumber: oldDo.doNumber, items: body.items.length, partyId: body.partyId },
    'Delivery order edited',
  );

  return tx.deliveryOrder.findUniqueOrThrow({
    where: { id: doId },
    include: { items: true, customer: true },
  });
}
