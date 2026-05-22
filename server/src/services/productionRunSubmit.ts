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
  // Phase 2: inputs may carry batch tracking — sourceMovementId links to the
  // inbound StockMovement (batch) picked by staff; batchUnitCost is captured
  // at pick time so production cost is locked even if WAC changes later.
  // Both fields are optional; legacy callers without these fields fall back
  // to WAC-based costing.
  inputs: Array<{
    itemId: string;
    quantity: number;
    sourceMovementId?: string | null;
    batchUnitCost?: number | null;
  }>;
  outputs: Array<{ itemId: string; quantity: number; unitPrice?: number | null; isByProduct?: boolean }>;
  // Phase 3: cost components + HPP loading
  costs?: Array<{
    standardId?: string | null;
    description: string;
    costSide: 'InputSide' | 'OutputSide';
    basis: 'InputQty' | 'OutputQty' | 'Fixed';
    rate: number;
    costAccountId?: string | null;
  }>;
  hppOverride?: number | null;
  // Traceability: which master processes were run (multi-select, optional).
  processIds?: string[];
  notes?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  referenceNumber?: string | null;
  allowNegativeStock?: boolean;
  negativeStockReason?: string | null;
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
      if (!body.allowNegativeStock) {
        throw new BusinessError(
          `Stok '${item.name}' tidak cukup. Tersedia: ${Number(item.currentStock).toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${item.unit}, dibutuhkan: ${input.quantity.toLocaleString('id-ID', { maximumFractionDigits: 3 })} ${input.quantity > 0 ? item.unit : ''}. Buat penerimaan/transfer dulu.`,
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
        'Production input submitted with negative stock bypass',
      );
    }
  }

  for (const output of body.outputs) {
    const item = itemMap.get(output.itemId);
    if (!item) throw new BusinessError('Item output tidak ditemukan.');
    if (!item.isActive) throw new BusinessError(`Item output '${item.name}' tidak aktif.`);
    // Main output unitPrice is OPTIONAL — auto-filled from computed loaded
    // HPP later in the flow. Only by-products still need explicit NRV.
    if (output.isByProduct && (output.unitPrice == null || output.unitPrice < 0)) {
      throw new BusinessError(`NRV '${item.name}' wajib diisi (minimal 0).`);
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

  // Phase 2: validate batch references before committing side effects.
  // sourceMovementId, when provided, must reference a non-cancelled inbound
  // movement of the same item. We do NOT enforce per-batch remaining qty here
  // (race-prone in concurrent submits); the UI batch picker filters by
  // available qty and the global currentStock guard above handles total stock.
  const batchSnapshots = new Map<number, { sourceMovementId: string | null; batchUnitCost: number | null }>();
  for (let i = 0; i < body.inputs.length; i++) {
    const input = body.inputs[i]!;
    if (!input.sourceMovementId) {
      batchSnapshots.set(i, { sourceMovementId: null, batchUnitCost: null });
      continue;
    }
    const batch = await tx.stockMovement.findUnique({
      where: { id: input.sourceMovementId },
      select: {
        id: true, itemId: true, isCancelled: true, movementType: true,
        unitCost: true, quantity: true,
      },
    });
    if (!batch) {
      throw new BusinessError(`Batch sumber tidak ditemukan untuk input ke-${i + 1}.`);
    }
    if (batch.itemId !== input.itemId) {
      throw new BusinessError(`Batch sumber tidak cocok dengan item input ke-${i + 1}.`);
    }
    if (batch.isCancelled) {
      throw new BusinessError(`Batch sumber sudah dibatalkan (input ke-${i + 1}).`);
    }
    if (batch.movementType !== 'In' && batch.movementType !== 'AdjustmentIn') {
      throw new BusinessError(`Batch sumber bukan stok masuk (input ke-${i + 1}).`);
    }
    // Prefer client-supplied batchUnitCost (captured at pick time); fall back
    // to the batch's stored unitCost for robustness.
    const snapshotCost = input.batchUnitCost != null && input.batchUnitCost >= 0
      ? Number(input.batchUnitCost)
      : Number(batch.unitCost);
    batchSnapshots.set(i, {
      sourceMovementId: batch.id,
      batchUnitCost: snapshotCost,
    });
  }

  // Inputs: stock-out + StockMovement Out
  let totalInputValue = new Decimal(0);
  let totalMaterialCost = new Decimal(0);
  for (let i = 0; i < body.inputs.length; i++) {
    const input = body.inputs[i]!;
    const item = itemMap.get(input.itemId);
    if (!item) continue;
    const snapshot = batchSnapshots.get(i)!;
    // When a batch is picked, use its snapshot cost (locked). Otherwise fall
    // back to WAC (legacy behavior).
    const inputUnitCost = snapshot.batchUnitCost != null
      ? snapshot.batchUnitCost
      : (Number(item.averageCost) > 0 ? Number(item.averageCost) : 0);
    const inputTotalValue = new Decimal(input.quantity).mul(new Decimal(inputUnitCost)).toDecimalPlaces(2).toNumber();
    totalInputValue = totalInputValue.plus(new Decimal(inputTotalValue));
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
        // Phase 5: universal batch back-link, so /items/:id/batches can sum
        // all outbound consumption regardless of source (production / sales /
        // transfer / adjustment).
        sourceMovementId: snapshot.sourceMovementId,
        referenceType: 'ProductionRun',
        referenceId: run.id,
        referenceNumber: runNumber,
        notes: body.notes || null,
        fiscalYearId: fiscalYear.id,
        createdById: userId,
      },
    });
  }

  // ─── Phase 3: pre-compute loaded HPP (informational, no GL impact) ─────────
  // Cost components are snapshots (rate × qtyBasis based on basis). Resolve
  // qtyBasis BEFORE creating the output stock movements so the loaded HPP can
  // be set as unit_cost_loaded for main outputs at insertion time.
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
    else qtyBasis = new Decimal(1); // Fixed: rate IS the total
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

  // Loaded HPP per Kg of main output. When override supplied (≥0), use it
  // verbatim; otherwise auto-compute. NaN-safe: returns null when no main
  // output qty (defensive — schema requires at least one output).
  let computedHpp: Decimal | null = null;
  const hppOverridden = body.hppOverride != null && body.hppOverride >= 0;
  if (hppOverridden) {
    computedHpp = new Decimal(body.hppOverride!);
  } else if (totalMainOutputQtyDec.gt(0)) {
    const numerator = totalMaterialCost
      .plus(totalCostInputSide)
      .plus(totalCostOutputSide)
      .minus(totalByproductValue);
    computedHpp = numerator.div(totalMainOutputQtyDec).toDecimalPlaces(4);
  }

  // Outputs: stock-in + StockMovement In + WAC recalc + COGS backfill settlement
  let totalOutputValue = new Decimal(0);
  // Main outputs may omit unitPrice — when so, back-fill it with the loaded
  // HPP we just computed so WAC + GL posting stay balanced. Byproducts
  // always carry their explicit NRV via output.unitPrice.
  const computedHppNum = computedHpp ? computedHpp.toNumber() : 0;
  for (const output of body.outputs) {
    const outputItem = await tx.inventoryItem.findUnique({ where: { id: output.itemId } });
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
    totalOutputValue = totalOutputValue.plus(new Decimal(totalValue));

    // Loaded HPP per Kg: main outputs share the computedHpp; byproducts carry
    // their unitPrice (NRV) which is also what was used to deduct from the
    // main HPP. This way unit_cost_loaded is internally consistent across the
    // run and downstream margin reports can read it directly.
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
  for (let i = 0; i < body.inputs.length; i++) {
    const input = body.inputs[i]!;
    const item = itemMap.get(input.itemId);
    if (!item) continue;
    const snapshot = batchSnapshots.get(i)!;
    const inputUnitCost = snapshot.batchUnitCost != null
      ? snapshot.batchUnitCost
      : (Number(item.averageCost) > 0 ? Number(item.averageCost) : 0);
    const val = new Decimal(input.quantity)
      .mul(new Decimal(inputUnitCost))
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
    // Same back-fill rule as the stockMovement loop: main outputs without an
    // explicit unitPrice borrow the loaded HPP so DR/CR stays balanced.
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
  const inputLineItems = body.inputs.map((inp, idx) => {
    const snapshot = batchSnapshots.get(idx)!;
    return {
      productionRunId: run.id,
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
    const rPct = totalInputQty > 0 && !o.isByProduct
      ? (o.quantity / totalInputQty) * 100
      : null;
    // Persist the resolved unitPrice (explicit or back-filled from loaded HPP)
    // so downstream queries don't need to redo the math.
    const explicitPrice = o.unitPrice;
    const persistedUnitPrice = o.isByProduct
      ? (explicitPrice ?? null)
      : (explicitPrice != null && explicitPrice > 0
          ? explicitPrice
          : (computedHppNum > 0 ? computedHppNum : null));
    return {
      productionRunId: run.id,
      itemId: o.itemId,
      lineType: o.isByProduct ? 'ByProduct' : 'Output',
      quantity: o.quantity,
      unitPrice: persistedUnitPrice,
      yieldPct: rPct,
      isByProduct: o.isByProduct ?? false,
    };
  });
  await tx.productionRunItem.createMany({ data: [...inputLineItems, ...outputLineItems] });

  // Phase 3: persist cost component snapshots + HPP breakdown on the run.
  if (resolvedCosts.length > 0) {
    await tx.productionRunCost.createMany({
      data: resolvedCosts.map((c) => ({
        productionRunId: run.id,
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

  await tx.productionRun.update({
    where: { id: run.id },
    data: {
      totalMaterialCost: totalMaterialCost.toDecimalPlaces(4).toNumber(),
      totalCostInputSide: totalCostInputSide.toDecimalPlaces(4).toNumber(),
      totalCostOutputSide: totalCostOutputSide.toDecimalPlaces(4).toNumber(),
      totalByproductValue: totalByproductValue.toDecimalPlaces(4).toNumber(),
      computedHpp: computedHpp ? computedHpp.toNumber() : null,
      hppManualOverride: hppOverridden,
    },
  });

  // Traceability: persist process selections (junction). Dedupe defensively.
  if (body.processIds && body.processIds.length > 0) {
    const uniqueIds = Array.from(new Set(body.processIds));
    await tx.productionRunProcess.createMany({
      data: uniqueIds.map(processId => ({ productionRunId: run.id, processId })),
      skipDuplicates: true,
    });
  }

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
