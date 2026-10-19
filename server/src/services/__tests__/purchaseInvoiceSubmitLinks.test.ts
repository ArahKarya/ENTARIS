import { describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../../utils/fiscalYear', () => ({ getOpenFiscalYear: vi.fn(async () => ({ id: 'fy-1' })) }));
vi.mock('../../utils/documentNumber', () => ({ generateDocumentNumber: vi.fn(async () => 'PI-202610-0001') }));
vi.mock('../systemAccounts', () => ({
  systemAccounts: { getAccount: vi.fn(async (role: string) => ({ id: `acc-${role}`, name: role })) },
}));

import { submitPurchaseInvoiceInTx, type SubmitPurchaseInvoiceInput } from '../purchaseInvoiceSubmit';

const STOP = 'STOP_AFTER_CREATE';

function grItem(id: string, grId: string, poId: string | null) {
  return {
    id,
    goodsReceiptId: grId,
    invoiceItem: null,
    goodsReceipt: { id: grId, sttNumber: `STT-${grId}`, status: 'Submitted', isCustomerOwned: false, partyId: 'sup-1', purchaseOrderId: poId },
  };
}

/** Runs the submit until the PI insert and returns the create payload. */
async function captureCreate(input: SubmitPurchaseInvoiceInput, grItems: ReturnType<typeof grItem>[]) {
  const create = vi.fn(async () => {
    throw new Error(STOP);
  });
  const tx = {
    party: { findUnique: vi.fn(async () => ({ id: 'sup-1', isActive: true })) },
    goodsReceiptItem: { findMany: vi.fn(async () => grItems) },
    inventoryItem: { findMany: vi.fn(async () => [{ id: 'inv-1', accountId: null }]) },
    purchaseInvoice: { create },
  } as unknown as Parameters<typeof submitPurchaseInvoiceInTx>[0];
  await expect(submitPurchaseInvoiceInTx(tx, input, 'user-1')).rejects.toThrow(STOP);
  return (create.mock.calls[0] as unknown as [{ data: Record<string, any> }])[0].data;
}

const base = { date: '2026-10-10', partyId: 'sup-1' };
const sttLine = (gri: string) => ({ itemName: 'Gabah', inventoryItemId: 'inv-1', quantity: 10, rate: 100, goodsReceiptItemId: gri });

describe('submitPurchaseInvoiceInTx document links', () => {
  it('sets purchaseOrderId when every billed STT belongs to one PO', async () => {
    const data = await captureCreate(
      { ...base, items: [sttLine('gri-1'), sttLine('gri-2')] },
      [grItem('gri-1', 'gr-1', 'po-1'), grItem('gri-2', 'gr-2', 'po-1')],
    );
    expect(data.purchaseOrderId).toBe('po-1');
  });

  it('leaves purchaseOrderId null for STTs of different POs', async () => {
    const data = await captureCreate(
      { ...base, items: [sttLine('gri-1'), sttLine('gri-2')] },
      [grItem('gri-1', 'gr-1', 'po-1'), grItem('gri-2', 'gr-2', 'po-2')],
    );
    expect(data.purchaseOrderId).toBeNull();
  });

  it('stores itemType per line: STT goods vs service lines', async () => {
    const data = await captureCreate(
      {
        ...base,
        items: [
          sttLine('gri-1'),
          { itemName: 'Jasa angkut', quantity: 1, rate: 50000, itemType: 'service' },
          { itemName: 'Karung', quantity: 5, rate: 2000, itemType: 'product' },
        ],
      },
      [grItem('gri-1', 'gr-1', null)],
    );
    expect(data.purchaseOrderId).toBeNull();
    expect(data.items.create.map((l: { itemType: string }) => l.itemType)).toEqual(['product', 'service', 'product']);
  });
});
