import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';

Font.registerHyphenationCallback((word) => [word]);

const C = {
  primary: '#374151',
  dark: '#111827',
  mid: '#374151',
  muted: '#6b7280',
  faint: '#9ca3af',
  border: '#e5e7eb',
  bgLight: '#f9fafb',
  white: '#ffffff',
  red: '#dc2626',
  green: '#16a34a',
};

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8.5, color: C.dark, paddingTop: 36, paddingBottom: 56, paddingHorizontal: 36, backgroundColor: C.white },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  companyBlock: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  companyLogo: { width: 56, height: 56, objectFit: 'contain' as const },
  companyInfo: { flexDirection: 'column' as const, flex: 1 },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.primary },
  companyMeta: { fontSize: 7, color: C.muted, marginTop: 1 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.dark, textAlign: 'right' },
  subtitle: { fontSize: 8, color: C.muted, textAlign: 'right', marginTop: 2 },
  statusBadge: { fontSize: 7, color: C.muted, textAlign: 'right', marginTop: 1 },
  divider: { height: 1.5, backgroundColor: C.primary, marginBottom: 14, marginTop: 8 },
  metaRow: { flexDirection: 'row', marginBottom: 14, gap: 20 },
  metaCol: { flex: 1 },
  metaLabel: { fontSize: 7, color: C.faint, marginBottom: 1 },
  metaValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 6 },
  metaValueMuted: { fontSize: 8, color: C.mid, marginBottom: 6 },
  tableHeader: { flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 6, paddingHorizontal: 6 },
  tableHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, letterSpacing: 0.4 },
  row: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowAlt: { backgroundColor: C.bgLight },
  cell: { fontSize: 8 },
  colNo: { width: 22 },
  colCode: { width: 60 },
  colName: { flex: 1 },
  colQty: { width: 50, textAlign: 'right' },
  colUnit: { width: 40, textAlign: 'center' },
  colDesc: { width: 100 },
  notesBox: { marginTop: 12, padding: 8, backgroundColor: C.bgLight, borderRadius: 3, borderWidth: 0.5, borderColor: C.border },
  notesLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.faint, marginBottom: 3 },
  notesText: { fontSize: 8, color: C.mid, lineHeight: 1.5 },
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 32 },
  sigBox: { width: '30%', alignItems: 'center' },
  sigLine: { height: 0.5, backgroundColor: C.border, marginTop: 36, marginBottom: 4, width: '100%' },
  sigLabel: { fontSize: 7.5, color: C.muted, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
  footer: { position: 'absolute', bottom: 18, left: 36, right: 36 },
  footerLine: { height: 0.5, backgroundColor: C.border, marginBottom: 3 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: C.faint },
});

function fmtNum(n: number, dec = 3): string {
  return n.toLocaleString('id-ID', { maximumFractionDigits: dec });
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

function statusLabel(status: string): string {
  if (status === 'Submitted') return 'Diserahkan';
  if (status === 'Invoiced') return 'Sudah Diinvoice';
  if (status === 'Cancelled') return 'Dibatalkan';
  return status;
}

export interface DeliveryOrderPDFItem {
  code?: string | null;
  name: string;
  qty: number;
  unit: string;
  description?: string | null;
}

export interface DeliveryOrderPDFProps {
  doNumber: string;
  date: string;
  status: string;
  customer: { name: string; address?: string | null; phone?: string | null };
  nomorMobil?: string | null;
  driverName?: string | null;
  recipientName?: string | null;
  notes?: string | null;
  items: DeliveryOrderPDFItem[];
  company: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    taxId?: string | null;
    logoUrl?: string | null;
  };
}

