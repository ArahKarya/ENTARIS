/**
 * Document-generated stock movements store the counter account ("akun lawan")
 * their own journal (or the invoice's COGS journal for DO) posts against.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../utils/documentNumber', () => ({ generateDocumentNumber: vi.fn(async (_tx, prefix: string) => `${prefix}-202610-0001`) }));
vi.mock('../../utils/accountBalance', () => ({
  updateAccountBalance: vi.fn(async () => undefined),
  recalcPartyOutstanding: vi.fn(async () => undefined),
}));
vi.mock('../../utils/fiscalYear', () => ({ getOpenFiscalYear: vi.fn(async () => ({ id: 'fy-2026' })) }));
vi.mock('../../lib/logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const ACCOUNTS: Record<string, string> = {
  INVENTORY: 'acc-inv',
  ACCRUED_PAYABLE: 'acc-2.1.5',
  AR: 'acc-ar',
  CUSTOMER_DEPOSIT: 'acc-dep',
  COGS: 'acc-5',
  TAX_OUTPUT: 'acc-ppn',
};
vi.mock('../systemAccounts', () => ({
  systemAccounts: {
    getAccount: vi.fn(async (role: string) => ({ id: ACCOUNTS[role] })),
    getAccounts: vi.fn(async (role: string) => [{ id: ACCOUNTS[role] }]),
  },
}));
vi.mock('../temporaryDeliveryNote', () => ({ linkTemporaryNotesToDoInTx: vi.fn(async () => undefined) }));
vi.mock('../salesOrderDelivery', () => ({
  recomputeDeliveredQtyInTx: vi.fn(async () => undefined),
  relinkDoItemsToSOInTx: vi.fn(async () => undefined),
}));

import { submitGoodsReceiptInTx } from '../goodsReceiptSubmit';
import { submitDeliveryOrderInTx } from '../deliveryOrderSubmit';
import { editDeliveryOrderInTx } from '../deliveryOrderEdit';
import { submitSalesReturnInTx } from '../salesReturnSubmit';
import { makeAutoTx } from '../../__tests__/helpers/autoTx';

const movementData = (fn: ReturnType<typeof makeAutoTx>['fn']) =>
  fn('stockMovement.create').mock.calls.map((c) => c[0].data);

beforeEach(() => vi.clearAllMocks());

describe('goods receipt movements', () => {
  const grTx = (averageCost: string) =>
    makeAutoTx({
      'party.findUnique': () => ({ id: 'sup', name: 'Supplier', isActive: true, partyType: 'Supplier' }),
      'inventoryItem.findUnique': () => ({ id: 'i1', name: 'GKP', isActive: true, accountId: null, averageCost, currentStock: '0' }),
      'warehouse.findUnique': () => ({ id: 'wh-1' }),
    });
  const body = (extra: object = {}) => ({
    date: '2026-10-10',
    partyId: 'sup',
    items: [{ inventoryItemId: 'i1', warehouseId: 'wh-1', itemName: 'GKP', quantity: 10, unit: 'Kg', lockedUnitCost: 5000 }],
    ...extra,
  });

  it('stores Hutang Belum Tagih as the counter account', async () => {
    const { tx, fn } = grTx('0');
    await submitGoodsReceiptInTx(tx, body(), 'u1');
    expect(movementData(fn)[0]).toMatchObject({ referenceType: 'GoodsReceipt', offsetAccountId: 'acc-2.1.5', totalValue: 50000 });
    const je = fn('journalEntry.create').mock.calls[0]![0].data.items.create;
    expect(je.find((l: any) => l.credit > 0).accountId).toBe('acc-2.1.5');
  });

  it('leaves it empty for customer-owned goods (no journal)', async () => {
    const { tx, fn } = grTx('0');
    await submitGoodsReceiptInTx(tx, body({ isCustomerOwned: true }), 'u1');
    expect(movementData(fn)[0]).toMatchObject({ totalValue: 0, offsetAccountId: null });
    expect(fn('journalEntry.create')).not.toHaveBeenCalled();
  });
});

describe('delivery order movements', () => {
  const doHandlers = (hppBeras: boolean) => ({
    'party.findUnique': () => ({ id: 'cust', name: 'Cust', isActive: true, partyType: 'Customer' }),
    'inventoryItem.findMany': () => [{ id: 'i1', name: 'Beras', unit: 'Kg', isActive: true }],
    'inventoryItem.findUnique': () => ({ id: 'i1', name: 'Beras', unit: 'Kg', averageCost: '9000' }),
    'warehouse.findMany': () => [{ id: 'wh-1', name: 'Gudang' }],
    'inventoryStock.findMany': () => [{ itemId: 'i1', warehouseId: 'wh-1', currentStock: '100' }],
    'inventoryStock.findUnique': () => ({ currentStock: '100' }),
    'account.findFirst': () => (hppBeras ? { id: 'acc-5.1' } : null),
    'deliveryOrder.findUniqueOrThrow': () => ({ id: 'do-1', items: [] }),
    'deliveryOrder.findUnique': () => ({ id: 'do-1', doNumber: 'DO-1', status: 'Submitted', invoiceId: null, items: [] }),
    'fiscalYear.findFirst': () => ({ id: 'fy-2026' }),
  });
  const body = {
    date: '2026-10-10',
    partyId: 'cust',
    items: [{ inventoryItemId: 'i1', warehouseId: 'wh-1', itemName: 'Beras', quantity: 2, unit: 'Kg' }],
  };

  it('submit stores the HPP account the invoice will debit (5.1 first)', async () => {
    const { tx, fn } = makeAutoTx(doHandlers(true));
    await submitDeliveryOrderInTx(tx, body, 'u1');
    expect(movementData(fn)[0]).toMatchObject({ referenceType: 'DeliveryOrder', movementType: 'Out', offsetAccountId: 'acc-5.1' });
  });

  it('submit falls back to the COGS system account', async () => {
    const { tx, fn } = makeAutoTx(doHandlers(false));
    await submitDeliveryOrderInTx(tx, body, 'u1');
    expect(movementData(fn)[0]?.offsetAccountId).toBe('acc-5');
  });

  it('edit stores it on the re-created movements', async () => {
    const { tx, fn } = makeAutoTx(doHandlers(true));
    await editDeliveryOrderInTx(tx, 'do-1', body, 'u1');
    expect(movementData(fn)[0]).toMatchObject({ referenceType: 'DeliveryOrder', offsetAccountId: 'acc-5.1' });
  });

  it('no counter account for a zero-value line', async () => {
    const h = doHandlers(true);
    const { tx, fn } = makeAutoTx({ ...h, 'inventoryItem.findUnique': () => ({ id: 'i1', name: 'Beras', unit: 'Kg', averageCost: '0' }) });
    await submitDeliveryOrderInTx(tx, body, 'u1');
    expect(movementData(fn)[0]?.offsetAccountId).toBeNull();
  });
});

describe('sales return restock movements', () => {
  it('stores the HPP account the COGS reversal journal credits', async () => {
    const { tx, fn } = makeAutoTx({
      'salesInvoice.findUnique': () => ({
        id: 'si-1',
        invoiceNumber: 'SI-1',
        partyId: 'cust',
        status: 'Submitted',
        outstanding: '100000',
        customer: { name: 'Cust' },
        items: [
          {
            id: 'sii-1',
            itemName: 'Beras',
            quantity: '5',
            discount: '0',
            rate: '10000',
            taxPct: '0',
            unit: 'Kg',
            accountId: 'acc-4.1',
            warehouseId: 'wh-1',
            inventoryItemId: 'i1',
            unitCostLoaded: '7000',
            deliveryOrderItem: null,
            inventoryItem: { id: 'i1', name: 'Beras', accountId: null, averageCost: '7000', isActive: true },
          },
        ],
      }),
      'account.findFirst': ({ where }) => ({ id: `acc-${where.accountNumber}` }),
      'journalEntry.create': ({ data }) => ({ id: `je-${data.entryNumber}` }),
    });
    await submitSalesReturnInTx(tx, { salesInvoiceId: 'si-1', date: '2026-10-10', items: [{ salesInvoiceItemId: 'sii-1', quantity: 2 }] }, 'u1');

    expect(movementData(fn)[0]).toMatchObject({ referenceType: 'SalesReturn', totalValue: 14000, offsetAccountId: 'acc-5.1' });
    const cogsJe = fn('journalEntry.create').mock.calls.map((c) => c[0].data).find((d) => d.entryNumber.startsWith('JV-COGS-'));
    expect(cogsJe.items.create.find((l: any) => l.credit > 0).accountId).toBe('acc-5.1');
  });
});
