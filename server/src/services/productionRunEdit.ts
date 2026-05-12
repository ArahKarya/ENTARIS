import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { recalculateAccountBalances } from '../utils/accountBalance';
import { cancelJournalsByPrefix } from '../utils/journalCancel';
import { generateDocumentNumber } from '../utils/documentNumber';
import { calcWeightedAverage } from '../utils/weightedAverage';
import { resolveWarehouseId, adjustWarehouseStock } from '../utils/warehouseStock';
import { systemAccounts } from './systemAccounts';
import { settleCogsBackfillForItem } from './cogsBackfillService';
import type { SubmitProductionRunInput } from './productionRunSubmit';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

/**
 * Edit a production run: cancel-but-keep-record then re-apply with a
 * revision JE (JV-{runNumber}-R{n}).
 *
 * Steps:
 *   1. Load existing run (reject if cancelled — edits start fresh from submit
 *      or a non-cancelled state)
 *   2. Reverse every active stockMovement (item-total + per-warehouse), mark
 *      isCancelled=true
 *   3. Recompute averageCost for output items from remaining active In moves
 *   4. Cancel every JE sharing the JV-{runNumber} prefix
 *   5. Delete old ProductionRunItems
 *   6. Apply new inputs/outputs (mirrors submitProductionRunInTx)
 *   7. Post new JE as JV-{runNumber}-R{count_of_cancelled+1}
 *   8. Recalculate affected account balances from JE sums to prevent drift
 *
 * Returns the updated run with line items + nested item info.
 */