const DeliveryOrderPDF: React.FC<DeliveryOrderPDFProps> = ({
  doNumber, date, status, customer, nomorMobil, driverName, recipientName, notes, items, company,
}) => {
  const printDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        {/* Header */}
        <View style={S.headerRow} fixed>
          <View style={S.companyBlock}>
            {company.logoUrl && (
              <Image style={S.companyLogo} src={company.logoUrl} />
            )}
            <View style={S.companyInfo}>
              <Text style={S.companyName}>{company.name}</Text>
              {company.address && <Text style={S.companyMeta}>{company.address}</Text>}
              {company.phone   && <Text style={S.companyMeta}>Telp: {company.phone}</Text>}
              {company.email   && <Text style={S.companyMeta}>{company.email}</Text>}
              {company.taxId   && <Text style={S.companyMeta}>NPWP: {company.taxId}</Text>}
            </View>
          </View>
          <View>
            <Text style={S.title}>SURAT JALAN</Text>
            <Text style={S.subtitle}>{doNumber}</Text>
            <Text style={S.statusBadge}>Status: {statusLabel(status)}</Text>
          </View>
        </View>
        <View style={S.divider} fixed />

        {/* Meta — 2 columns */}
        <View style={S.metaRow}>
          <View style={S.metaCol}>
            <Text style={S.metaLabel}>Tanggal</Text>
            <Text style={S.metaValue}>{fmtDate(date)}</Text>

            <Text style={S.metaLabel}>Kepada</Text>
            <Text style={S.metaValue}>{customer.name}</Text>

            {customer.address && (
              <>
                <Text style={S.metaLabel}>Alamat</Text>
                <Text style={S.metaValueMuted}>{customer.address}</Text>
              </>
            )}
            {customer.phone && (
              <>
                <Text style={S.metaLabel}>Telp</Text>
                <Text style={S.metaValueMuted}>{customer.phone}</Text>
              </>
            )}
          </View>
          <View style={S.metaCol}>
            <Text style={S.metaLabel}>No. Mobil</Text>
            <Text style={S.metaValue}>{nomorMobil ? nomorMobil.toUpperCase() : '-'}</Text>

            <Text style={S.metaLabel}>Supir</Text>
            <Text style={S.metaValue}>{driverName || '-'}</Text>

            <Text style={S.metaLabel}>Penerima</Text>
            <Text style={S.metaValue}>{recipientName || '-'}</Text>
          </View>
        </View>

        {/* Items table */}
        <View style={S.tableHeader} wrap={false}>
          <Text style={[S.tableHeaderText, S.colNo]}>#</Text>
          <Text style={[S.tableHeaderText, S.colCode]}>Kode</Text>
          <Text style={[S.tableHeaderText, S.colName]}>Nama Barang</Text>
          <Text style={[S.tableHeaderText, S.colQty]}>Qty</Text>
          <Text style={[S.tableHeaderText, S.colUnit]}>Sat.</Text>
          <Text style={[S.tableHeaderText, S.colDesc]}>Keterangan</Text>
        </View>
        {items.map((item, i) => (
          <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
            <Text style={[S.cell, S.colNo, { color: C.faint }]}>{i + 1}</Text>
            <Text style={[S.cell, S.colCode, { fontSize: 7.5 }]}>{item.code || '-'}</Text>
            <Text style={[S.cell, S.colName]}>{item.name}</Text>
            <Text style={[S.cell, S.colQty, { fontFamily: 'Helvetica-Bold' }]}>{fmtNum(item.qty)}</Text>
            <Text style={[S.cell, S.colUnit, { color: C.muted }]}>{item.unit}</Text>
            <Text style={[S.cell, S.colDesc, { color: C.muted, fontSize: 7.5 }]}>{item.description || '-'}</Text>
          </View>
        ))}

        {/* Notes */}
        {notes && (
          <View style={S.notesBox}>
            <Text style={S.notesLabel}>CATATAN</Text>
            <Text style={S.notesText}>{notes}</Text>
          </View>
        )}

        {/* Signatures */}
        <View style={S.sigRow}>
          <View style={S.sigBox}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>Penerima</Text>
          </View>
          <View style={S.sigBox}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>Supir</Text>
          </View>
          <View style={S.sigBox}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>Pengirim</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer} fixed>
          <View style={S.footerLine} />
          <View style={S.footerRow}>
            <Text style={S.footerText}>{company.name} — {doNumber}</Text>
            <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Dicetak: ${printDate}  •  Hal ${pageNumber}/${totalPages}`} />
          </View>
        </View>
      </Page>
    </Document>
  );
};

export default DeliveryOrderPDF;
