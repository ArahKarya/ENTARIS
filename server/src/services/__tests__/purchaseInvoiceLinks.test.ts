import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
// Reaching the fiscal year lookup means the edit guard let the PO through.
vi.mock('../../utils/fiscalYear', () => ({
  getOpenFiscalYear: vi.fn(async () => {
    throw new Error('GUARD_PASSED');
  }),
}));

import {
  purchaseInvoicesOfPoWhere,
  resolvePurchaseLineType,
  resolvePurchaseOrderIdFromReceipts,
} from '../purchaseInvoiceLinks';
import { updatePurchaseOrderInTx } from '../purchaseOrderSubmit';

describe('resolvePurchaseOrderIdFromReceipts', () => {
  it('returns the PO when every STT points to the same one', () => {
    expect(resolvePurchaseOrderIdFromReceipts([{ purchaseOrderId: 'po-1' }, { purchaseOrderId: 'po-1' }])).toBe('po-1');
  });
  it('leaves null for mixed POs, an STT without PO, or no STT', () => {
    expect(resolvePurchaseOrderIdFromReceipts([{ purchaseOrderId: 'po-1' }, { purchaseOrderId: 'po-2' }])).toBeNull();
    expect(resolvePurchaseOrderIdFromReceipts([{ purchaseOrderId: 'po-1' }, { purchaseOrderId: null }])).toBeNull();
    expect(resolvePurchaseOrderIdFromReceipts([])).toBeNull();
  });
});

describe('resolvePurchaseLineType', () => {
  it('inventory and STT lines are always goods', () => {
    expect(resolvePurchaseLineType({ itemType: 'service', inventoryItemId: 'inv-1' })).toBe('product');
    expect(resolvePurchaseLineType({ itemType: 'service', goodsReceiptItemId: 'gri-1' })).toBe('product');
  });
  it('free lines follow the client flag, defaulting to goods', () => {
    expect(resolvePurchaseLineType({ itemType: 'service' })).toBe('service');
    expect(resolvePurchaseLineType({ itemType: 'product' })).toBe('product');
    expect(resolvePurchaseLineType({})).toBe('product');
  });
});

// Minimal in-memory evaluator for the PI-of-PO where clause.
interface FakePi {
  status: string;
  purchaseOrderId: string | null;
  headerReceiptPoIds: Array<string | null>;
  lineReceiptPoIds: Array<string | null>;
}
function countPis(pis: FakePi[], where: ReturnType<typeof purchaseInvoicesOfPoWhere>): number {
  const poId = where.OR[0].purchaseOrderId as string;
  return pis.filter(
    (pi) =>
      pi.status !== where.status.not &&
      (pi.purchaseOrderId === poId || pi.headerReceiptPoIds.includes(poId) || pi.lineReceiptPoIds.includes(poId)),
  ).length;
}

function makeTx(pis: FakePi[]) {
  const piCount = vi.fn(async ({ where }: { where: ReturnType<typeof purchaseInvoicesOfPoWhere> }) => countPis(pis, where));
  const tx = {
    purchaseOrder: {
      findUnique: vi.fn(async () => ({
        id: 'po-1',
        status: 'Submitted',
        approvalStatus: null,
        closedAt: null,
        grandTotal: 1000,
        totalEstimated: 1000,
        items: [{ qtyReceived: 0 }],
      })),
      update: vi.fn(),
    },
    // No active STT: the PI link is the only thing that may block the edit.
    goodsReceipt: { count: vi.fn(async () => 0) },
    purchaseInvoice: { count: piCount },
    purchaseOrderItem: { deleteMany: vi.fn() },
  };
  return { tx: tx as unknown as Parameters<typeof updatePurchaseOrderInTx>[0], piCount, txRaw: tx };
}

const editBody = {
  date: '2026-10-10',
  partyId: 'sup-1',
  items: [{ itemName: 'Gabah', quantity: 10, rate: 100 }],
} as unknown as Parameters<typeof updatePurchaseOrderInTx>[2];

describe('updatePurchaseOrderInTx PI guard', () => {
  it('blocks editing a PO billed by a PI linked directly', async () => {
    const { tx, txRaw } = makeTx([
      { status: 'Submitted', purchaseOrderId: 'po-1', headerReceiptPoIds: [], lineReceiptPoIds: [] },
    ]);
    await expect(updatePurchaseOrderInTx(tx, 'po-1', editBody)).rejects.toThrow('Purchase Invoice');
    expect(txRaw.purchaseOrderItem.deleteMany).not.toHaveBeenCalled();
  });

  it('blocks editing a PO billed through an STT line of that PO (no header link)', async () => {
    const { tx, piCount, txRaw } = makeTx([
      { status: 'Submitted', purchaseOrderId: null, headerReceiptPoIds: [], lineReceiptPoIds: ['po-1'] },
    ]);
    await expect(updatePurchaseOrderInTx(tx, 'po-1', editBody)).rejects.toThrow('Purchase Invoice');
    const where = piCount.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      items: { some: { goodsReceiptItem: { goodsReceipt: { purchaseOrderId: 'po-1' } } } },
    });
    expect(txRaw.purchaseOrderItem.deleteMany).not.toHaveBeenCalled();
  });

  it('blocks editing via the STT header link too', async () => {
    const { tx } = makeTx([
      { status: 'Submitted', purchaseOrderId: null, headerReceiptPoIds: ['po-1'], lineReceiptPoIds: [] },
    ]);
    await expect(updatePurchaseOrderInTx(tx, 'po-1', editBody)).rejects.toThrow('Purchase Invoice');
  });

  it('ignores cancelled PIs and PIs of other POs', async () => {
    const { tx, piCount } = makeTx([
      { status: 'Cancelled', purchaseOrderId: 'po-1', headerReceiptPoIds: [], lineReceiptPoIds: ['po-1'] },
      { status: 'Submitted', purchaseOrderId: 'po-2', headerReceiptPoIds: ['po-2'], lineReceiptPoIds: ['po-2'] },
    ]);
    await expect(updatePurchaseOrderInTx(tx, 'po-1', editBody)).rejects.toThrow('GUARD_PASSED');
    expect(await piCount.mock.results[0].value).toBe(0);
  });
});
