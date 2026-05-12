import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { updateAccountBalance } from '../utils/accountBalance';
import { generateDocumentNumber } from '../utils/documentNumber';
import { calcWeightedAverage } from '../utils/weightedAverage';
import { resolveWarehouseId, adjustWarehouseStock } from '../utils/warehouseStock';
import { systemAccounts } from './systemAccounts';
import { settleCogsBackfillForItem } from './cogsBackfillService';
import { logger } from '../lib/logger';

type Tx = Prisma.TransactionClient;

export interface SubmitProductionRunInput {
  date: string;
  // Optional: when caller provides a warehouseId we use it as the production
  // location. Otherwise resolveWarehouseId falls back to the default. One of
  // the two must resolve, else the service throws.
  warehouseId?: string | null;
  inputs: Array<{ itemId: string; quantity: number }>;
  outputs: Array<{ itemId: string; quantity: number; unitPrice?: number | null; isByProduct?: boolean }>;
  notes?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceNumber?: string | null;
  allowNegativeStock?: boolean;
}

/**
 * Submit a production run + post downstream side-effects:
 *   - pre-fetch all input/output inventory items in one query
 *   - validate input availability (stock guard, allowNegativeStock override)
 *   - validate outputs (active + main outputs require unit_price > 0 so the
 *     full value is booked to inventory GL)
 *   - reduce input stock + create StockMovement Out per input
 *   - increase output stock + create StockMovement In per output, recompute
 *     averageCost via calcWeightedAverage
 *   - settle pending COGS backfill on each output (negative-stock sales from
 *     before this production can now be costed)
 *   - post production JE: CR per input account, DR per output account,
 *     balance via HPP Beras (5.1) — gain or loss on conversion
 *   - persist ProductionRunItems for audit trail
 *
 * Uses the default warehouse for both consumption and yield. Returns the
 * created run with line items + nested item info.
 */
