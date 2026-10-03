import { describe, expect, it } from 'vitest';
import {
  canEditFull,
  isPurchaseInvoiceOverdue,
  toPurchaseInvoiceExportRows,
  toPurchaseInvoicePrefill,
  type PurchaseInvoiceRow,
} from './purchase-invoice-rows';

const NOW = new Date('2026-10-03T05:00:00.000Z');

const invoice = (patch: Partial<PurchaseInvoiceRow> = {}): PurchaseInvoiceRow => ({
  id: 'pi-1',
  invoiceNumber: 'PI-202610-0001',
  partyId: 'sup-1',
  date: '2026-09-01T00:00:00.000Z',
  dueDate: '2026-10-01T00:00:00.000Z',
  status: 'Submitted',
  grandTotal: '1500000.00',
  outstanding: '1500000.00',
  biayaLain: '25000',
  notes: 'Gabah kering',
  supplier: { name: 'CV Tani Makmur', phone: '0812' },
  items: [],
  ...patch,
});

describe('isPurchaseInvoiceOverdue', () => {
  it('is overdue only when past due and still owing', () => {
    expect(isPurchaseInvoiceOverdue(invoice(), NOW)).toBe(true);
    expect(isPurchaseInvoiceOverdue(invoice({ outstanding: '0' }), NOW)).toBe(false);
    expect(isPurchaseInvoiceOverdue(invoice({ dueDate: null }), NOW)).toBe(false);
    expect(isPurchaseInvoiceOverdue(invoice({ dueDate: '2026-11-01T00:00:00.000Z' }), NOW)).toBe(false);
  });
});

describe('canEditFull', () => {
  it('allows only unpaid, non-cancelled invoices', () => {
    expect(canEditFull(invoice())).toBe(true);
    expect(canEditFull(invoice({ outstanding: '1000000' }))).toBe(false);
    expect(canEditFull(invoice({ status: 'Cancelled' }))).toBe(false);
  });
});

describe('toPurchaseInvoiceExportRows', () => {
  it('writes one row per item with Indonesian status labels', () => {
    const rows = toPurchaseInvoiceExportRows(
      [
        invoice({
          outstanding: '500000',
          status: 'PartiallyPaid',
          items: [
            { itemName: 'Gabah', quantity: '1000', rate: '1500', amount: '1500000', refaksi: '2', timbanganDiterima: '1000' },
            { itemName: 'Ongkos bongkar', quantity: '1', rate: '0', amount: '0' },
          ],
        }),
      ],
      NOW,
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      'Nomor Dokumen': 'PI-202610-0001',
      Pemasok: 'CV Tani Makmur',
      'Nama Produk': 'Gabah',
      Qty: 1000,
      'Refaksi (Kg)': 2,
      'Timbangan Truk (Kg)': '',
      'Total Invoice': 1500000,
      'Sudah Dibayar': 1000000,
      'Sisa Tagihan': 500000,
      Status: 'Dibayar Sebagian (Jatuh Tempo)',
    });
  });

  it('keeps invoices without items as a single row', () => {
    const rows = toPurchaseInvoiceExportRows([invoice({ status: 'Paid', outstanding: 0 })], NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ 'Nama Produk': '', Qty: '', Status: 'Lunas' });
  });
});

describe('toPurchaseInvoicePrefill', () => {
  const items = [
    {
      itemName: 'Gabah',
      inventoryItemId: 'inv-1',
      warehouseId: 'wh-1',
      quantity: '900',
      timbanganDiterima: '900',
      rate: '1500',
      goodsReceiptItemId: 'gri-1',
    },
    { itemName: 'Jasa angkut', quantity: '2', rate: '50000' },
  ];

  it('maps an invoice for "Edit lengkap" without warehouse/STT links', () => {
    const prefill = toPurchaseInvoicePrefill(invoice({ items }), { keepLinks: false, newId: () => 'x' });
    expect(prefill).toMatchObject({
      date: '2026-09-01',
      dueDate: '2026-10-01',
      partyId: 'sup-1',
      notes: 'Gabah kering',
      biayaLain: 25000,
    });
    expect(prefill.items[0]).toMatchObject({ itemType: 'material', warehouseId: '', timbanganDiterima: 900, unit: 'Kg' });
    expect(prefill.items[0]).not.toHaveProperty('goodsReceiptItemId');
    // Service line: no inventory item and no weight → quantity becomes the qty field.
    expect(prefill.items[1]).toMatchObject({ itemType: 'service', unit: 'pcs', timbanganDiterima: 2, rate: 50000 });
  });

  it('keeps warehouse and STT links for an approval resubmission', () => {
    const prefill = toPurchaseInvoicePrefill({ partyId: 'sup-2', items }, { keepLinks: true, newId: () => 'x' });
    expect(prefill.date).toBeUndefined();
    expect(prefill.items[0]).toMatchObject({ warehouseId: 'wh-1', goodsReceiptItemId: 'gri-1' });
    expect(prefill.items[1]).toMatchObject({ warehouseId: '', goodsReceiptItemId: null });
  });
});
