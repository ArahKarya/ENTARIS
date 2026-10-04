// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { renderToBuffer } from '@react-pdf/renderer';
import PurchaseOrderPDF, { type PurchaseOrderPDFData } from './PurchaseOrderPDF';

const po: PurchaseOrderPDFData = {
  poNumber: 'PO-202610-0007',
  date: '2026-10-04T00:00:00.000Z',
  expectedDeliveryDate: '2026-10-11T00:00:00.000Z',
  notes: 'Kirim ke Gudang Utama, jam 08.00–15.00.',
  terms: 'Pembayaran 30 hari setelah faktur diterima.',
  totalEstimated: '12500000',
  supplier: { name: 'CV Sumber Tani', address: 'Jl. Raya Natar No. 12, Lampung', phone: '0812-0000-0000', taxId: '01.234.567.8-901.000' },
  user: { fullName: 'Admin Entaris' },
  items: [
    { itemName: 'Gabah Kering Panen', quantity: '2000', unit: 'Kg', estimatedRate: '5500', estimatedAmount: '11000000' },
    { itemName: 'Karung 50 kg', description: 'Karung plastik putih', quantity: 300, unit: 'Pcs', estimatedRate: 5000 },
  ],
};

describe('PurchaseOrderPDF', () => {
  it('renders a valid PDF document', async () => {
    const buf = await renderToBuffer(<PurchaseOrderPDF po={po} company={{ name: 'PT Contoh Pangan', address: 'Bandar Lampung', taxId: '09.876.543.2-109.000' }} />);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buf.length).toBeGreaterThan(1500);
    expect(buf.subarray(-8).toString()).toContain('%%EOF');
  }, 20000);
});
