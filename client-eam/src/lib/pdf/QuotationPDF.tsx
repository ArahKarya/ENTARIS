import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import type { CompanyPDF } from './useCompanyPDF';

const S = StyleSheet.create({
  page: { padding: 36, fontSize: 9, fontFamily: 'Helvetica', color: '#1f2937' },
  // Header
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  logo: { width: 72, height: 72, objectFit: 'contain' },
  companyBlock: { flex: 1, marginLeft: 12 },
  companyName: { fontSize: 13, fontWeight: 700, color: '#0f172a' },
  companyMeta: { fontSize: 8, color: '#475569', marginTop: 2 },
  titleBlock: { alignItems: 'flex-end' },
  title: { fontSize: 16, fontWeight: 700, color: '#1d4ed8', letterSpacing: 1 },
  disclaimer: { fontSize: 7, color: '#94a3b8', textTransform: 'uppercase', marginTop: 2 },
  // Validity / status box
  validityBox: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 4, padding: 6, marginTop: 6 },
  validityLabel: { fontSize: 7, color: '#64748b', textTransform: 'uppercase' },
  validityValue: { fontSize: 10, color: '#0f172a', fontWeight: 700 },
  statusBadge: { fontSize: 8, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 3, marginTop: 4, alignSelf: 'flex-start', textTransform: 'uppercase', fontWeight: 700 },
  // Meta row
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14 },
  metaCol: { flex: 1, paddingRight: 12 },
  metaLabel: { fontSize: 7, color: '#64748b', textTransform: 'uppercase', marginBottom: 2 },
  metaValue: { fontSize: 9, color: '#0f172a' },
  bold: { fontWeight: 700 },
  // Items table
  table: { marginTop: 16, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e2e8f0' },
  thead: { flexDirection: 'row', backgroundColor: '#f8fafc', paddingVertical: 6, paddingHorizontal: 4 },
  th: { fontSize: 7.5, fontWeight: 700, color: '#475569', textTransform: 'uppercase' },
  tr: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderTopWidth: 0.5, borderColor: '#f1f5f9' },
  td: { fontSize: 8.5 },
  // Column widths
  colNo: { width: '5%' },
  colItem: { width: '50%' },
  colQty: { width: '15%', textAlign: 'right' },
  colPrice: { width: '15%', textAlign: 'right' },
  colTotal: { width: '15%', textAlign: 'right' },
  // Totals
  totalsRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 },
  totalsBox: { width: '50%' },
  totalLine: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  totalLabel: { fontSize: 9, color: '#475569' },
  totalValue: { fontSize: 9, color: '#0f172a', fontFamily: 'Courier' },
  grandRow: { borderTopWidth: 1, borderColor: '#e2e8f0', marginTop: 4, paddingTop: 4, flexDirection: 'row', justifyContent: 'space-between' },
  grandLabel: { fontSize: 11, fontWeight: 700, color: '#0f172a' },
  grandValue: { fontSize: 11, fontWeight: 700, color: '#1d4ed8', fontFamily: 'Courier' },
  // Notes / Terms
  section: { marginTop: 14 },
  sectionTitle: { fontSize: 9, fontWeight: 700, color: '#0f172a', marginBottom: 4 },
  sectionBody: { fontSize: 8.5, color: '#334155', lineHeight: 1.4 },
  // Signatures
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 36 },
  sigBox: { width: '40%', alignItems: 'center' },
  sigLabel: { fontSize: 8, color: '#475569', marginBottom: 30 },
  sigName: { fontSize: 8, color: '#1f2937', borderTopWidth: 0.5, borderColor: '#94a3b8', paddingTop: 4, width: '100%', textAlign: 'center' },
  // Footer
  footerNote: { marginTop: 24, fontSize: 7.5, color: '#64748b', textAlign: 'center', fontStyle: 'italic' },
});

interface QuotationItem {
  itemName: string;
  description?: string | null;
  quantity: number | string;
  unit: string;
  rate: number | string;
  discount: number | string;
  amount: number | string;
  taxPct?: number | string;
  pphPct?: number | string;
}