export async function submitProductionRunInTx(
  tx: Tx,
  body: SubmitProductionRunInput,
  userId: string,
) {
  const txDate = new Date(body.date);
  const fiscalYear = await tx.fiscalYear.findFirst({
    where: { isClosed: false, startDate: { lte: txDate }, endDate: { gte: txDate } },
  });
  if (!fiscalYear) throw new BusinessError('Tidak ada tahun fiskal aktif untuk tanggal transaksi ini.');

  // Pre-fetch all referenced items in one round-trip.
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
          'Production input with insufficient stock (allowNegativeStock=true)',
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

  const runNumber = await generateDocumentNumber(tx, 'PR', txDate, fiscalYear.id);

  const totalInputQty = body.inputs.reduce((s, i) => s + i.quantity, 0);
  const totalMainOutputQty = body.outputs
    .filter((o) => !o.isByProduct)
    .reduce((s, o) => s + o.quantity, 0);
  const yieldPct = totalInputQty > 0 ? (totalMainOutputQty / totalInputQty) * 100 : null;

  const run = await tx.productionRun.create({
    data: {
      runNumber,
      date: txDate,
      notes: body.notes || null,
      referenceType: body.referenceType || null,
      referenceId: body.referenceId || null,
      referenceNumber: body.referenceNumber || null,
      yieldPct: yieldPct !== null ? yieldPct : null,
      fiscalYearId: fiscalYear.id,
      createdById: userId,
    },
  });

  // Production runs need a specific warehouse so inventory_stocks stays in
  // sync with the denormalized inventory_items.currentStock. Silent-null path
  // historically caused drift (e.g. GKP-KEBO showed total != SUM(per-warehouse)
  // when production was posted while no default existed). Prefer the explicit
  // body.warehouseId from the UI picker; fall back to default warehouse for
  // legacy callers; otherwise force the user to pick.
  const productionWarehouseId = await resolveWarehouseId(tx, body.warehouseId);
  if (!productionWarehouseId) {
    throw new BusinessError(
      'Gudang produksi wajib dipilih. Pilih gudang di form atau set salah satu gudang sebagai default.',
    );
  }

  // Inputs: stock-out + StockMovement Out
  let totalInputValue = new Decimal(0);
  for (const input of body.inputs) {
    const item = itemMap.get(input.itemId);
    if (!item) continue;
    const avgCost = Number(item.averageCost);
    const inputUnitCost = avgCost > 0 ? avgCost : 0;
    const inputTotalValue = new Decimal(input.quantity).mul(new Decimal(inputUnitCost)).toDecimalPlaces(2).toNumber();
    totalInputValue = totalInputValue.plus(new Decimal(inputTotalValue));

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
        referenceId: run.id,
        referenceNumber: runNumber,
        notes: body.notes || null,
        fiscalYearId: fiscalYear.id,
        createdById: userId,
      },
    });
  }

  // Outputs: stock-in + StockMovement In + WAC recalc + COGS backfill settlement
  let totalOutputValue = new Decimal(0);
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
    totalOutputValue = totalOutputValue.plus(new Decimal(totalValue));

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
        referenceId: run.id,
        referenceNumber: runNumber,
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
      source: { type: 'ProductionRun', refId: run.id, refNo: runNumber },
    });
  }

  // GL posting: DR output accounts / CR input accounts / balance via HPP Beras.
  const defaultInvAccount = await systemAccounts.getAccount('INVENTORY');
  const inputNames = body.inputs.map((i) => itemMap.get(i.itemId)?.name || '').join(', ');
  const outputNames = body.outputs.map((o) => itemMap.get(o.itemId)?.name || '').join(', ');

  const jvNumber = `JV-${runNumber}`;
  const journalItems: { accountId: string; debit: number; credit: number; description: string }[] = [];

  let totalInputCost = new Decimal(0);
  for (const input of body.inputs) {
    const item = itemMap.get(input.itemId);
    if (!item) continue;
    const avgCost = Number(item.averageCost);
    const val = new Decimal(input.quantity)
      .mul(new Decimal(avgCost > 0 ? avgCost : 0))
      .toDecimalPlaces(2)
      .toNumber();
    if (val <= 0) continue;
    totalInputCost = totalInputCost.plus(new Decimal(val));
    const acctId = item.accountId || defaultInvAccount.id;
    journalItems.push({
      accountId: acctId,
      debit: 0,
      credit: val,
      description: `Bahan baku keluar ${item.name}: ${runNumber}`,
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
    const acctId = outItem?.accountId || defaultInvAccount.id;
    journalItems.push({
      accountId: acctId,
      debit: val,
      credit: 0,
      description: `Produksi masuk ${outItem?.name || ''}: ${runNumber}`,
    });
  }

  // Balance the JE: difference goes to HPP Beras (5.1) — gain on conversion (CR)
  // when output > input, loss (DR) when input > output.
  const diff = totalOutputCost.minus(totalInputCost).toDecimalPlaces(2).toNumber();
  if (Math.abs(diff) > 0) {
    const hppBerasAccount = await tx.account.findFirst({ where: { accountNumber: '5.1' } });
    const cogsAccount = hppBerasAccount || await systemAccounts.getAccount('COGS');
    if (diff > 0) {
      journalItems.push({
        accountId: cogsAccount.id,
        debit: 0,
        credit: diff,
        description: `HPP konversi produksi: ${runNumber}`,
      });
    } else {
      journalItems.push({
        accountId: cogsAccount.id,
        debit: Math.abs(diff),
        credit: 0,
        description: `HPP rugi produksi: ${runNumber}`,
      });
    }
  }

  if (journalItems.length > 0) {
    const journalEntry = await tx.journalEntry.create({
      data: {
        entryNumber: jvNumber,
        date: txDate,
        narration: `Produksi: ${runNumber} — ${inputNames} → ${outputNames}`,
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

    // Aggregate debit/credit per account to batch the balance updates.
    const balanceMap = new Map<string, { debit: number; credit: number }>();
    for (const ji of journalItems) {
      const entry = balanceMap.get(ji.accountId) || { debit: 0, credit: 0 };
      entry.debit += ji.debit;
      entry.credit += ji.credit;
      balanceMap.set(ji.accountId, entry);
    }
    for (const [acctId, bal] of balanceMap) {
      await updateAccountBalance(tx, acctId, bal.debit, bal.credit);
    }
  }

  // Persist line items for audit/record-keeping.
  const lineItems = [
    ...body.inputs.map((i) => ({
      productionRunId: run.id,
      itemId: i.itemId,
      lineType: 'Input',
      quantity: i.quantity,
      unitPrice: null as number | null,
      yieldPct: null as number | null,
      isByProduct: false,
    })),
    ...body.outputs.map((o) => {
      const rPct = totalInputQty > 0 && !o.isByProduct
        ? (o.quantity / totalInputQty) * 100
        : null;
      return {
        productionRunId: run.id,
        itemId: o.itemId,
        lineType: o.isByProduct ? 'ByProduct' : 'Output',
        quantity: o.quantity,
        unitPrice: o.unitPrice ?? null,
        yieldPct: rPct,
        isByProduct: o.isByProduct ?? false,
      };
    }),
  ];
  await tx.productionRunItem.createMany({ data: lineItems });

  return tx.productionRun.findUnique({
    where: { id: run.id },
    include: {
      items: {
        include: {
          item: { select: { id: true, name: true, unit: true, code: true } },
        },
      },
    },
  });
}
