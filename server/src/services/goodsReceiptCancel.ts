import type { Prisma } from '@prisma/client';
import { BusinessError } from '../utils/errors';
import { adjustWarehouseStock } from '../utils/warehouseStock';
import { updateAccountBalance } from '../utils/accountBalance';
import { logger } from '../lib/logger';
import { recomputeAverageCostFromReplay } from './averageCostRecompute';

type Tx = Prisma.TransactionClient;

interface CancelOptions {
  /** Skip the "enough stock to reverse" guard (the route requires a negativeStockReason). */
  allowNegativeStock?: boolean;
  negativeStockReason?: string | null;
}

/**
 * Cancel an STT. Rejected for legacy backfill STTs (cancel the PI instead) and when a linked PI
 * exists (cancel it first; not auto-cancelled because of payment side effects). Reverses stock,
 * posts a flipped JV (DR Hutang Belum Tagih / CR Persediaan) and decrements PO qtyReceived.
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

  // Block when an outbound movement already consumes one of these batches (sourceMovementId);
  // cancelling would orphan its cost basis.
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

  // Don't drive stock negative on reversal; allowNegativeStock logs a warning instead of throwing.
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
            'Barang sudah keluar (terjual/produksi). Batalkan transaksi tersebut dulu.',
        );
      }
      logger.warn(
        { sttId, itemId: grItem.inventoryItemId, available, reverseQty: qty, reason: opts.negativeStockReason },
        'STT cancel reverse with negative stock bypass',
      );
    }
  }

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
    await adjustWarehouseStock(tx, grItem.inventoryItemId, grItem.warehouseId, -qty);
    affectedItemIds.add(grItem.inventoryItemId);

    if (grItem.purchaseOrderItemId) {
      await tx.purchaseOrderItem.update({
        where: { id: grItem.purchaseOrderItemId },
        data: { qtyReceived: { decrement: qty } },
      });
    }
  }

  // Recompute averageCost by replaying remaining active movements.
  // Customer-owned STTs are skipped: their submit never touched WAC.
  for (const itemId of stt.isCustomerOwned ? [] : affectedItemIds) {
    await recomputeAverageCostFromReplay(tx, itemId);
  }

  const originalJv = await tx.journalEntry.findUnique({
    where: { entryNumber: `JV-${stt.sttNumber}` },
    include: { items: true },
  });
  if (originalJv && originalJv.status === 'Submitted') {
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
