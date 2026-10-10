/**
 * Build the production_run_items rows persisted for a posted run (submit and
 * edit share it). Every line carries the production warehouse the run's
 * stock movements used, so the PDF "Gudang Produksi" and the edit prefill
 * can read it from the lines.
 */

export interface RunLineBatchSnapshot {
  sourceMovementId: string | null;
  batchUnitCost: number | null;
}

export interface BuildRunLinesArgs {
  runId: string;
  warehouseId: string;
  inputs: ReadonlyArray<{ itemId: string; quantity: number }>;
  outputs: ReadonlyArray<{ itemId: string; quantity: number; unitPrice?: number | null; isByProduct?: boolean }>;
  /** Batch picked per input index. */
  batchSnapshots: ReadonlyMap<number, RunLineBatchSnapshot>;
  totalInputQty: number;
  /** Loaded HPP per unit of the main output (0 when unknown). */
  computedHppNum: number;
}

export function buildProductionRunLineItems(args: BuildRunLinesArgs) {
  const { runId, warehouseId, totalInputQty, computedHppNum } = args;
  const inputLines = args.inputs.map((inp, idx) => {
    const snapshot = args.batchSnapshots.get(idx) ?? { sourceMovementId: null, batchUnitCost: null };
    return {
      productionRunId: runId,
      itemId: inp.itemId,
      warehouseId,
      lineType: 'Input',
      quantity: inp.quantity,
      unitPrice: null as number | null,
      yieldPct: null as number | null,
      isByProduct: false,
      sourceMovementId: snapshot.sourceMovementId,
      batchUnitCost: snapshot.batchUnitCost,
    };
  });
  const outputLines = args.outputs.map((o) => {
    // Persist the resolved unitPrice (explicit or back-filled from loaded HPP)
    // so downstream queries don't need to redo the math.
    const explicitPrice = o.unitPrice;
    const persistedUnitPrice = o.isByProduct
      ? (explicitPrice ?? null)
      : (explicitPrice != null && explicitPrice > 0
          ? explicitPrice
          : (computedHppNum > 0 ? computedHppNum : null));
    return {
      productionRunId: runId,
      itemId: o.itemId,
      warehouseId,
      lineType: o.isByProduct ? 'ByProduct' : 'Output',
      quantity: o.quantity,
      unitPrice: persistedUnitPrice,
      yieldPct: totalInputQty > 0 && !o.isByProduct ? (o.quantity / totalInputQty) * 100 : null,
      isByProduct: o.isByProduct ?? false,
    };
  });
  return [...inputLines, ...outputLines];
}
