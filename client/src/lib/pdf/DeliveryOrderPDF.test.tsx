import { describe, expect, it } from 'vitest';
import type { ReactElement, ReactNode } from 'react';
import { Page } from '@react-pdf/renderer';
import DeliveryOrderPDF from './DeliveryOrderPDF';
import { PdfFooter, PdfHeader } from './kit';

const company = { name: 'PT Contoh Pangan', address: 'Indramayu', phone: null, email: null, taxId: null, logoUrl: null };
const items = [{ code: 'BRS', name: 'Beras', qty: 1500.5, unit: 'Kg' }, { name: 'Dedak', qty: 200, unit: 'Kg', description: 'Karung putih' }];
const base = {
  status: 'Submitted', doNumber: 'DO-1', date: '2026-10-14', customer: { name: 'CV Maju' },
  nomorMobil: 'E9240QA', driverName: 'Andreas', recipientName: 'Pak Penerima', items, company,
};

type Props = Parameters<typeof DeliveryOrderPDF>[0];

/** Semua elemen React di bawah akar (komponen fungsi tidak dirender; cukup untuk memeriksa susunan template). */
function walk(node: ReactNode, out: ReactElement[] = []): ReactElement[] {
  if (Array.isArray(node)) node.forEach((n) => walk(n, out));
  else if (node && typeof node === 'object' && 'props' in node) {
    out.push(node as ReactElement);
    walk((node as ReactElement<{ children?: ReactNode }>).props.children, out);
  }
  return out;
}

/** DeliveryOrderPDF adalah fungsi murni: panggil langsung untuk mendapat pohon elemennya. */
const tree = (props: Props) => walk((DeliveryOrderPDF as unknown as (p: Props) => ReactElement)(props));

describe('DeliveryOrderPDF (formulir karbon / printer matrix)', () => {
  it('tanpa footer (posisi absolut di dasar A4 jatuh ke halaman 2/3 di kertas continuous-form)', () => {
    const els = tree(base);
    expect(els.some((e) => e.type === Page)).toBe(true);
    expect(els.some((e) => e.type === PdfFooter)).toBe(false);
  });

  it('header tanpa "Dicetak ... Halaman x dari y"', () => {
    const header = tree(base).find((e) => e.type === PdfHeader);
    expect(header).toBeDefined();
    expect((header!.props as { pageMeta?: boolean }).pageMeta).toBeFalsy();
  });

  it('judul dari pemanggil dipakai apa adanya', () => {
    const header = tree({ ...base, title: 'SURAT JALAN' }).find((e) => e.type === PdfHeader);
    expect((header!.props as { title: string }).title).toBe('SURAT JALAN');
  });
});
