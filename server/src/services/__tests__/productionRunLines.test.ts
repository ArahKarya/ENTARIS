import { describe, expect, it } from 'vitest';
import { buildProductionRunLineItems } from '../productionRunLines';

describe('buildProductionRunLineItems', () => {
  const base = {
    runId: 'run-1',
    warehouseId: 'wh-prod',
    inputs: [{ itemId: 'gkp', quantity: 1000 }],
    outputs: [
      { itemId: 'beras', quantity: 600, unitPrice: null },
      { itemId: 'dedak', quantity: 100, unitPrice: 1500, isByProduct: true },
    ],
    batchSnapshots: new Map([[0, { sourceMovementId: 'sm-batch', batchUnitCost: 6000 }]]),
    totalInputQty: 1000,
    computedHppNum: 9500,
  };

  it('stamps the production warehouse on every input and output line', () => {
    const lines = buildProductionRunLineItems(base);
    expect(lines).toHaveLength(3);
    expect(lines.every((l) => l.warehouseId === 'wh-prod')).toBe(true);
    expect(lines.every((l) => l.productionRunId === 'run-1')).toBe(true);
  });

  it('keeps batch, yield and resolved price semantics', () => {
    const [input, main, byProduct] = buildProductionRunLineItems(base);
    expect(input).toMatchObject({ lineType: 'Input', sourceMovementId: 'sm-batch', batchUnitCost: 6000, unitPrice: null });
    expect(main).toMatchObject({ lineType: 'Output', unitPrice: 9500, yieldPct: 60, isByProduct: false });
    expect(byProduct).toMatchObject({ lineType: 'ByProduct', unitPrice: 1500, yieldPct: null, isByProduct: true });
  });

  it('falls back to an empty batch snapshot for unpicked inputs', () => {
    const [input] = buildProductionRunLineItems({ ...base, batchSnapshots: new Map() });
    expect(input).toMatchObject({ sourceMovementId: null, batchUnitCost: null });
  });
});