interface Quotation {
  quotationNumber: string;
  date: string;
  validUntil: string;
  status: string;
  customer: { name: string; address?: string | null; phone?: string | null };
  items: QuotationItem[];
  subtotal: number | string;
  potongan: number | string;
  biayaLain: number | string;
  labelPotongan?: string | null;
  labelBiaya?: string | null;
  grandTotal: number | string;
  notes?: string | null;
  terms?: string | null;
}

interface Props {
  quotation: Quotation;
  company: CompanyPDF;
}

const formatRupiah = (n: number) =>
  'Rp ' + new Intl.NumberFormat('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const formatDateID = (s: string) => {
  try {
    const d = new Date(s);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return s;
  }
};

const STATUS_LABEL: Record<string, string> = {
  Draft: 'Draft',
  Sent: 'Terkirim',
  Accepted: 'Diterima',
  Rejected: 'Ditolak',
  Expired: 'Kadaluarsa',
  Cancelled: 'Dibatalkan',
};

const statusColor = (status: string): string => {
  switch (status) {
    case 'Accepted': return '#16a34a';
    case 'Rejected': return '#dc2626';
    case 'Expired': return '#d97706';
    case 'Cancelled': return '#6b7280';
    case 'Sent': return '#2563eb';
    default: return '#6b7280';
  }
};

