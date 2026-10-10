import { describe, expect, it } from 'vitest';
import { canCreateSalesOrderFromQuotation, quotationToSalesOrderPrefill } from './so-from-quotation';

const quotation = {
  id: 'q-1',
  quotationNumber: 'QTN-202610-0001',
  partyId: 'cust-1',
  status: 'Accepted',
  notes: 'Kirim minggu depan',
  potongan: '10000',
  biayaLain: '5000',
  taxPct: '11',
  salesInvoice: null,
  salesOrders: [],
  items: [
    { inventoryItemId: 'inv-1', itemName: 'Beras', quantity: '100', unit: 'Kg', rate: '12000', discount: '2', description: null },
    { inventoryItemId: null, itemName: 'Ongkos kirim', quantity: '1', unit: 'Jasa', rate: '50000' },
  ],
};

describe('canCreateSalesOrderFromQuotation', () => {
  it('allows an accepted quotation with no invoice or active SO', () => {
    expect(canCreateSalesOrderFromQuotation(quotation)).toBe(true);
  });
  it('blocks other statuses, billed quotations and ones already ordered', () => {
    expect(canCreateSalesOrderFromQuotation({ ...quotation, status: 'Sent' })).toBe(false);
    expect(canCreateSalesOrderFromQuotation({ ...quotation, salesInvoice: { id: 'si-1' } })).toBe(false);
    expect(canCreateSalesOrderFromQuotation({ ...quotation, salesOrders: [{ id: 'so-1', soNumber: 'PSN-1' }] })).toBe(false);
    expect(canCreateSalesOrderFromQuotation(null)).toBe(false);
  });
});

describe('quotationToSalesOrderPrefill', () => {
  it('carries the quotation id, customer, totals and lines', () => {
    const p = quotationToSalesOrderPrefill(quotation);
    expect(p).toMatchObject({
      quotationId: 'q-1',
      partyId: 'cust-1',
      potongan: 10000,
      biayaLain: 5000,
      taxPct: 11,
    });
    expect(p.items).toEqual([
      { inventoryItemId: 'inv-1', itemName: 'Beras', quantity: 100, unit: 'Kg', rate: 12000, discount: 2, description: '' },
      { inventoryItemId: '', itemName: 'Ongkos kirim', quantity: 1, unit: 'Jasa', rate: 50000, discount: 0, description: '' },
    ]);
  });
});
