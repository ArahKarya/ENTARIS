import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { generateDocumentNumber } from '../utils/documentNumber';
import { getOpenFiscalYear } from '../utils/fiscalYear';
import { adjustWarehouseStock } from '../utils/warehouseStock';
import { calcWeightedAverage } from '../utils/weightedAverage';
import { updateAccountBalance } from '../utils/accountBalance';
import { systemAccounts } from './systemAccounts';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

export interface SubmitGoodsReceiptInput {
  date: string;
  partyId: string;
  purchaseOrderId?: string | null;
  nomorMobil?: string | null;
  driverName?: string | null;
  recipientName?: string | null;
  notes?: string | null;
  items: Array<{
    inventoryItemId: string;
    warehouseId: string;
    itemName: string;
    quantity: number;
    unit: string;
    lockedUnitCost: number;
    description?: string | null;
    purchaseOrderItemId?: string | null;
  }>;
}

/**
 * Submit a Bukti Penerimaan Barang (STT/BPB).
 *
 * Behavior:
 *   - Validate fiscal year + supplier (must be Supplier or Both).
 *   - If purchaseOrderId set, validate PO exists & not cancelled.
 *   - Generate STT number.
 *   - For each line:
 *       · resolve warehouse, create In movement w/ locked unitCost
 *       · update inventory_items.currentStock (+) and averageCost (weighted)
 *       · update inventory_stocks per warehouse (+)
 *       · link goods_receipt_items.stockMovementId
 *       · if PO line linked, bump PO item qtyReceived
 *   - Post single JE per STT:
 *       DR Persediaan (per-account, may split across inventory accounts)
 *       CR Hutang Belum Tagih (accrued payable — single line)
 *   - Caller owns the surrounding $transaction.
 */
