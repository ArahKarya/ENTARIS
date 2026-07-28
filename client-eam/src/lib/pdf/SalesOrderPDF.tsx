import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';

Font.registerHyphenationCallback((word) => [word]);

// PDF Sales Order lengkap: header + item + ringkasan uang muka +
// daftar Surat Jalan (pengiriman) + daftar Invoice terkait.

const C = { ink: '#111827', soft: '#6b7280', line: '#d1d5db', navy: '#002046' };

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: C.ink, paddingTop: 30, paddingBottom: 28, paddingHorizontal: 32 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  companyBlock: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  logo: { width: 48, height: 48, objectFit: 'contain' as const },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.navy },
  companyMeta: { fontSize: 8, color: C.soft, marginTop: 1 },
  title: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' as const },
  subtitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'right' as const, marginTop: 3 },
  printMeta: { fontSize: 7, color: C.soft, textAlign: 'right' as const, marginTop: 3 },
  divider: { height: 1.5, backgroundColor: C.navy, marginTop: 8, marginBottom: 10 },
  metaRow: { flexDirection: 'row', marginBottom: 12, gap: 20 },
  metaCol: { flex: 1 },
  label: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.soft, marginBottom: 1, textTransform: 'uppercase' as const },
  val: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 5 },
  valReg: { fontSize: 9, marginBottom: 5 },
  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 8, marginBottom: 4 },
  th: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.ink, paddingVertical: 4, paddingHorizontal: 3 },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: C.line, paddingVertical: 3.5, paddingHorizontal: 3 },
  td: { fontSize: 8.5 },
  right: { textAlign: 'right' as const },
  center: { textAlign: 'center' as const },
  padR: { paddingRight: 10 },
  summaryBox: { marginTop: 10, borderWidth: 1, borderColor: C.line, borderRadius: 4, padding: 8 },
  sumRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 },
  sumLabel: { fontSize: 8.5, color: C.soft },
  sumVal: { fontSize: 8.5, fontFamily: 'Helvetica-Bold' },
  grandRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3, paddingTop: 3, borderTopWidth: 0.8, borderColor: C.ink },
  empty: { fontSize: 8, color: C.soft, fontStyle: 'italic' as const, paddingVertical: 4 },
  footer: { position: 'absolute' as const, bottom: 16, left: 32, right: 32, fontSize: 7, color: C.soft, textAlign: 'center' as const },
});

