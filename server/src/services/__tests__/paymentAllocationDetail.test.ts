import { describe, expect, it, vi } from 'vitest';
import { PAYMENT_ALLOCATION_PAYMENT_SELECT, withAllocationInvoiceNumbers } from '../paymentAllocationDetail';

function makeDb() {
  return {
    salesInvoice: { findMany: vi.fn(async () => [{ id: 's-1', invoiceNumber: 'SI-202610-0001' }]) },
    purchaseInvoice: { findMany: vi.fn(async () => [{ id: 'p-1', invoiceNumber: 'PI-202610-0007' }]) },
  };
}
const asDb = (db: ReturnType<typeof makeDb>) => db as unknown as Parameters<typeof withAllocationInvoiceNumbers>[0];

describe('withAllocationInvoiceNumbers', () => {
  it('resolves each allocation to its sales or purchase invoice number', async () => {
    const db = makeDb();
    const allocations = [
      { id: 'a1', invoiceType: 'SalesInvoice', invoiceId: 's-1', allocatedAmount: 10 },
      { id: 'a2', invoiceType: 'PurchaseInvoice', invoiceId: 'p-1', allocatedAmount: 20 },
      { id: 'a3', invoiceType: 'PurchaseInvoice', invoiceId: 'p-missing', allocatedAmount: 5 },
    ];
    const out = await withAllocationInvoiceNumbers(asDb(db), allocations);
    expect(out.map((a) => a.invoiceNumber)).toEqual(['SI-202610-0001', 'PI-202610-0007', null]);
    expect(out[0]).toMatchObject({ id: 'a1', allocatedAmount: 10 });
    expect(allocations[0]).not.toHaveProperty('invoiceNumber');
    expect(db.purchaseInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: { in: ['p-1', 'p-missing'] } } }),
    );
  });

  it('does not match ids across invoice types', async () => {
    const db = makeDb();
    const out = await withAllocationInvoiceNumbers(asDb(db), [{ invoiceType: 'PurchaseInvoice', invoiceId: 's-1' }]);
    expect(out[0].invoiceNumber).toBeNull();
    expect(db.salesInvoice.findMany).not.toHaveBeenCalled();
  });

  it('skips lookups for a payment without allocations', async () => {
    const db = makeDb();
    expect(await withAllocationInvoiceNumbers(asDb(db), [])).toEqual([]);
    expect(db.salesInvoice.findMany).not.toHaveBeenCalled();
    expect(db.purchaseInvoice.findMany).not.toHaveBeenCalled();
  });
});

describe('PAYMENT_ALLOCATION_PAYMENT_SELECT', () => {
  it('includes the account, splits, notes and status the invoice PDF needs', () => {
    expect(PAYMENT_ALLOCATION_PAYMENT_SELECT).toMatchObject({
      notes: true,
      status: true,
      account: { select: { accountNumber: true, name: true, rootType: true } },
      splits: { select: { amount: true, account: { select: { accountNumber: true } } } },
    });
  });
});
