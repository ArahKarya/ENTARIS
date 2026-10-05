import type { Prisma } from '@prisma/client';
import { BusinessError } from '../utils/errors';
import { adjustWarehouseStock } from '../utils/warehouseStock';
import { updateAccountBalance } from '../utils/accountBalance';
import { logger } from '../lib/logger';
import { recomputeAverageCostFromReplay } from './averageCostRecompute';

type Tx = Prisma.TransactionClient;

interface CancelOptions {
  /** When true, skip the "stock cukup untuk dibalikin" guard. Admin override. */
  allowNegativeStock?: boolean;
  negativeStockReason?: string | null;
}

/**
 * Cancel a Bukti Penerimaan Barang (STT).
 *
 * Behavior:
 *   - Reject if STT already cancelled.
 *   - Reject if STT is backfilled (legacy) — those records mirror old PI flow;
 *     to undo, cancel the PI itself.
 *   - Reject if STT has a linked PI that is already Paid.
 *   - If STT has linked PI that is NOT paid: caller must cancel PI first.
 *     We don't auto-cancel here because PI cancel may have side effects
 *     (payment unallocation) the caller wants to be explicit about. Throw a
 *     clear error.
 *   - Reverse stock movements: mark is_cancelled, decrement currentStock +
 *     per-warehouse stock.
 *   - Cancel JV (DR Hutang Belum Tagih / CR Persediaan — i.e. flip original
 *     DR/CR with a new "JV-{stt}-CXL" entry. Original JV status → Cancelled.)
 *   - Decrement PO item qtyReceived if STT was linked to PO.
 *   - Mark STT cancelledAt + status Cancelled.
 */