const QuotationPDF: React.FC<Props> = ({ quotation, company }) => {
  const items = (quotation.items ?? []).map((it) => ({
    ...it,
    quantity: Number(it.quantity),
    rate: Number(it.rate),
    discount: Number(it.discount),
    amount: Number(it.amount),
    taxPct: Number(it.taxPct ?? 0),
    pphPct: Number(it.pphPct ?? 0),
  }));

  const subtotal = Number(quotation.subtotal);
  const potongan = Number(quotation.potongan);
  const biayaLain = Number(quotation.biayaLain);
  const grandTotal = Number(quotation.grandTotal);

  const taxAmount = items.reduce((s, it) => s + it.amount * (Number(it.taxPct) / 100), 0);
  const pphAmount = items.reduce((s, it) => s + it.amount * (Number(it.pphPct) / 100), 0);

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.header}>
          <View style={{ flexDirection: 'row', flex: 1 }}>
            {company.logoUrl ? <Image src={company.logoUrl} style={S.logo} /> : <View style={[S.logo, { borderWidth: 0.5, borderColor: '#cbd5e1' }]} />}
            <View style={S.companyBlock}>
              <Text style={S.companyName}>{company.name}</Text>
              {company.address && <Text style={S.companyMeta}>{company.address}</Text>}
              {company.phone && <Text style={S.companyMeta}>Telp: {company.phone}</Text>}
              {company.email && <Text style={S.companyMeta}>{company.email}</Text>}
              {company.taxId && <Text style={S.companyMeta}>NPWP: {company.taxId}</Text>}
            </View>
          </View>
          <View style={S.titleBlock}>
            <Text style={S.title}>PENAWARAN HARGA</Text>
            <Text style={S.disclaimer}>Bukan Faktur Resmi / Not a Tax Invoice</Text>
            <View style={S.validityBox}>
              <Text style={S.validityLabel}>Berlaku Sampai</Text>
              <Text style={S.validityValue}>{formatDateID(quotation.validUntil)}</Text>
              <Text
                style={[S.statusBadge, { color: statusColor(quotation.status), borderWidth: 1, borderColor: statusColor(quotation.status) }]}
              >
                {STATUS_LABEL[quotation.status] ?? quotation.status}
              </Text>
            </View>
          </View>
        </View>

        {/* Meta */}
        <View style={S.metaRow}>
          <View style={S.metaCol}>
            <Text style={S.metaLabel}>Kepada</Text>
            <Text style={[S.metaValue, S.bold]}>{quotation.customer?.name}</Text>
            {quotation.customer?.address && <Text style={S.metaValue}>{quotation.customer.address}</Text>}
            {quotation.customer?.phone && <Text style={S.metaValue}>{quotation.customer.phone}</Text>}
          </View>
          <View style={S.metaCol}>
            <Text style={S.metaLabel}>No. Penawaran</Text>
            <Text style={[S.metaValue, S.bold]}>{quotation.quotationNumber}</Text>
            <Text style={[S.metaLabel, { marginTop: 4 }]}>Tanggal</Text>
            <Text style={S.metaValue}>{formatDateID(quotation.date)}</Text>
          </View>
        </View>

        {/* Items table */}
        <View style={S.table}>
          <View style={S.thead}>
            <Text style={[S.th, S.colNo]}>No</Text>
            <Text style={[S.th, S.colItem]}>Item</Text>
            <Text style={[S.th, S.colQty]}>Qty</Text>
            <Text style={[S.th, S.colPrice]}>Harga</Text>
            <Text style={[S.th, S.colTotal]}>Total</Text>
          </View>
          {items.map((it, i) => (
            <View key={i} style={S.tr}>
              <Text style={[S.td, S.colNo]}>{i + 1}</Text>
              <View style={[S.colItem]}>
                <Text style={S.td}>{it.itemName}</Text>
                {it.description ? <Text style={[S.td, { color: '#64748b', fontSize: 7.5 }]}>{it.description}</Text> : null}
              </View>
              <Text style={[S.td, S.colQty]}>{it.quantity} {it.unit}</Text>
              <Text style={[S.td, S.colPrice]}>{formatRupiah(it.rate)}</Text>
              <Text style={[S.td, S.colTotal, S.bold]}>{formatRupiah(it.amount)}</Text>
            </View>
          ))}
        </View>

        {/* Totals */}
        <View style={S.totalsRow}>
          <View style={S.totalsBox}>
            <View style={S.totalLine}><Text style={S.totalLabel}>Subtotal</Text><Text style={S.totalValue}>{formatRupiah(subtotal)}</Text></View>
            {taxAmount > 0 && <View style={S.totalLine}><Text style={S.totalLabel}>PPN</Text><Text style={S.totalValue}>{formatRupiah(taxAmount)}</Text></View>}
            {pphAmount > 0 && <View style={S.totalLine}><Text style={S.totalLabel}>PPh</Text><Text style={S.totalValue}>−{formatRupiah(pphAmount)}</Text></View>}
            {potongan > 0 && <View style={S.totalLine}><Text style={S.totalLabel}>{quotation.labelPotongan ?? 'Potongan'}</Text><Text style={S.totalValue}>−{formatRupiah(potongan)}</Text></View>}
            {biayaLain !== 0 && <View style={S.totalLine}><Text style={S.totalLabel}>{quotation.labelBiaya ?? 'Biaya Lain'}</Text><Text style={S.totalValue}>{formatRupiah(biayaLain)}</Text></View>}
            <View style={S.grandRow}>
              <Text style={S.grandLabel}>GRAND TOTAL</Text>
              <Text style={S.grandValue}>{formatRupiah(grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* Notes */}
        {quotation.notes ? (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Catatan</Text>
            <Text style={S.sectionBody}>{quotation.notes}</Text>
          </View>
        ) : null}

        {/* Terms */}
        {quotation.terms ? (
          <View style={S.section}>
            <Text style={S.sectionTitle}>Syarat &amp; Ketentuan</Text>
            <Text style={S.sectionBody}>{quotation.terms}</Text>
          </View>
        ) : null}

        {/* Signatures */}
        <View style={S.sigRow}>
          <View style={S.sigBox}>
            <Text style={S.sigLabel}>Hormat Kami,</Text>
            <Text style={S.sigName}>{company.name}</Text>
          </View>
          <View style={S.sigBox}>
            <Text style={S.sigLabel}>Disetujui Oleh,</Text>
            <Text style={S.sigName}>{quotation.customer?.name}</Text>
          </View>
        </View>

        {/* Footer disclaimer */}
        <Text style={S.footerNote}>
          Penawaran ini berlaku sampai dengan tanggal yang tertera di atas. Harga dapat berubah sewaktu-waktu setelah masa berlaku berakhir. Untuk konfirmasi pemesanan, silakan menghubungi sales kami.
        </Text>
      </Page>
    </Document>
  );
};

export default QuotationPDF;
