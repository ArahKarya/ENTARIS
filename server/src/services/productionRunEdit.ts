import type { Prisma } from '@prisma/client';
import Decimal from 'decimal.js';
import { BusinessError } from '../utils/errors';
import { recalculateAccountBalances } from '../utils/accountBalance';
import { cancelJournalsByPrefix } from '../utils/journalCancel';
import { reverseCogsSettlementsByTrigger } from './cogsBackfillReverse';
import { generateDocumentNumber } from '../utils/documentNumber';
import { calcWeightedAverage } from '../utils/weightedAverage';
import { recomputeAverageCostFromReplay } from './averageCostRecompute';
import { resolveWarehouseId, adjustWarehouseStock } from '../utils/warehouseStock';
import { systemAccounts } from './systemAccounts';
import { settleCogsBackfillForItem } from './cogsBackfillService';
import type { SubmitProductionRunInput } from './productionRunSubmit';
import { persistOeeInTx } from './oee';
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
  // 1. Load existing ───────────────────────────────────────────
  const oldRun = await tx.productionRun.findUnique({
    where: { id: runId },
    include: { items: { include: { item: true } } },
  });
  if (!oldRun) throw new BusinessError('Data proses produksi tidak ditemukan.');
  if (oldRun.isCancelled) throw new BusinessError('Proses produksi yang sudah dibatalkan tidak bisa diedit.');

  // 2. Reverse old stock movements ─────────────────────────────
  const oldMovements = await tx.stockMovement.findMany({
    where: { referenceType: 'ProductionRun', referenceId: runId, isCancelled: false },
    include: { item: true },
  });

  const affectedItemIds = new Set<string>();
  for (const mov of oldMovements) {
    const isIn = mov.movementType === 'In' || mov.movementType === 'AdjustmentIn';
    const isOut = mov.movementType === 'Out' || mov.movementType === 'AdjustmentOut';
    const qty = Number(mov.quantity);

    if (isIn && Number(mov.item.currentStock) < qty) {
      if (!body.allowNegativeStock) {
        throw new BusinessError(
          `Tidak dapat mengedit: stok '${mov.item.name}' tidak mencukupi untuk pembalikan output (tersedia ${Number(mov.item.currentStock)}, perlu ${qty}). Output sudah dipakai produksi/penjualan berikutnya.`,
        );
      }
      logger.warn(
        {
          itemId: mov.itemId,
          itemName: mov.item.name,
          currentStock: Number(mov.item.currentStock),
          reverseQty: qty,
          reason: body.negativeStockReason,
        },
        'Production edit reverse with negative stock bypass',
      );
    }
    affectedItemIds.add(mov.itemId);

    const reverseDelta = isOut ? qty : -qty;
    await tx.inventoryItem.update({
      where: { id: mov.itemId },
      data: { currentStock: { increment: reverseDelta } },
    });
    await adjustWarehouseStock(tx, mov.itemId, mov.warehouseId, reverseDelta);
    await tx.stockMovement.update({ where: { id: mov.id }, data: { isCancelled: true } });
  }

  // 3. Recompute WAC by REPLAYING remaining active movements ───
  // (input items too: re-instating consumed stock changes the base that later
  // inbound movements were blended against). Historical COGS stays untouched.
  for (const itemId of affectedItemIds) {
    await recomputeAverageCostFromReplay(tx, itemId);
  }

  // 4. Cancel ALL active journals for this run (incl. earlier revisions) ─
  const oldJvNumber = `JV-${oldRun.runNumber}`;
  await cancelJournalsByPrefix(tx, oldJvNumber);
  // Balik auto-settle COGS lama sebelum settle ulang dari data baru (hindari numpuk ganda)
  await reverseCogsSettlementsByTrigger(tx, 'ProductionRun', runId);

  // 5. Delete old line items + old cost components (Phase 3) ─────────────
  await tx.productionRunItem.deleteMany({ where: { productionRunId: runId } });
  await tx.productionRunCost.deleteMany({ where: { productionRunId: runId } });
  await tx.productionRunProcess.deleteMany({ where: { productionRunId: runId } });
  // OEE: clear old downtime + per-machine rows; recreated from the new payload below.
  await tx.productionDowntime.deleteMany({ where: { productionRunId: runId } });
  await tx.productionRunMachine.deleteMany({ where: { productionRunId: runId } });

  // 6. Re-apply with new data ───────────────────────────────────
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
      if (!body.allowNegativeStock) {
        throw new BusinessError(
          `Stok '${item.name}' tidak cukup. Tersedia: ${Number(item.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${item.unit}, dibutuhkan: ${input.quantity.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${item.unit}. Buat penerimaan/transfer dulu.`,
        );
      }
      logger.warn(
        {
          itemId: item.id,
          itemName: item.name,
          currentStock: Number(item.currentStock),
          requested: input.quantity,
          reason: body.negativeStockReason,
        },
        'Production edit input with negative stock bypass',
      );
    }
  }
  for (const output of body.outputs) {
    const item = itemMap.get(output.itemId);
    if (!item) throw new BusinessError('Item output tidak ditemukan.');
    if (!item.isActive) throw new BusinessError(`Item output '${item.name}' tidak aktif.`);
    // Harga output utama BOLEH kosong/0: server akan back-fill dari loaded HPP
    // (computedHpp) persis seperti productionRunSubmit. Pada model maklon
    // (bahan titipan, cost 0 + NRV by-product > total biaya) HPP produk utama
    // memang Rp0 dan itu benar secara ekonomi. Yang dilarang cuma nilai negatif.
    if (!output.isByProduct && output.unitPrice != null && output.unitPrice < 0) {
      throw new BusinessError(`Harga/HPP '${item.name}' tidak boleh negatif.`);
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
      // OEE capture fields (additive) — B2 multi-machine. Cleared when omitted.
      // Legacy single machineId/startAt/endAt kept for backward compat only.
      machineId: body.machineId ?? null,
      shift: body.shift ?? null,
      shiftLead: body.shiftLead ?? null,
      manpowerCount: body.manpowerCount ?? null,
      startAt: body.startAt ? new Date(body.startAt) : null,
      endAt: body.endAt ? new Date(body.endAt) : null,
      plannedStart: body.plannedStart ? new Date(body.plannedStart) : null,
      plannedEnd: body.plannedEnd ? new Date(body.plannedEnd) : null,
      breakStart: body.breakStart ? new Date(body.breakStart) : null,
      breakEnd: body.breakEnd ? new Date(body.breakEnd) : null,
      // good_qty/reject_qty columns are LEGACY (unused). OEE Quality/output is
      // now derived from the run's item lines — see persistOeeInTx below.
      fiscalYearId: fiscalYear.id,
    },
  });

  const productionWarehouseId = await resolveWarehouseId(tx, body.warehouseId);
  if (!productionWarehouseId) {
    throw new BusinessError(
      'Gudang produksi wajib dipilih. Pilih gudang di form atau set salah satu gudang sebagai default.',
    );
  }

  // Phase 2: batch validation + cost snapshot (mirrors submit service).
  const batchSnapshots = new Map<number, { sourceMovementId: string | null; batchUnitCost: number | null }>();
  for (let i = 0; i < body.inputs.length; i++) {
    const input = body.inputs[i]!;
    if (!input.sourceMovementId) {
      batchSnapshots.set(i, { sourceMovementId: null, batchUnitCost: null });
      continue;
    }
    const batch = await tx.stockMovement.findUnique({
      where: { id: input.sourceMovementId },
      select: { id: true, itemId: true, isCancelled: true, movementType: true, unitCost: true },
    });
    if (!batch) throw new BusinessError(`Batch sumber tidak ditemukan untuk input ke-${i + 1}.`);
    if (batch.itemId !== input.itemId) throw new BusinessError(`Batch sumber tidak cocok dengan item input ke-${i + 1}.`);
    if (batch.isCancelled) throw new BusinessError(`Batch sumber sudah dibatalkan (input ke-${i + 1}).`);
    // TransferIn juga sah (lihat productionRunSubmit) — stok hasil transfer
    // antar-gudang adalah batch input yang valid.
    if (batch.movementType !== 'In' && batch.movementType !== 'AdjustmentIn' && batch.movementType !== 'TransferIn') {
      throw new BusinessError(`Batch sumber bukan stok masuk (input ke-${i + 1}).`);
    }
    const snapshotCost = input.batchUnitCost != null && input.batchUnitCost >= 0
      ? Number(input.batchUnitCost)
      : Number(batch.unitCost);
    batchSnapshots.set(i, { sourceMovementId: batch.id, batchUnitCost: snapshotCost });
  }

  // Inputs
  let totalMaterialCost = new Decimal(0);
  for (let i = 0; i < body.inputs.length; i++) {
    const input = body.inputs[i]!;
    const item = itemMap.get(input.itemId);
    if (!item) continue;
    const snapshot = batchSnapshots.get(i)!;
    const inputUnitCost = snapshot.batchUnitCost != null
      ? snapshot.batchUnitCost
      : (Number(item.averageCost) > 0 ? Number(item.averageCost) : 0);
    const inputTotalValue = new Decimal(input.quantity).mul(new Decimal(inputUnitCost)).toDecimalPlaces(2).toNumber();
    totalMaterialCost = totalMaterialCost.plus(new Decimal(inputTotalValue));

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
        sourceMovementId: snapshot.sourceMovementId,
        referenceType: 'ProductionRun',
        referenceId: runId,
        referenceNumber: oldRun.runNumber,
        notes: body.notes || null,
        fiscalYearId: fiscalYear.id,
        createdById: userId,
      },
    });
  }

  // Phase 3: pre-compute loaded HPP for the revision
  // Mirrors productionRunSubmit. Cost snapshots use the edited inputs/outputs.
  const totalInputQtyDec = body.inputs.reduce(
    (s, i) => s.plus(new Decimal(i.quantity)),
    new Decimal(0),
  );
  const totalMainOutputQtyDec = body.outputs
    .filter((o) => !o.isByProduct)
    .reduce((s, o) => s.plus(new Decimal(o.quantity)), new Decimal(0));

  const resolvedCosts = (body.costs ?? []).map((c) => {
    let qtyBasis: Decimal;
    if (c.basis === 'InputQty') qtyBasis = totalInputQtyDec;
    else if (c.basis === 'OutputQty') qtyBasis = totalMainOutputQtyDec;
    else qtyBasis = new Decimal(1);
    const totalAmount = new Decimal(c.rate).mul(qtyBasis).toDecimalPlaces(4);
    return { ...c, qtyBasis, totalAmount };
  });

  const totalCostInputSide = resolvedCosts
    .filter((c) => c.costSide === 'InputSide')
    .reduce((s, c) => s.plus(c.totalAmount), new Decimal(0));
  const totalCostOutputSide = resolvedCosts
    .filter((c) => c.costSide === 'OutputSide')
    .reduce((s, c) => s.plus(c.totalAmount), new Decimal(0));

  const totalByproductValue = body.outputs
    .filter((o) => o.isByProduct)
    .reduce(
      (s, o) =>
        s.plus(new Decimal(o.quantity).mul(new Decimal(o.unitPrice ?? 0))),
      new Decimal(0),
    );

  let computedHpp: Decimal | null = null;
  const hppOverridden = body.hppOverride != null && body.hppOverride >= 0;
  if (hppOverridden) {
    computedHpp = new Decimal(body.hppOverride!);
  } else if (totalMainOutputQtyDec.gt(0)) {
    const numerator = totalMaterialCost
      .plus(totalCostInputSide)
      .plus(totalCostOutputSide)
      .minus(totalByproductValue);
    // Guard H1 (samakan dgn productionRunSubmit): kalau NRV by-product melebihi
    // total biaya, numerator negatif → HPP negatif akan merusak WAC/GL output
    // utama. Clamp ke 0 + warn; operator harus review NRV by-product.
    if (numerator.lt(0)) {
      logger.warn(
        {
          runId,
          totalMaterialCost: totalMaterialCost.toString(),
          totalCostInputSide: totalCostInputSide.toString(),
          totalCostOutputSide: totalCostOutputSide.toString(),
          totalByproductValue: totalByproductValue.toString(),
        },
        'Edit: loaded HPP numerator negative (by-product NRV > total cost) — clamped to 0',
      );
      computedHpp = new Decimal(0);
    } else {
      computedHpp = numerator.div(totalMainOutputQtyDec).toDecimalPlaces(4);
    }
  }
  const computedHppNum = computedHpp ? computedHpp.toNumber() : 0;

  // Outputs
  for (const output of body.outputs) {
    const outputItem = await tx.inventoryItem.findUnique({ where: { id: output.itemId } });
    // Back-fill main-output unitPrice from computed loaded HPP when omitted.
    const explicitPrice = output.unitPrice;
    const unitCost = output.isByProduct
      ? (explicitPrice ?? 0)
      : (explicitPrice != null && explicitPrice > 0 ? explicitPrice : computedHppNum);
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

    const unitCostLoaded = output.isByProduct
      ? unitCost
      : (computedHpp ? computedHpp.toNumber() : null);

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
        unitCostLoaded,
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

  // 7. Build & post revision JE ─────────────────────────────────
  const defaultInvAccount = await systemAccounts.getAccount('INVENTORY');
  const inputNames = body.inputs.map((i) => itemMap.get(i.itemId)?.name || '').join(', ');
  const outputNames = body.outputs.map((o) => itemMap.get(o.itemId)?.name || '').join(', ');

  const journalItems: { accountId: string; debit: number; credit: number; description: string }[] = [];

  let totalInputCost = new Decimal(0);
  for (let i = 0; i < body.inputs.length; i++) {
    const input = body.inputs[i]!;
    const item = itemMap.get(input.itemId);
    if (!item) continue;
    const snapshot = batchSnapshots.get(i)!;
    const inputUnitCost = snapshot.batchUnitCost != null
      ? snapshot.batchUnitCost
      : (Number(item.averageCost) > 0 ? Number(item.averageCost) : 0);
    const val = new Decimal(input.quantity).mul(new Decimal(inputUnitCost)).toDecimalPlaces(2).toNumber();
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
    // Same back-fill rule as the stockMovement loop above.
    const explicitPrice = output.unitPrice;
    const unitCost = output.isByProduct
      ? (explicitPrice ?? 0)
      : (explicitPrice != null && explicitPrice > 0 ? explicitPrice : computedHppNum);
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

  // Selisih: lihat aturan di productionRunSubmit.ts (5.12 s.d. biaya konversi, sisa 5.1).
  const diff = totalOutputCost.minus(totalInputCost).toDecimalPlaces(2).toNumber();
  if (Math.abs(diff) > 0) {
    const hppBerasAccount = await tx.account.findFirst({ where: { accountNumber: '5.1' } });
    const cogsAccount = hppBerasAccount || await systemAccounts.getAccount('COGS');
    if (diff > 0) {
      const conversionAccount = await tx.account.findFirst({ where: { accountNumber: '5.12', isActive: true } });
      const convCost = totalCostInputSide.plus(totalCostOutputSide).toDecimalPlaces(2).toNumber();
      const to512 = conversionAccount ? Math.min(diff, Math.max(convCost, 0)) : 0;
      const to51 = new Decimal(diff).minus(to512).toDecimalPlaces(2).toNumber();
      if (to512 > 0) {
        journalItems.push({
          accountId: conversionAccount!.id,
          debit: 0,
          credit: to512,
          description: `Biaya konversi dibebankan: ${oldRun.runNumber}`,
        });
      }
      if (to51 > 0) {
        journalItems.push({
          accountId: cogsAccount.id,
          debit: 0,
          credit: to51,
          description: `HPP konversi produksi: ${oldRun.runNumber}`,
        });
      }
    } else {
      journalItems.push({
        accountId: cogsAccount.id,
        debit: Math.abs(diff),
        credit: 0,
        description: `HPP rugi produksi: ${oldRun.runNumber}`,
      });
    }
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
        narration: `Produksi (revisi): ${oldRun.runNumber} (${inputNames} → ${outputNames})`,
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

  // 8. Recompute balances from authoritative JE sums ────────────
  const allRelatedJEItems = await tx.journalItem.findMany({
    where: { journalEntry: { entryNumber: { startsWith: oldJvNumber } } },
    select: { accountId: true },
  });
  const affectedAccountIds = [...new Set(allRelatedJEItems.map((ji) => ji.accountId))];
  if (affectedAccountIds.length > 0) {
    await recalculateAccountBalances(tx, affectedAccountIds);
  }

  // Persist new line items ──────────────────────────────────────
  const inputLineItems = body.inputs.map((inp, idx) => {
    const snapshot = batchSnapshots.get(idx)!;
    return {
      productionRunId: runId,
      itemId: inp.itemId,
      lineType: 'Input',
      quantity: inp.quantity,
      unitPrice: null as number | null,
      yieldPct: null as number | null,
      isByProduct: false,
      sourceMovementId: snapshot.sourceMovementId,
      batchUnitCost: snapshot.batchUnitCost,
    };
  });
  const outputLineItems = body.outputs.map((o) => {
    const explicitPrice = o.unitPrice;
    const persistedUnitPrice = o.isByProduct
      ? (explicitPrice ?? null)
      : (explicitPrice != null && explicitPrice > 0
          ? explicitPrice
          : (computedHppNum > 0 ? computedHppNum : null));
    return {
    productionRunId: runId,
    itemId: o.itemId,
    lineType: o.isByProduct ? 'ByProduct' : 'Output',
    quantity: o.quantity,
    unitPrice: persistedUnitPrice,
    yieldPct: totalInputQty > 0 && !o.isByProduct ? (o.quantity / totalInputQty) * 100 : null,
    isByProduct: o.isByProduct ?? false,
    };
  });
  await tx.productionRunItem.createMany({ data: [...inputLineItems, ...outputLineItems] });

  // Phase 3: persist cost component snapshots + HPP breakdown on the run.
  if (resolvedCosts.length > 0) {
    await tx.productionRunCost.createMany({
      data: resolvedCosts.map((c) => ({
        productionRunId: runId,
        standardId: c.standardId ?? null,
        description: c.description,
        costSide: c.costSide,
        basis: c.basis,
        rate: c.rate,
        qtyBasis: c.qtyBasis.toDecimalPlaces(3).toNumber(),
        totalAmount: c.totalAmount.toNumber(),
        costAccountId: c.costAccountId ?? null,
      })),
    });
  }

  // OEE (B2 multi-machine): recreate downtime + machine rows, recompute
  // Quality/output DERIVED from the run's item lines (no manual good/reject).
  // Old rows already cleared in step 5 above.
  const oeeSampingQty = body.outputs
    .filter((o) => o.isByProduct)
    .reduce((s, o) => s + o.quantity, 0);
  await persistOeeInTx(tx, runId, {
    plannedStart: body.plannedStart,
    plannedEnd: body.plannedEnd,
    breakStart: body.breakStart,
    breakEnd: body.breakEnd,
    runMachines: body.runMachines,
    downtimes: body.downtimes,
    inputQty: totalInputQty,
    produkQty: totalMainOutputQty,
    sampingQty: oeeSampingQty,
  });

  await tx.productionRun.update({
    where: { id: runId },
    data: {
      totalMaterialCost: totalMaterialCost.toDecimalPlaces(4).toNumber(),
      totalCostInputSide: totalCostInputSide.toDecimalPlaces(4).toNumber(),
      totalCostOutputSide: totalCostOutputSide.toDecimalPlaces(4).toNumber(),
      totalByproductValue: totalByproductValue.toDecimalPlaces(4).toNumber(),
      computedHpp: computedHpp ? computedHpp.toNumber() : null,
      hppManualOverride: hppOverridden,
    },
  });

  // Re-persist process selections (already cleared above).
  if (body.processIds && body.processIds.length > 0) {
    const uniqueIds = Array.from(new Set(body.processIds));
    await tx.productionRunProcess.createMany({
      data: uniqueIds.map(processId => ({ productionRunId: runId, processId })),
      skipDuplicates: true,
    });
  }

  return tx.productionRun.findUnique({
    where: { id: runId },
    include: {
      items: { include: { item: { select: { id: true, name: true, unit: true, code: true } } } },
    },
  });
}
