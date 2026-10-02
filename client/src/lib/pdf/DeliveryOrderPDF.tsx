import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import { CARBON as C } from './theme';

Font.registerHyphenationCallback((word) => [word]);

// Carbon-friendly palette: pure black on white, no light grays.
// Background fills don't transfer reliably to 2nd/3rd copies on NCR
// (carbonless) or carbon-paper forms, so we avoid them entirely and rely
// on heavier borders + bold weight for visual hierarchy.
const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    color: C.black,
    paddingTop: 32,
    paddingBottom: 24,
    paddingHorizontal: 32,
    backgroundColor: C.white,
  },

  // ── Header ─────────────────────────────────────────────────────────
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  companyBlock: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  companyLogo: { width: 54, height: 54, objectFit: 'contain' as const },
  companyInfo: { flexDirection: 'column' as const, flex: 1 },
  companyName: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.black },
  companyMeta: { fontSize: 9, color: C.black, marginTop: 1 },
  title: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: C.black, textAlign: 'right' },
  subtitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.black, textAlign: 'right', marginTop: 4 },

  // Thick double divider — survives carbon transfer.
  divider: { height: 2, backgroundColor: C.black, marginTop: 8, marginBottom: 3 },
  dividerThin: { height: 0.8, backgroundColor: C.black, marginBottom: 12 },

  // ── Meta block ─────────────────────────────────────────────────────
  metaRow: { flexDirection: 'row', marginBottom: 12, gap: 16 },
  metaCol: { flex: 1 },
  metaLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.black, marginBottom: 1 },
  metaValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.black, marginBottom: 6 },
  metaValueRegular: { fontSize: 10, color: C.black, marginBottom: 6 },

  // ── Table ──────────────────────────────────────────────────────────
  // No background fill — instead, top + bottom thick borders bracket
  // the header row. Bold text in pure black inside.
  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: C.black,
  },
  tableHeaderText: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: C.black,
    letterSpacing: 0.3,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 0.8,
    borderBottomColor: C.black,
  },
  // Last row drawn with a thicker line so the bottom of the table is
  // unambiguous after transfer.
  rowLast: {
    flexDirection: 'row',
    paddingVertical: 5,
    paddingHorizontal: 4,
    borderBottomWidth: 1.5,
    borderBottomColor: C.black,
  },
  cell: { fontSize: 10.5, color: C.black },
  cellBold: { fontSize: 10.5, fontFamily: 'Helvetica-Bold', color: C.black },
  // Every column gets explicit paddingRight so adjacent cell text never
  // butts against the next column. Last column (colDesc) has no padding.
  colNo: { width: 26, paddingRight: 6 },
  colCode: { width: 95, paddingRight: 8, fontSize: 9 },
  colName: { flex: 1, paddingRight: 8 },
  colQty: { width: 56, paddingRight: 6, textAlign: 'right' },
  colUnit: { width: 38, paddingRight: 6, textAlign: 'center' },
  colDesc: { width: 90 },

  // ── Notes ──────────────────────────────────────────────────────────
  notesBox: {
    marginTop: 12,
    padding: 6,
    borderWidth: 1,
    borderColor: C.black,
  },
  notesLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.black, marginBottom: 3 },
  notesText: { fontSize: 10, color: C.black, lineHeight: 1.4 },

  // ── Signatures ─────────────────────────────────────────────────────
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  sigBox: { width: '23%', alignItems: 'center' },
  sigLine: { height: 1, backgroundColor: C.black, marginTop: 40, marginBottom: 4, width: '100%' },
  sigLabel: { fontSize: 9, color: C.black, textAlign: 'center', fontFamily: 'Helvetica-Bold' },

  // Print metadata moved to top because dot-matrix continuous form often
  // crops the bottom margin. Placed under the title block, right-aligned.
  printMeta: { fontSize: 8, color: C.black, textAlign: 'right', marginTop: 2 },
});

function fmtNum(n: number, dec = 3): string {
  return n.toLocaleString('id-ID', { maximumFractionDigits: dec });
}

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

export interface DeliveryOrderPDFItem {
  code?: string | null;
  name: string;
  qty: number;
  unit: string;
  description?: string | null;
}

