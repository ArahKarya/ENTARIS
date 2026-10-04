import { describe, expect, it } from 'vitest';
import {
  formatQty,
  isInbound,
  itemStockStatus,
  movementCancelBlock,
  movementEditBlock,
  movementTypeLabel,
  referenceTypeLabel,
  splitRunLines,
  toItemExportRows,
} from './inventory-rows';

describe('itemStockStatus', () => {
  it('prefers the server value, else derives out / low / ok', () => {
    expect(itemStockStatus({ currentStock: '0', minimumStock: '0', stockStatus: 'low' })).toBe('low');
    expect(itemStockStatus({ currentStock: '0', minimumStock: '5' })).toBe('out');
    expect(itemStockStatus({ currentStock: '3', minimumStock: '5' })).toBe('low');
    expect(itemStockStatus({ currentStock: '3', minimumStock: '0' })).toBe('ok');
  });
});

describe('movement rules', () => {
  it('blocks edit for STT and production movements, cancel only for STT', () => {
    expect(movementEditBlock({ referenceType: 'GoodsReceipt', isCancelled: false })).toMatch(/STT/);
    expect(movementCancelBlock({ referenceType: 'GoodsReceipt', isCancelled: false })).toMatch(/STT/);
    expect(movementEditBlock({ referenceType: 'ProductionRun', isCancelled: false })).toMatch(/produksi/);
    expect(movementCancelBlock({ referenceType: 'ProductionRun', isCancelled: false })).toBeNull();
    expect(movementEditBlock({ referenceType: null, isCancelled: false })).toBeNull();
    expect(movementCancelBlock({ referenceType: null, isCancelled: true })).not.toBeNull();
  });

  it('labels types, directions and references in Indonesian', () => {
    expect(movementTypeLabel('AdjustmentOut')).toBe('Penyesuaian −');
    expect(isInbound('TransferIn')).toBe(true);
    expect(isInbound('TransferOut')).toBe(false);
    expect(referenceTypeLabel('GoodsReceipt')).toBe('STT');
    expect(referenceTypeLabel('Custom')).toBe('Custom');
    expect(referenceTypeLabel(null)).toBe('');
  });
});

describe('helpers', () => {
  it('formats quantities with up to 3 decimals', () => {
    expect(formatQty('1250.5')).toBe('1.250,5');
    expect(formatQty(null)).toBe('-');
  });

  it('splits production lines into inputs and outputs', () => {
    const { inputs, outputs } = splitRunLines({
      items: [
        { id: '1', lineType: 'Input', quantity: 10 },
        { id: '2', lineType: 'Output', quantity: 6 },
        { id: '3', lineType: 'ByProduct', quantity: 2 },
      ],
    });
    expect(inputs.map((l) => l.id)).toEqual(['1']);
    expect(outputs.map((l) => l.id)).toEqual(['2', '3']);
  });

  it('keeps the import-template export shape', () => {
    expect(
      toItemExportRows([{ id: 'x', code: 'A', name: 'B', unit: 'Kg', currentStock: '5', minimumStock: '1', isActive: true }]),
    ).toEqual([
      { code: 'A', name: 'B', unit: 'Kg', category: '', description: '', currentStock: 5, minimumStock: 1, openingQty: '', openingPrice: '' },
    ]);
  });
});
