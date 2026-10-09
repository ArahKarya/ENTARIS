import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { C, F, FOOTER_SPACE } from './theme';
import { computePoTotals, paymentTermLabel, poDueDate } from '../purchaseOrderCalc';
import { pdfDate, pdfMoneyAuto, pdfNum, pdfRpAuto } from './pdfFormat';
import {
  PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfPartyBlock, PdfSection, PdfSignatureBlock, PdfTable, PdfTotals,
  type PdfColumn,
} from './kit';

// PDF Purchase Order (Pesanan Pembelian) untuk dikirim ke pemasok:
// header perusahaan + data pemasok + item (estimasi harga) + total + catatan/syarat + tanda tangan.

const S = StyleSheet.create({
  page: { fontFamily: F.regular, fontSize: 9, color: C.dark, paddingTop: 30, paddingBottom: FOOTER_SPACE, paddingHorizontal: 32 },
  tdDesc: { fontSize: 7.5, color: C.muted, marginTop: 1 },
  para: { fontSize: 8.5, lineHeight: 1.4 },
});

type Num = number | string | null | undefined;

const toNum = (n: Num) => Number(n ?? 0) || 0;

export interface PurchaseOrderPDFItem {
  itemName: string;
  description?: string | null;
  quantity: Num;
  unit: string;
  estimatedRate: Num;
  estimatedAmount?: Num;
  discount?: Num;
  taxPct?: Num;
}

export interface PurchaseOrderPDFData {
  poNumber: string;
  date: string;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  terms?: string | null;
  totalEstimated: Num;
  /** Draft | PendingApproval | Submitted | Cancelled — non-ordered POs print a DRAF marker. */
  displayStatus?: string;
  paymentTermDays?: number | null;
  supplierQuoteRef?: string | null;
  otherCosts?: Num;
  otherCostsLabel?: string | null;
  warehouse?: { code?: string | null; name: string } | null;
  supplier?: { name: string; address?: string | null; phone?: string | null; taxId?: string | null } | null;
  user?: { fullName?: string | null } | null;
  items: PurchaseOrderPDFItem[];
}

export interface PurchaseOrderPDFProps {
  po: PurchaseOrderPDFData;
  company: { name: string; address?: string | null; phone?: string | null; email?: string | null; taxId?: string | null; logoUrl?: string | null };
}

const COLUMNS: PdfColumn[] = [
  { key: 'no', label: 'No', width: 0.4, align: 'center' },
  { key: 'item', label: 'Barang', width: 3.0 },
  { key: 'qty', label: 'Qty', width: 1.0, align: 'right' },
  { key: 'unit', label: 'Satuan', width: 0.8 },
  { key: 'rate', label: 'Harga (Rp)', width: 1.5, align: 'right' },
  { key: 'disc', label: 'Disk %', width: 0.8, align: 'right' },
  { key: 'tax', label: 'PPN %', width: 0.8, align: 'right' },
  { key: 'amount', label: 'Jumlah (Rp)', width: 1.7, align: 'right' },
];

const STATUS_MARK: Record<string, string> = {
  Draft: 'DRAF: BELUM DIPESAN',
  PendingApproval: 'MENUNGGU PERSETUJUAN',
  Cancelled: 'DIBATALKAN',
};