export async function submitGoodsReceiptInTx(
  tx: Tx,
  body: SubmitGoodsReceiptInput,
  userId: string,
) {
  const parsedDate = new Date(body.date);
  if (isNaN(parsedDate.getTime())) throw new BusinessError('Format tanggal tidak valid.');

  const fiscalYear = await getOpenFiscalYear(tx, parsedDate);

  const party = await tx.party.findUnique({ where: { id: body.partyId } });
  if (!party) throw new BusinessError('Supplier tidak ditemukan.');
  if (!party.isActive) throw new BusinessError(`Supplier '${party.name}' tidak aktif.`);
  if (party.partyType !== 'Supplier' && party.partyType !== 'Both') {
    throw new BusinessError(`Party '${party.name}' bukan supplier.`);
  }

  // PO validation (optional)
  if (body.purchaseOrderId) {
    const po = await tx.purchaseOrder.findUnique({ where: { id: body.purchaseOrderId } });
    if (!po) throw new BusinessError('Purchase Order tidak ditemukan.');
    if (po.status === 'Cancelled') {
      throw new BusinessError('Purchase Order sudah dibatalkan, tidak bisa dipakai untuk STT.');
    }
    // PO Khusus: kalau partyId di-set, supplier harus match
    if (po.partyId && po.partyId !== body.partyId) {
      throw new BusinessError(
        'Supplier STT berbeda dengan supplier yang ditetapkan di PO. PO ini khusus untuk supplier lain.',
      );
    }
  }

  // Resolve inventory accounts up-front so JE can group properly
  const defaultInvAccount = await systemAccounts.getAccount('INVENTORY');
  const accruedAcct = await systemAccounts.getAccount('ACCRUED_PAYABLE');

  const sttNumber = await generateDocumentNumber(tx, 'STT', parsedDate, fiscalYear.id);

  const goodsReceipt = await tx.goodsReceipt.create({
    data: {
      sttNumber,
      date: parsedDate,
      partyId: body.partyId,
      purchaseOrderId: body.purchaseOrderId ?? null,
      status: 'Submitted',
      notes: body.notes ?? null,
      nomorMobil: body.nomorMobil ?? null,
      driverName: body.driverName ?? null,
      recipientName: body.recipientName ?? null,
      fiscalYearId: fiscalYear.id,
      createdBy: userId,
      submittedAt: new Date(),
    },
  });

  // Aggregate per-account totals for JE (DR side)
  // Map: inventoryAccountId → total value
  const drByAccount = new Map<string, { amount: Decimal; names: string[] }>();
  let totalCr = new Decimal(0);

  for (const line of body.items) {
    const invItem = await tx.inventoryItem.findUnique({ where: { id: line.inventoryItemId } });
    if (!invItem) throw new BusinessError(`Item '${line.itemName}' tidak ditemukan.`);
    if (!invItem.isActive) throw new BusinessError(`Item '${invItem.name}' tidak aktif.`);

    const wh = await tx.warehouse.findUnique({ where: { id: line.warehouseId } });
    if (!wh) throw new BusinessError(`Gudang tidak ditemukan untuk '${line.itemName}'.`);

    const qty = new Decimal(line.quantity);
    const unitCost = new Decimal(line.lockedUnitCost);
    const totalValue = qty.times(unitCost).toDecimalPlaces(2);

    // Stock movement In
    const movementNumber = await generateDocumentNumber(tx, 'SM', parsedDate, fiscalYear.id);
    const movement = await tx.stockMovement.create({
      data: {
        movementNumber,
        date: parsedDate,
        itemId: invItem.id,
        warehouseId: wh.id,
        movementType: 'In',
        quantity: qty.toNumber(),
        unitCost: unitCost.toNumber(),
        totalValue: totalValue.toNumber(),
        referenceType: 'GoodsReceipt',
        referenceId: goodsReceipt.id,
        referenceNumber: sttNumber,
        notes: `Penerimaan barang dari ${party.name} (${sttNumber})`,
        createdById: userId,
        fiscalYearId: fiscalYear.id,
      },
    });

    // Update inventory_items: total stock + weighted average cost
    const newAvg = calcWeightedAverage(
      invItem.currentStock,
      invItem.averageCost,
      qty.toNumber(),
      unitCost.toNumber(),
    );
    await tx.inventoryItem.update({
      where: { id: invItem.id },
      data: {
        currentStock: { increment: qty.toNumber() },
        averageCost: newAvg,
        updatedAt: new Date(),
      },
    });

    // Per-warehouse stock
    await adjustWarehouseStock(tx, invItem.id, wh.id, qty.toNumber());

    // Create GR item row with SM link
    const grItem = await tx.goodsReceiptItem.create({
      data: {
        goodsReceiptId: goodsReceipt.id,
        inventoryItemId: invItem.id,
        warehouseId: wh.id,
        itemName: line.itemName,
        quantity: qty.toNumber(),
        unit: line.unit,
        lockedUnitCost: unitCost.toNumber(),
        description: line.description ?? null,
        purchaseOrderItemId: line.purchaseOrderItemId ?? null,
        stockMovementId: movement.id,
      },
    });

    // Bump PO item qtyReceived if linked
    if (line.purchaseOrderItemId) {
      await tx.purchaseOrderItem.update({
        where: { id: line.purchaseOrderItemId },
        data: { qtyReceived: { increment: qty.toNumber() } },
      });
    }

    // Aggregate JE DR side
    const acctId = invItem.accountId ?? defaultInvAccount.id;
    const existing = drByAccount.get(acctId);
    if (existing) {
      existing.amount = existing.amount.plus(totalValue);
      existing.names.push(line.itemName);
    } else {
      drByAccount.set(acctId, { amount: totalValue, names: [line.itemName] });
    }
    totalCr = totalCr.plus(totalValue);

    logger.info(
      { sttId: goodsReceipt.id, grItemId: grItem.id, smId: movement.id, qty: qty.toNumber(), cost: unitCost.toNumber() },
      'Goods receipt line posted (stock In)',
    );
  }

  // Post single JE for STT: DR Persediaan / CR Hutang Belum Tagih
  if (totalCr.gt(0)) {
    const jvNumber = `JV-${sttNumber}`;
    const items: { accountId: string; partyId: string | null; debit: number; credit: number; description: string }[] = [];

    for (const [acctId, data] of drByAccount) {
      items.push({
        accountId: acctId,
        partyId: null,
        debit: data.amount.toNumber(),
        credit: 0,
        description: `Penerimaan barang (${data.names.join(', ')}): ${sttNumber}`,
      });
    }
    items.push({
      accountId: accruedAcct.id,
      partyId: body.partyId,
      debit: 0,
      credit: totalCr.toNumber(),
      description: `Accrual hutang belum tagih: ${sttNumber} - ${party.name}`,
    });

    const journalEntry = await tx.journalEntry.create({
      data: {
        entryNumber: jvNumber,
        date: parsedDate,
        narration: `Penerimaan barang ${sttNumber} - ${party.name}`,
        status: 'Submitted',
        fiscalYearId: fiscalYear.id,
        createdBy: userId,
        submittedAt: new Date(),
        items: { create: items },
      },
    });

    await tx.accountingLedgerEntry.createMany({
      data: items.map((it) => ({
        date: parsedDate,
        accountId: it.accountId,
        partyId: it.partyId,
        debit: it.debit,
        credit: it.credit,
        referenceType: 'JournalEntry',
        referenceId: journalEntry.id,
        description: it.description,
        fiscalYearId: fiscalYear.id,
      })),
    });

    for (const it of items) {
      await updateAccountBalance(tx, it.accountId, it.debit, it.credit);
    }
  }

  logger.info(
    { sttId: goodsReceipt.id, sttNumber, partyId: body.partyId, totalValue: totalCr.toNumber(), lines: body.items.length },
    'Goods receipt submitted',
  );

  return goodsReceipt;
}