const STATUS_ID: Record<string, string> = {
  Draft: 'Draft', Submitted: 'Disubmit', PartiallyDelivered: 'Sebagian Terkirim',
  FullyDelivered: 'Selesai', Cancelled: 'Dibatalkan', Paid: 'Lunas', PartiallyPaid: 'Sebagian', Overdue: 'Jatuh Tempo',
};
const rp = (n: number) => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const num = (n: number) => Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 3 });
const dt = (d: string) => d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

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
  const printDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        <View style={S.headerRow} fixed>
          <View style={S.companyBlock}>
            {company.logoUrl && <Image style={S.logo} src={company.logoUrl} />}
            <View style={{ flex: 1 }}>
              <Text style={S.companyName}>{company.name}</Text>
              {company.address && <Text style={S.companyMeta}>{company.address}</Text>}
              {company.phone && <Text style={S.companyMeta}>Telp: {company.phone}</Text>}
              {company.taxId && <Text style={S.companyMeta}>NPWP: {company.taxId}</Text>}
            </View>
          </View>
          <View>
            <Text style={S.title}>PESANAN PENJUALAN</Text>
            <Text style={S.subtitle}>{so.soNumber}</Text>
            <Text style={S.printMeta} render={({ pageNumber, totalPages }) => `Dicetak ${printDate} • Hal ${pageNumber}/${totalPages}`} />
          </View>
        </View>
        <View style={S.divider} />

        <View style={S.metaRow}>
          <View style={S.metaCol}>
            <Text style={S.label}>Pelanggan</Text>
            <Text style={S.val}>{so.customer?.name ?? '-'}</Text>
            {so.customer?.address && <Text style={S.valReg}>{so.customer.address}</Text>}
          </View>
          <View style={S.metaCol}>
            <Text style={S.label}>Tanggal</Text>
            <Text style={S.valReg}>{dt(so.date)}</Text>
            <Text style={S.label}>Status</Text>
            <Text style={S.valReg}>{STATUS_ID[so.status] ?? so.status}</Text>
          </View>
        </View>

        {/* Item */}
        <Text style={S.sectionTitle}>Item Pesanan</Text>
        <View style={S.th}>
          <Text style={[S.thText, { flex: 3 }]}>Barang</Text>
          <Text style={[S.thText, S.right, S.padR, { flex: 1.4 }]}>Qty</Text>
          <Text style={[S.thText, S.right, S.padR, { flex: 1.3 }]}>Terkirim</Text>
          <Text style={[S.thText, S.right, S.padR, { flex: 1.5 }]}>Harga</Text>
          <Text style={[S.thText, S.right, { flex: 1.8 }]}>Jumlah</Text>
        </View>
        {items.map((it, i) => {
          const amount = Number(it.amount ?? (Number(it.quantity) * Number(it.rate)));
          return (
            <View style={S.tr} key={i}>
              <Text style={[S.td, { flex: 3 }]}>{it.itemName}</Text>
              <Text style={[S.td, S.right, S.padR, { flex: 1.4 }]}>{num(it.quantity)} {it.unit}</Text>
              <Text style={[S.td, S.right, S.padR, { flex: 1.3 }]}>{num(it.deliveredQty)}</Text>
              <Text style={[S.td, S.right, S.padR, { flex: 1.5 }]}>{rp(it.rate)}</Text>
              <Text style={[S.td, S.right, { flex: 1.8 }]}>{rp(amount)}</Text>
            </View>
          );
        })}

        {/* Ringkasan uang muka */}
        <View style={S.summaryBox}>
          <View style={S.sumRow}><Text style={S.sumLabel}>Grand Total</Text><Text style={S.sumVal}>{rp(ds.grandTotal ?? so.grandTotal)}</Text></View>
          <View style={S.sumRow}><Text style={S.sumLabel}>Uang Muka Diterima</Text><Text style={S.sumVal}>{rp(ds.received ?? 0)}</Text></View>
          <View style={S.sumRow}><Text style={S.sumLabel}>Uang Muka Terpakai</Text><Text style={S.sumVal}>{rp(ds.applied ?? 0)}</Text></View>
          <View style={S.sumRow}><Text style={S.sumLabel}>Sisa Uang Muka</Text><Text style={S.sumVal}>{rp(ds.depositRemaining ?? 0)}</Text></View>
          <View style={S.grandRow}><Text style={[S.sumLabel, { fontFamily: 'Helvetica-Bold', color: C.ink }]}>Sisa Tagihan</Text><Text style={[S.sumVal, { fontSize: 10 }]}>{rp(ds.remaining ?? 0)}</Text></View>
        </View>

        {/* Pengiriman */}
        <Text style={S.sectionTitle}>Pengiriman / Surat Jalan ({dos.length})</Text>
        <View style={S.th}>
          <Text style={[S.thText, { flex: 2.5 }]}>No. Surat Jalan</Text>
          <Text style={[S.thText, { flex: 2 }]}>Tanggal</Text>
          <Text style={[S.thText, S.right, S.padR, { flex: 2 }]}>Qty</Text>
          <Text style={[S.thText, S.right, { flex: 2 }]}>Status</Text>
        </View>
        {dos.length === 0 ? <Text style={S.empty}>Belum ada pengiriman.</Text> : dos.map((d, i) => {
          const qty = (d.items ?? []).reduce((s: number, x: any) => s + Number(x.quantity || 0), 0);
          const unit = d.items?.[0]?.unit ?? '';
          return (
            <View style={S.tr} key={i}>
              <Text style={[S.td, { flex: 2.5 }]}>{d.doNumber}</Text>
              <Text style={[S.td, { flex: 2 }]}>{dt(d.date)}</Text>
              <Text style={[S.td, S.right, S.padR, { flex: 2 }]}>{num(qty)} {unit}</Text>
              <Text style={[S.td, S.right, { flex: 2 }]}>{STATUS_ID[d.status] ?? d.status}</Text>
            </View>
          );
        })}

        {/* Invoice */}
        <Text style={S.sectionTitle}>Invoice Terkait ({invoices.length})</Text>
        <View style={S.th}>
          <Text style={[S.thText, { flex: 2.2 }]}>No. Invoice</Text>
          <Text style={[S.thText, { flex: 1.6 }]}>Tanggal</Text>
          <Text style={[S.thText, S.right, S.padR, { flex: 2 }]}>Grand Total</Text>
          <Text style={[S.thText, S.right, S.padR, { flex: 2 }]}>Sisa</Text>
          <Text style={[S.thText, S.right, { flex: 1.5 }]}>Status</Text>
        </View>
        {invoices.length === 0 ? <Text style={S.empty}>Belum ada invoice.</Text> : invoices.map((inv, i) => (
          <View style={S.tr} key={i}>
            <Text style={[S.td, { flex: 2.2 }]}>{inv.invoiceNumber}</Text>
            <Text style={[S.td, { flex: 1.6 }]}>{dt(inv.date)}</Text>
            <Text style={[S.td, S.right, S.padR, { flex: 2 }]}>{rp(inv.grandTotal)}</Text>
            <Text style={[S.td, S.right, S.padR, { flex: 2 }]}>{rp(inv.outstanding)}</Text>
            <Text style={[S.td, S.right, { flex: 1.5 }]}>{STATUS_ID[inv.status] ?? inv.status}</Text>
          </View>
        ))}

        <Text style={S.footer} fixed render={({ pageNumber, totalPages }) => `${company.name} — ${so.soNumber} • Hal ${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
};

export default SalesOrderPDF;
