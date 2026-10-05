import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { C, F, FOOTER_SPACE } from './theme';
import { pdfDateShort, pdfNum, pdfRp } from './pdfFormat';
import {
  PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfPartyBlock, PdfSection, PdfTable, type PdfColumn,
} from './kit';

const S = StyleSheet.create({
  page: { fontFamily: F.regular, fontSize: 9, color: C.dark, paddingTop: 30, paddingBottom: FOOTER_SPACE, paddingHorizontal: 32 },
  summaryBox: { marginTop: 10, borderWidth: 1, borderColor: C.border, borderRadius: 4, padding: 8 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  sumLabel: { fontSize: 8.5, color: C.muted },
  sumVal: { fontSize: 8.5, fontFamily: F.bold },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, paddingTop: 3, borderTopWidth: 0.8, borderColor: C.primary },
});

const STATUS_ID: Record<string, string> = {
  Draft: 'Draft', Submitted: 'Disubmit', PartiallyDelivered: 'Sebagian Terkirim',
  FullyDelivered: 'Selesai', Cancelled: 'Dibatalkan', Paid: 'Lunas', PartiallyPaid: 'Sebagian', Overdue: 'Jatuh Tempo',
};
const rp = (n: unknown) => pdfRp(Math.round(Number(n) || 0));
const num = (n: unknown) => pdfNum(Number(n || 0), 3);

const ITEM_COLS: PdfColumn[] = [
  { key: 'item', label: 'Barang', width: 3 },
  { key: 'qty', label: 'Qty', width: 1.4, align: 'right' },
  { key: 'sent', label: 'Terkirim', width: 1.3, align: 'right' },
  { key: 'rate', label: 'Harga', width: 1.5, align: 'right' },
  { key: 'amount', label: 'Jumlah', width: 1.8, align: 'right' },
];
const DO_COLS: PdfColumn[] = [
  { key: 'no', label: 'No. Surat Jalan', width: 2.5 },
  { key: 'date', label: 'Tanggal', width: 2 },
  { key: 'qty', label: 'Qty', width: 2, align: 'right' },
  { key: 'status', label: 'Status', width: 2, align: 'right' },
];
const INV_COLS: PdfColumn[] = [
  { key: 'no', label: 'No. Invoice', width: 2.2 },
  { key: 'date', label: 'Tanggal', width: 1.6 },
  { key: 'total', label: 'Grand Total', width: 2, align: 'right' },
  { key: 'rest', label: 'Sisa', width: 2, align: 'right' },
  { key: 'status', label: 'Status', width: 1.5, align: 'right' },
];

export interface SalesOrderPDFProps {
  so: any;
  company: { name: string; address?: string | null; phone?: string | null; email?: string | null; taxId?: string | null; logoUrl?: string | null };
}

const SalesOrderPDF: React.FC<SalesOrderPDFProps> = ({ so, company }) => {
  const items: any[] = so.items ?? [];
  const dos: any[] = (so.deliveryOrders ?? []).filter((d: any) => d.status !== 'Cancelled');
  // Invoice unik dari DO yang ter-link.
  const invMap = new Map<string, any>();
  for (const d of dos) if (d.invoice) invMap.set(d.invoice.id, d.invoice);
  const invoices = [...invMap.values()];
  const ds = so.depositSummary ?? {};

  const itemRows = items.map((it) => ({
    item: it.itemName,
    qty: `${num(it.quantity)} ${it.unit ?? ''}`.trim(),
    sent: num(it.deliveredQty),
    rate: rp(it.rate),
    amount: rp(Number(it.amount ?? (Number(it.quantity) * Number(it.rate)))),
  }));
  const doRows = dos.map((d) => {
    const qty = (d.items ?? []).reduce((s: number, x: any) => s + Number(x.quantity || 0), 0);
    return {
      no: d.doNumber,
      date: pdfDateShort(d.date),
      qty: `${num(qty)} ${d.items?.[0]?.unit ?? ''}`.trim(),
      status: STATUS_ID[d.status] ?? d.status,
    };
  });
  const invRows = invoices.map((inv) => ({
    no: inv.invoiceNumber,
    date: pdfDateShort(inv.date),
    total: rp(inv.grandTotal),
    rest: rp(inv.outstanding),
    status: STATUS_ID[inv.status] ?? inv.status,
  }));

  return (
    <Document title={`Pesanan Penjualan ${so.soNumber}`} author={company.name}>
      <Page size="A4" style={S.page} wrap>
        <PdfHeader
          company={company}
          title="PESANAN PENJUALAN"
          number={so.soNumber}
          dateLine={`Tanggal: ${pdfDateShort(so.date)}`}
          status={STATUS_ID[so.status] ?? so.status}
        />

        <PdfMetaRow>
          <PdfPartyBlock label="Pelanggan" name={so.customer?.name} lines={[so.customer?.address]} />
          <View style={{ flex: 1 }}>
            <PdfMetaField label="Tanggal" value={pdfDateShort(so.date)} />
            <PdfMetaField label="Status" value={STATUS_ID[so.status] ?? so.status} />
          </View>
        </PdfMetaRow>

        <PdfSection title="Item Pesanan">
          <PdfTable columns={ITEM_COLS} rows={itemRows} repeatHeader={false} />
        </PdfSection>

        {/* Ringkasan uang muka */}
        <View style={S.summaryBox} wrap={false}>
          <View style={S.sumRow}><Text style={S.sumLabel}>Grand Total</Text><Text style={S.sumVal}>{rp(ds.grandTotal ?? so.grandTotal)}</Text></View>
          <View style={S.sumRow}><Text style={S.sumLabel}>Uang Muka Diterima</Text><Text style={S.sumVal}>{rp(ds.received ?? 0)}</Text></View>
          <View style={S.sumRow}><Text style={S.sumLabel}>Uang Muka Terpakai</Text><Text style={S.sumVal}>{rp(ds.applied ?? 0)}</Text></View>
          <View style={S.sumRow}><Text style={S.sumLabel}>Sisa Uang Muka</Text><Text style={S.sumVal}>{rp(ds.depositRemaining ?? 0)}</Text></View>
          <View style={S.grandRow}>
            <Text style={[S.sumLabel, { fontFamily: F.bold, color: C.primary }]}>Sisa Tagihan</Text>
            <Text style={[S.sumVal, { fontSize: 10, color: C.primary }]}>{rp(ds.remaining ?? 0)}</Text>
          </View>
        </View>

        <PdfSection title={`Pengiriman / Surat Jalan (${dos.length})`}>
          <PdfTable columns={DO_COLS} rows={doRows} repeatHeader={false} emptyText="Belum ada pengiriman." />
        </PdfSection>

        <PdfSection title={`Invoice Terkait (${invoices.length})`}>
          <PdfTable columns={INV_COLS} rows={invRows} repeatHeader={false} emptyText="Belum ada invoice." />
        </PdfSection>

        <PdfFooter company={company.name} docRef={so.soNumber} />
      </Page>
    </Document>
  );
};

export default SalesOrderPDF;