const PurchaseOrderPDF: React.FC<PurchaseOrderPDFProps> = ({ po, company }) => {
  const supplier = po.supplier;
  // Recomputed from lines (same rules as the server) so legacy POs print too.
  const totals = computePoTotals(
    po.items.map((it) => ({
      quantity: toNum(it.quantity),
      estimatedRate: toNum(it.estimatedRate),
      discount: toNum(it.discount ?? 0),
      taxPct: toNum(it.taxPct ?? 0),
    })),
    toNum(po.otherCosts ?? 0),
  );
  const dueDate = poDueDate(po.date, po.paymentTermDays);
  const mark = po.displayStatus ? STATUS_MARK[po.displayStatus] : undefined;
  const pct = (n: Num | undefined) => (toNum(n ?? 0) > 0 ? pdfNum(n ?? 0, 2) : '—');

  const rows = po.items.map((it, i) => ({
    no: String(i + 1),
    item: (
      <View>
        <Text style={{ fontSize: 8.5 }}>{it.itemName}</Text>
        {it.description ? <Text style={S.tdDesc}>{it.description}</Text> : null}
      </View>
    ),
    qty: pdfNum(it.quantity, 3),
    unit: it.unit,
    rate: pdfMoneyAuto(it.estimatedRate),
    disc: pct(it.discount),
    tax: pct(it.taxPct),
    amount: pdfMoneyAuto(totals.lines[i]?.amount ?? toNum(it.estimatedAmount ?? 0)),
  }));

  const totalRows = [
    { label: 'Subtotal', value: pdfMoneyAuto(totals.subtotal), show: true },
    { label: 'Diskon', value: pdfMoneyAuto(-totals.discountTotal), show: totals.discountTotal > 0 },
    { label: 'PPN', value: pdfMoneyAuto(totals.taxTotal), show: totals.taxTotal > 0 },
    { label: po.otherCostsLabel || 'Biaya lain', value: pdfMoneyAuto(totals.otherCosts), show: totals.otherCosts > 0 },
  ].filter((r) => r.show);

  return (
    <Document title={`Purchase Order ${po.poNumber}`} author={company.name}>
      <Page size="A4" style={S.page} wrap>
        <PdfHeader
          company={company}
          title="PURCHASE ORDER"
          subtitle="PESANAN PEMBELIAN"
          number={po.poNumber}
          dateLine={`Tanggal: ${pdfDate(po.date)}`}
          status={mark}
          statusColor={C.amberDk}
        />

        <PdfMetaRow>
          <PdfPartyBlock
            label="Kepada (Pemasok)"
            name={supplier ? supplier.name : 'PO Umum'}
            lines={
              supplier
                ? [supplier.address, supplier.phone && `Telp: ${supplier.phone}`, supplier.taxId && `NPWP: ${supplier.taxId}`]
                : ['Dapat dipenuhi pemasok mana saja']
            }
          />
          <View style={{ flex: 1 }}>
            <PdfMetaField label="Tanggal Kirim Diharapkan" value={po.expectedDeliveryDate ? pdfDate(po.expectedDeliveryDate) : null} />
            <PdfMetaField
              label="Termin Pembayaran"
              value={`${paymentTermLabel(po.paymentTermDays)}${dueDate && po.paymentTermDays ? ` (jatuh tempo ${pdfDate(dueDate)})` : ''}`}
            />
          </View>
          <View style={{ flex: 1 }}>
            <PdfMetaField
              label="Kirim ke Gudang"
              value={po.warehouse ? [po.warehouse.code, po.warehouse.name].filter(Boolean).join(' · ') : null}
            />
            <PdfMetaField label="No. Penawaran Pemasok" value={po.supplierQuoteRef} />
          </View>
        </PdfMetaRow>

        <PdfTable columns={COLUMNS} rows={rows} />

        <PdfTotals
          rows={totalRows}
          grand={{ label: 'Grand Total', value: pdfRpAuto(totals.grandTotal) }}
          note="Harga final mengikuti faktur pemasok."
        />

        {po.notes ? (
          <PdfSection title="Catatan">
            <Text style={S.para}>{po.notes}</Text>
          </PdfSection>
        ) : null}
        {po.terms ? (
          <PdfSection title="Syarat & Ketentuan">
            <Text style={S.para}>{po.terms}</Text>
          </PdfSection>
        ) : null}

        <PdfSignatureBlock
          signatures={[
            { label: 'Dibuat oleh', name: po.user?.fullName },
            { label: 'Disetujui oleh' },
            { label: 'Pemasok', name: supplier?.name },
          ]}
        />

        <PdfFooter company={company.name} docRef={po.poNumber} />
      </Page>
    </Document>
  );
};

export default PurchaseOrderPDF;
