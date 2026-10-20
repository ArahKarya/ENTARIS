import { describe, expect, it } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import ProformaInvoicePDF from './ProformaInvoicePDF';

type Props = Parameters<typeof ProformaInvoicePDF>[0];

const company = {
  name: 'PT Contoh Pangan', address: 'Indramayu', phone: null, email: null, taxId: null, logoUrl: null,
  invoiceSettings: { sales: { bankAccounts: 'BCA 123456 a.n. PT Contoh Pangan' } },
} as unknown as Props['company'];

const proforma = {
  proformaNumber: 'PRO-202610-0001', date: '2026-10-21', validUntil: '2026-11-04', status: 'Sent',
  customer: { name: 'CV Maju' },
  items: [{ itemName: 'Beras Premium', quantity: 100, unit: 'Kg', rate: 12000, discount: 0, amount: 1200000 }],
  subtotal: 1200000, potongan: 0, biayaLain: 0, grandTotal: 1200000,
  requestedAmount: null as number | null, paid: 0 as number,
} as unknown as Props['proforma'];

/** Kumpulkan semua teks string di pohon elemen (komponen fungsi dirender manual oleh ProformaInvoicePDF sendiri). */
function texts(node: ReactNode, out: string[] = []): string[] {
  if (Array.isArray(node)) node.forEach((n) => texts(n, out));
  else if (typeof node === 'string' || typeof node === 'number') out.push(String(node));
  else if (node && typeof node === 'object' && 'props' in node) texts((node as ReactElement<{ children?: ReactNode }>).props.children, out);
  return out;
}
const render = (p: Props['proforma']) => texts((ProformaInvoicePDF as unknown as (x: Props) => ReactElement)({ proforma: p, company }));

describe('ProformaInvoicePDF', () => {
  it('menampilkan rekening bank dari pengaturan invoice', () => {
    expect(render(proforma).join(' ')).toContain('BCA 123456');
  });

  it('tanpa jumlah tagihan khusus dan tanpa DP: tidak ada blok pembayaran', () => {
    const out = render(proforma).join(' ');
    expect(out).not.toContain('Sisa Tagihan');
    expect(out).not.toContain('Balance Due');
  });

  it('dengan DP: blok pembayaran memuat sisa tagihan', () => {
    const out = render({ ...proforma, requestedAmount: 600000, paid: 250000 } as Props['proforma']);
    const joined = out.join(' ');
    expect(joined).toMatch(/350\.000/); // 600.000 - 250.000
  });
});