export async function cancelGoodsReceiptInTx(
  tx: Tx,
  sttId: string,
  userId: string,
  opts: CancelOptions = {},
) {
  const stt = await tx.goodsReceipt.findUnique({
    where: { id: sttId },
    include: {
      items: { include: { stockMovement: true, inventoryItem: { select: { name: true } } } },
      invoice: { select: { id: true, invoiceNumber: true, status: true, outstanding: true } },
    },
  });
  if (!stt) throw new BusinessError('STT tidak ditemukan.');
  if (stt.status === 'Cancelled') throw new BusinessError('STT sudah dibatalkan.');

  if (stt.isLegacyBackfill) {
    throw new BusinessError(
      'STT ini adalah backfill otomatis dari PI lama. Untuk membatalkan, batalkan invoice pembelian asal.',
    );
  }

  // Block if PI linked & paid
  if (stt.invoice) {
    if (stt.invoice.status === 'Paid' || stt.invoice.status === 'PartiallyPaid') {
      throw new BusinessError(
        `STT ${stt.sttNumber} terkait invoice ${stt.invoice.invoiceNumber} yang sudah ada pembayaran. ` +
          'Untuk membatalkan STT, batalkan dulu pembayaran + invoice.',
      );
    }
    if (stt.invoice.status === 'Submitted') {
      throw new BusinessError(
        `STT ${stt.sttNumber} terkait invoice ${stt.invoice.invoiceNumber} (Submitted, belum dibayar). ` +
          'Batalkan invoice tersebut dulu.',
      );
    }
  }

  // ── Guard C2: block if any inbound batch from this STT has been consumed ──
  // Outbound movements (sale/production/transfer) link back to the inbound
  // batch via sourceMovementId. If a consumer exists, the batch's cost basis
  // is already referenced downstream — cancelling would orphan it.
  const batchMovementIds = stt.items
    .map((it) => it.stockMovement?.id)
    .filter((id): id is string => !!id);
  if (batchMovementIds.length > 0) {
    const consumers = await tx.stockMovement.findMany({
      where: { sourceMovementId: { in: batchMovementIds }, isCancelled: false },
      select: { movementNumber: true, referenceType: true, referenceNumber: true },
      take: 5,
    });
    if (consumers.length > 0) {
      const ref = consumers
        .map((c) => c.referenceNumber || c.movementNumber)
        .join(', ');
      throw new BusinessError(
        `Tidak dapat membatalkan STT ${stt.sttNumber}: barang dari penerimaan ini sudah dipakai di transaksi lain (${ref}). ` +
          'Batalkan transaksi tersebut terlebih dahulu.',
      );
    }
  }

  // ── Guard C1: don't drive stock negative when reversing an inbound ──
  // (the received goods may already have been sold/consumed). Admin override
  // logs a warning instead of throwing.
  for (const grItem of stt.items) {
    const sm = grItem.stockMovement;
    if (!sm || sm.isCancelled) continue;
    const qty = Number(sm.quantity);
    const itemRow = await tx.inventoryItem.findUnique({
      where: { id: grItem.inventoryItemId },
      select: { currentStock: true },
    });
    const available = Number(itemRow?.currentStock ?? 0);
    if (available < qty) {
      if (!opts.allowNegativeStock) {
        throw new BusinessError(
          `Tidak dapat membatalkan STT ${stt.sttNumber}: stok '${grItem.inventoryItem?.name ?? grItem.inventoryItemId}' tidak mencukupi untuk pembalikan (tersedia ${available}, perlu ${qty}). ` +
            'Barang sudah keluar (terjual/produksi) — batalkan transaksi tersebut dulu.',
        );
      }
      logger.warn(
        { sttId, itemId: grItem.inventoryItemId, available, reverseQty: qty, reason: opts.negativeStockReason },
        'STT cancel reverse with negative stock bypass',
      );
    }
  }

  // Reverse each stock movement
  const affectedItemIds = new Set<string>();
  for (const grItem of stt.items) {
    const sm = grItem.stockMovement;
    if (!sm || sm.isCancelled) continue;

    await tx.stockMovement.update({
      where: { id: sm.id },
      data: { isCancelled: true, updatedAt: new Date() },
    });

    const qty = Number(sm.quantity);
    await tx.inventoryItem.update({
      where: { id: grItem.inventoryItemId },
      data: { currentStock: { decrement: qty }, updatedAt: new Date() },
    });
    // Decrement per-warehouse stock
    await adjustWarehouseStock(tx, grItem.inventoryItemId, grItem.warehouseId, -qty);
    affectedItemIds.add(grItem.inventoryItemId);

    // Decrement PO item qtyReceived if linked
    if (grItem.purchaseOrderItemId) {
      await tx.purchaseOrderItem.update({
        where: { id: grItem.purchaseOrderItemId },
        data: { qtyReceived: { decrement: qty } },
      });
    }
  }

  // Recompute averageCost for each affected item by REPLAYING its remaining
  // active movements (the cancelled receipt no longer contributes).
  // STT barang titipan: skip — submit-nya tidak menyentuh WAC.
  for (const itemId of stt.isCustomerOwned ? [] : affectedItemIds) {
    await recomputeAverageCostFromReplay(tx, itemId);
  }

  // Cancel JV: find original JV, post reverse JV, mark original Cancelled
  const originalJv = await tx.journalEntry.findUnique({
    where: { entryNumber: `JV-${stt.sttNumber}` },
    include: { items: true },
  });
  if (originalJv && originalJv.status === 'Submitted') {
    // Reverse JV
    const reverseItems = originalJv.items.map((it) => ({
      accountId: it.accountId,
      partyId: it.partyId,
      debit: Number(it.credit), // flip DR/CR
      credit: Number(it.debit),
      description: `[CANCEL] ${it.description ?? ''}`,
    }));

    const cancelJv = await tx.journalEntry.create({
      data: {
        entryNumber: `JV-${stt.sttNumber}-CXL`,
        date: new Date(),
        narration: `Pembatalan ${stt.sttNumber}`,
        status: 'Submitted',
        fiscalYearId: stt.fiscalYearId,
        createdBy: userId,
        submittedAt: new Date(),
        items: { create: reverseItems },
      },
    });

    await tx.accountingLedgerEntry.createMany({
      data: reverseItems.map((it) => ({
        date: new Date(),
        accountId: it.accountId,
        partyId: it.partyId,
        debit: it.debit,
        credit: it.credit,
        referenceType: 'JournalEntry',
        referenceId: cancelJv.id,
        description: it.description,
        fiscalYearId: stt.fiscalYearId,
      })),
    });

    for (const it of reverseItems) {
      await updateAccountBalance(tx, it.accountId, it.debit, it.credit);
    }

    // Mark original Cancelled
    await tx.journalEntry.update({
      where: { id: originalJv.id },
      data: { status: 'Cancelled', cancelledAt: new Date() },
    });
  }

  const updated = await tx.goodsReceipt.update({
    where: { id: stt.id },
    data: { status: 'Cancelled', cancelledAt: new Date(), updatedAt: new Date() },
  });

  logger.info({ sttId, sttNumber: stt.sttNumber }, 'Goods receipt cancelled (stock reversed + JV flipped)');
  return updated;
}