export interface DeliveryOrderPDFProps {
  /** Judul dokumen (default SURAT JALAN). Dipakai Surat Jalan Sementara. */
  title?: string;
  /** Catatan kaki di bawah tanda tangan (mis. dokumen sementara). */
  footnote?: string;
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
  title = 'SURAT JALAN', footnote, doNumber, date, customer, nomorMobil, driverName, recipientName, notes, items, company,
}) => {
  const printDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
      {/* Header */}
      <View style={S.headerRow} fixed>
        <View style={S.companyBlock}>
          {company.logoUrl && <Image style={S.companyLogo} src={company.logoUrl} />}
          <View style={S.companyInfo}>
            <Text style={S.companyName}>{company.name}</Text>
            {company.address && <Text style={S.companyMeta}>{company.address}</Text>}
            {company.phone   && <Text style={S.companyMeta}>Telp: {company.phone}</Text>}
            {company.email   && <Text style={S.companyMeta}>{company.email}</Text>}
            {company.taxId   && <Text style={S.companyMeta}>NPWP: {company.taxId}</Text>}
          </View>
        </View>
        <View>
          <Text style={S.title}>{title}</Text>
          <Text style={S.subtitle}>{doNumber}</Text>
          <Text
            style={S.printMeta}
            render={({ pageNumber, totalPages }) =>
              `Dicetak ${printDate}  •  Hal ${pageNumber}/${totalPages}`
            }
            fixed
          />
        </View>
      </View>
      <View style={S.divider} fixed />
      <View style={S.dividerThin} fixed />

      {/* Meta */}
      <View style={S.metaRow}>
        <View style={S.metaCol}>
          <Text style={S.metaLabel}>TANGGAL</Text>
          <Text style={S.metaValue}>{fmtDate(date)}</Text>

          <Text style={S.metaLabel}>KEPADA</Text>
          <Text style={S.metaValue}>{customer.name}</Text>

          {customer.address && (
            <>
              <Text style={S.metaLabel}>ALAMAT</Text>
              <Text style={S.metaValueRegular}>{customer.address}</Text>
            </>
          )}
          {customer.phone && (
            <>
              <Text style={S.metaLabel}>TELP</Text>
              <Text style={S.metaValueRegular}>{customer.phone}</Text>
            </>
          )}
        </View>
        <View style={S.metaCol}>
          <Text style={S.metaLabel}>NO. MOBIL</Text>
          <Text style={S.metaValue}>{nomorMobil ? nomorMobil.toUpperCase() : '-'}</Text>

          <Text style={S.metaLabel}>SUPIR</Text>
          <Text style={S.metaValue}>{driverName || '-'}</Text>

          <Text style={S.metaLabel}>PENERIMA</Text>
          <Text style={S.metaValue}>{recipientName || '-'}</Text>
        </View>
      </View>

      {/* Items table */}
      <View style={S.tableHeader} wrap={false}>
        <Text style={[S.tableHeaderText, S.colNo]}>NO</Text>
        <Text style={[S.tableHeaderText, S.colCode]}>KODE</Text>
        <Text style={[S.tableHeaderText, S.colName]}>NAMA BARANG</Text>
        <Text style={[S.tableHeaderText, S.colQty]}>QTY</Text>
        <Text style={[S.tableHeaderText, S.colUnit]}>SAT</Text>
        <Text style={[S.tableHeaderText, S.colDesc]}>KETERANGAN</Text>
      </View>
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <View key={i} style={isLast ? S.rowLast : S.row} wrap={false}>
            <Text style={[S.cell, S.colNo]}>{i + 1}</Text>
            <Text style={[S.cell, S.colCode]}>{item.code || '-'}</Text>
            <Text style={[S.cell, S.colName]}>{item.name}</Text>
            <Text style={[S.cellBold, S.colQty]}>{fmtNum(item.qty)}</Text>
            <Text style={[S.cell, S.colUnit]}>{item.unit}</Text>
            <Text style={[S.cell, S.colDesc]}>{item.description || '-'}</Text>
          </View>
        );
      })}

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
          <Text style={S.sigLabel}>PENERIMA</Text>
        </View>
        <View style={S.sigBox}>
          <View style={S.sigLine} />
          <Text style={S.sigLabel}>SUPIR</Text>
        </View>
        <View style={S.sigBox}>
          <View style={S.sigLine} />
          <Text style={S.sigLabel}>VERIFIKASI FISIK{'\n'}(SECURITY)</Text>
        </View>
        <View style={S.sigBox}>
          <View style={S.sigLine} />
          <Text style={S.sigLabel}>PENGIRIM</Text>
        </View>
      </View>

      {footnote && (
        <Text style={{ fontSize: 8, marginTop: 14, textAlign: 'center', fontFamily: 'Helvetica-Bold' }}>{footnote}</Text>
      )}

      </Page>
    </Document>
  );
};

export default DeliveryOrderPDF;