export async function editProductionRunInTx(
  tx: Tx,
  runId: string,
  body: SubmitProductionRunInput,
  userId: string,
) {
  // ─ 1. Load existing ───────────────────────────────────────────
  const oldRun = await tx.productionRun.findUnique({
    where: { id: runId },
    include: { items: { include: { item: true } } },
  });
  if (!oldRun) throw new BusinessError('Data proses produksi tidak ditemukan.');
  if (oldRun.isCancelled) throw new BusinessError('Proses produksi yang sudah dibatalkan tidak bisa diedit.');

  // ─ 2. Reverse old stock movements ─────────────────────────────
  const oldMovements = await tx.stockMovement.findMany({
    where: { referenceType: 'ProductionRun', referenceId: runId, isCancelled: false },
    include: { item: true },
  });

  const outputItemIds = new Set<string>();
  for (const mov of oldMovements) {
    const isIn = mov.movementType === 'In' || mov.movementType === 'AdjustmentIn';
    const isOut = mov.movementType === 'Out' || mov.movementType === 'AdjustmentOut';
    const qty = Number(mov.quantity);

    if (isIn && Number(mov.item.currentStock) < qty) {
      if (body.allowNegativeStock) {
        logger.warn(
          { itemId: mov.itemId, itemName: mov.item.name, currentStock: Number(mov.item.currentStock), reverseQty: qty },
          'Production edit reverse with insufficient stock (allowNegativeStock=true)',
        );
      } else {
        throw new BusinessError(
          `Tidak dapat mengedit: stok '${mov.item.name}' tidak mencukupi untuk pembalikan.`,
        );
      }
    }
    if (isIn) outputItemIds.add(mov.itemId);

    const reverseDelta = isOut ? qty : -qty;
    await tx.inventoryItem.update({
      where: { id: mov.itemId },
      data: { currentStock: { increment: reverseDelta } },
    });
    await adjustWarehouseStock(tx, mov.itemId, mov.warehouseId, reverseDelta);
    await tx.stockMovement.update({ where: { id: mov.id }, data: { isCancelled: true } });
  }

  // ─ 3. Recompute output WAC from remaining active In moves ──────
  for (const itemId of outputItemIds) {
    const activeInMovements = await tx.stockMovement.findMany({
      where: { itemId, movementType: { in: ['In', 'AdjustmentIn'] }, isCancelled: false },
      select: { quantity: true, unitCost: true },
    });
    if (activeInMovements.length === 0) {
      await tx.inventoryItem.update({ where: { id: itemId }, data: { averageCost: 0 } });
    } else {
      let totalQty = new Decimal(0), totalValue = new Decimal(0);
      for (const m of activeInMovements) {
        const q = new Decimal(Number(m.quantity));
        totalQty = totalQty.plus(q);
        totalValue = totalValue.plus(q.mul(new Decimal(Number(m.unitCost))));
      }
      await tx.inventoryItem.update({
        where: { id: itemId },
        data: { averageCost: totalQty.gt(0) ? totalValue.div(totalQty).toDecimalPlaces(2).toNumber() : 0 },
      });
    }
  }

  // ─ 4. Cancel ALL active journals for this run (incl. earlier revisions) ─
  const oldJvNumber = `JV-${oldRun.runNumber}`;
  await cancelJournalsByPrefix(tx, oldJvNumber);

  // ─ 5. Delete old line items ────────────────────────────────────
  await tx.productionRunItem.deleteMany({ where: { productionRunId: runId } });

  // ─ 6. Re-apply with new data ───────────────────────────────────
  const txDate = new Date(body.date);
  const fiscalYear = await tx.fiscalYear.findFirst({
    where: { isClosed: false, startDate: { lte: txDate }, endDate: { gte: txDate } },
  });
  if (!fiscalYear) throw new BusinessError('Tidak ada tahun fiskal aktif untuk tanggal transaksi ini.');

  const allItemIds = [...body.inputs.map((i) => i.itemId), ...body.outputs.map((o) => o.itemId)];
  const allItems = await tx.inventoryItem.findMany({ where: { id: { in: allItemIds } } });
  const itemMap = new Map(allItems.map((i) => [i.id, i]));

  for (const input of body.inputs) {
    const item = itemMap.get(input.itemId);
    if (!item) throw new BusinessError('Item input tidak ditemukan.');
    if (!item.isActive) throw new BusinessError(`Item '${item.name}' tidak aktif.`);
    if (Number(item.currentStock) < input.quantity) {
      if (body.allowNegativeStock) {
        logger.warn(
          { itemId: item.id, itemName: item.name, currentStock: Number(item.currentStock), requested: input.quantity },
          'Production edit input with insufficient stock (allowNegativeStock=true)',
        );
      } else {
        throw new BusinessError(
          `Stok '${item.name}' tidak cukup. Stok saat ini: ${Number(item.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${item.unit}`,
        );
      }
    }
  }
  for (const output of body.outputs) {
    const item = itemMap.get(output.itemId);
    if (!item) throw new BusinessError('Item output tidak ditemukan.');
    if (!item.isActive) throw new BusinessError(`Item output '${item.name}' tidak aktif.`);
    if (!output.isByProduct && (!output.unitPrice || output.unitPrice <= 0)) {
      throw new BusinessError(`Harga/HPP '${item.name}' wajib diisi dan lebih dari 0.`);
    }
  }

  const totalInputQty = body.inputs.reduce((s, i) => s + i.quantity, 0);
  const totalMainOutputQty = body.outputs.filter((o) => !o.isByProduct).reduce((s, o) => s + o.quantity, 0);
  const yieldPct = totalInputQty > 0 ? (totalMainOutputQty / totalInputQty) * 100 : null;

  await tx.productionRun.update({
    where: { id: runId },
    data: {
      date: txDate,
      notes: body.notes || null,
      referenceType: body.referenceType || null,
      referenceId: body.referenceId || null,
      referenceNumber: body.referenceNumber || null,
      yieldPct: yieldPct !== null ? yieldPct : null,
      fiscalYearId: fiscalYear.id,
    },
  });

  const productionWarehouseId = await resolveWarehouseId(tx, null);

  // Inputs
  for (const input of body.inputs) {
    const item = itemMap.get(input.itemId);
    if (!item) continue;
    const avgCost = Number(item.averageCost);
    const inputUnitCost = avgCost > 0 ? avgCost : 0;
    const inputTotalValue = new Decimal(input.quantity).mul(new Decimal(inputUnitCost)).toDecimalPlaces(2).toNumber();

    await tx.inventoryItem.update({
      where: { id: input.itemId },
      data: { currentStock: { decrement: input.quantity } },
    });
    await adjustWarehouseStock(tx, input.itemId, productionWarehouseId, -input.quantity);

    const movNumber = await generateDocumentNumber(tx, 'SM', txDate, fiscalYear.id);
    await tx.stockMovement.create({
      data: {
        movementNumber: movNumber,
        date: txDate,
        itemId: input.itemId,
        warehouseId: productionWarehouseId,
        movementType: 'Out',
        quantity: input.quantity,
        unitCost: inputUnitCost,
        totalValue: inputTotalValue,
        referenceType: 'ProductionRun',
        referenceId: runId,
        referenceNumber: oldRun.runNumber,
        notes: body.notes || null,
        fiscalYearId: fiscalYear.id,
        createdById: userId,
      },
    });
  }

  // Outputs
  for (const output of body.outputs) {
    const outputItem = await tx.inventoryItem.findUnique({ where: { id: output.itemId } });
    const unitCost = output.unitPrice ?? 0;
    const newAvgCost = outputItem && unitCost > 0
      ? calcWeightedAverage(outputItem.currentStock, outputItem.averageCost, output.quantity, unitCost)
      : undefined;

    await tx.inventoryItem.update({
      where: { id: output.itemId },
      data: {
        currentStock: { increment: output.quantity },
        ...(newAvgCost !== undefined ? { averageCost: newAvgCost } : {}),
      },
    });
    await adjustWarehouseStock(tx, output.itemId, productionWarehouseId, output.quantity);
    const totalValue = new Decimal(output.quantity).mul(new Decimal(unitCost)).toDecimalPlaces(2).toNumber();

    const movNumber = await generateDocumentNumber(tx, 'SM', txDate, fiscalYear.id);
    await tx.stockMovement.create({
      data: {
        movementNumber: movNumber,
        date: txDate,
        itemId: output.itemId,
        warehouseId: productionWarehouseId,
        movementType: 'In',
        quantity: output.quantity,
        unitCost,
        totalValue,
        referenceType: 'ProductionRun',
        referenceId: runId,
        referenceNumber: oldRun.runNumber,
        notes: body.notes || null,
        fiscalYearId: fiscalYear.id,
        createdById: userId,
      },
    });

    await settleCogsBackfillForItem(tx, {
      itemId: output.itemId,
      qtyAvailable: output.quantity,
      unitCostNow: unitCost,
      fiscalYearId: fiscalYear.id,
      userId,
      settleDate: txDate,
      source: { type: 'ProductionRun', refId: runId, refNo: oldRun.runNumber },
    });
  }

  // ─ 7. Build & post revision JE ─────────────────────────────────
  const defaultInvAccount = await systemAccounts.getAccount('INVENTORY');
  const inputNames = body.inputs.map((i) => itemMap.get(i.itemId)?.name || '').join(', ');
  const outputNames = body.outputs.map((o) => itemMap.get(o.itemId)?.name || '').join(', ');

  const journalItems: { accountId: string; debit: number; credit: number; description: string }[] = [];

  let totalInputCost = new Decimal(0);
  for (const input of body.inputs) {
    const item = itemMap.get(input.itemId);
    if (!item) continue;
    const avgCost = Number(item.averageCost);
    const val = new Decimal(input.quantity).mul(new Decimal(avgCost > 0 ? avgCost : 0)).toDecimalPlaces(2).toNumber();
    if (val <= 0) continue;
    totalInputCost = totalInputCost.plus(new Decimal(val));
    journalItems.push({
      accountId: item.accountId || defaultInvAccount.id,
      debit: 0,
      credit: val,
      description: `Bahan baku keluar ${item.name}: ${oldRun.runNumber}`,
    });
  }

  let totalOutputCost = new Decimal(0);
  for (const output of body.outputs) {
    const unitCost = output.unitPrice ?? 0;
    const val = new Decimal(output.quantity).mul(new Decimal(unitCost)).toDecimalPlaces(2).toNumber();
    if (val <= 0) continue;
    totalOutputCost = totalOutputCost.plus(new Decimal(val));
    const outItem = await tx.inventoryItem.findUnique({
      where: { id: output.itemId },
      select: { accountId: true, name: true },
    });
    journalItems.push({
      accountId: outItem?.accountId || defaultInvAccount.id,
      debit: val,
      credit: 0,
      description: `Produksi masuk ${outItem?.name || ''}: ${oldRun.runNumber}`,
    });
  }

  const diff = totalOutputCost.minus(totalInputCost).toDecimalPlaces(2).toNumber();
  if (Math.abs(diff) > 0) {
    const hppBerasAccount = await tx.account.findFirst({ where: { accountNumber: '5.1' } });
    const cogsAccount = hppBerasAccount || await systemAccounts.getAccount('COGS');
    journalItems.push({
      accountId: cogsAccount.id,
      debit: diff > 0 ? 0 : Math.abs(diff),
      credit: diff > 0 ? diff : 0,
      description: `HPP ${diff > 0 ? 'konversi' : 'rugi'} produksi: ${oldRun.runNumber}`,
    });
  }

  if (journalItems.length > 0) {
    // Revision suffix derived from how many cancelled JEs already share the
    // prefix. -R1, -R2, ... predictable.
    const cancelledCount = await tx.journalEntry.count({
      where: { entryNumber: { startsWith: oldJvNumber }, status: 'Cancelled' },
    });
    const revSuffix = `-R${cancelledCount > 0 ? cancelledCount : 1}`;
    const journalEntry = await tx.journalEntry.create({
      data: {
        entryNumber: oldJvNumber + revSuffix,
        date: txDate,
        narration: `Produksi (revisi): ${oldRun.runNumber} — ${inputNames} → ${outputNames}`,
        status: 'Submitted',
        fiscalYearId: fiscalYear.id,
        createdBy: userId,
        submittedAt: new Date(),
        items: { create: journalItems },
      },
    });

    await tx.accountingLedgerEntry.createMany({
      data: journalItems.map((ji) => ({
        date: txDate,
        accountId: ji.accountId,
        debit: ji.debit,
        credit: ji.credit,
        referenceType: 'JournalEntry',
        referenceId: journalEntry.id,
        description: ji.description,
        fiscalYearId: fiscalYear.id,
      })),
    });
  }

  // ─ 8. Recompute balances from authoritative JE sums ────────────
  const allRelatedJEItems = await tx.journalItem.findMany({
    where: { journalEntry: { entryNumber: { startsWith: oldJvNumber } } },
    select: { accountId: true },
  });
  const affectedAccountIds = [...new Set(allRelatedJEItems.map((ji) => ji.accountId))];
  if (affectedAccountIds.length > 0) {
    await recalculateAccountBalances(tx, affectedAccountIds);
  }

  // ─ Persist new line items ──────────────────────────────────────
  const lineItems = [
    ...body.inputs.map((i) => ({
      productionRunId: runId,
      itemId: i.itemId,
      lineType: 'Input',
      quantity: i.quantity,
      unitPrice: null as number | null,
      yieldPct: null as number | null,
      isByProduct: false,
    })),
    ...body.outputs.map((o) => ({
      productionRunId: runId,
      itemId: o.itemId,
      lineType: o.isByProduct ? 'ByProduct' : 'Output',
      quantity: o.quantity,
      unitPrice: o.unitPrice ?? null,
      yieldPct: totalInputQty > 0 && !o.isByProduct ? (o.quantity / totalInputQty) * 100 : null,
      isByProduct: o.isByProduct ?? false,
    })),
  ];
  await tx.productionRunItem.createMany({ data: lineItems });

  return tx.productionRun.findUnique({
    where: { id: runId },
    include: {
      items: { include: { item: { select: { id: true, name: true, unit: true, code: true } } } },
    },
  });
}
