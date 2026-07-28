import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';

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
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.primary },
  companyMeta: { fontSize: 7, color: C.muted, marginTop: 1 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.dark, textAlign: 'right' },
  subtitle: { fontSize: 8, color: C.muted, textAlign: 'right', marginTop: 2 },
  divider: { height: 1.5, backgroundColor: C.primary, marginBottom: 14, marginTop: 8 },
  metaRow: { flexDirection: 'row', marginBottom: 14, gap: 20 },
  metaItem: { flex: 1 },
  metaLabel: { fontSize: 7, color: C.faint, marginBottom: 1 },
  metaValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark },
  summaryRow: { flexDirection: 'row', marginBottom: 14, gap: 8 },
  summaryBox: { flex: 1, padding: 8, borderRadius: 3, borderWidth: 0.5, borderColor: C.border },
  summaryLabel: { fontSize: 7, color: C.muted, marginBottom: 2 },
  summaryValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  tableHeader: { flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 6, paddingHorizontal: 6 },
  tableHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, letterSpacing: 0.4 },
  row: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowAlt: { backgroundColor: C.bgLight },
  cell: { fontSize: 8 },
  colNo: { width: 22 },
  colCode: { width: 52 },
  colName: { flex: 1 },
  colUnit: { width: 32, textAlign: 'center' },
  colNum: { width: 56, textAlign: 'right' },
  colDiff: { width: 56, textAlign: 'right' },
  colVal: { width: 72, textAlign: 'right' },
  footer: { position: 'absolute', bottom: 18, left: 36, right: 36 },
  footerLine: { height: 0.5, backgroundColor: C.border, marginBottom: 3 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: C.faint },
  notesBox: { marginTop: 12, padding: 8, backgroundColor: C.bgLight, borderRadius: 3, borderWidth: 0.5, borderColor: C.border },
  notesLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.faint, marginBottom: 3 },
  notesText: { fontSize: 8, color: C.mid, lineHeight: 1.5 },
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  sigBox: { width: '30%', alignItems: 'center' },
  sigLine: { height: 0.5, backgroundColor: C.border, marginTop: 28, marginBottom: 4, width: '100%' },
  sigLabel: { fontSize: 7, color: C.muted, textAlign: 'center' },
});

function idr(n: number): string {
  return 'Rp ' + Math.abs(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function fmtNum(n: number, dec = 3): string {
  return n.toLocaleString('id-ID', { maximumFractionDigits: dec });
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

export interface StockOpnameItem {
  code: string;
  name: string;
  unit: string;
  systemStock: number;
  actualStock: number;
  difference: number;
  unitCost: number;
  totalValue: number;
}

export interface StockOpnamePDFProps {
  opnameNumber: string;
  date: string;
  status: string;
  notes?: string | null;
  createdBy?: string;
  items: StockOpnameItem[];
  company: { name: string; address?: string | null };
}

const StockOpnamePDF: React.FC<StockOpnamePDFProps> = ({
  opnameNumber, date, status, notes, createdBy, items, company,
}) => {
  const itemsWithDiff = items.filter((i) => i.difference !== 0);
  const totalSurplus = items.filter((i) => i.difference > 0).reduce((s, i) => s + i.totalValue, 0);
  const totalDeficit = items.filter((i) => i.difference < 0).reduce((s, i) => s + Math.abs(i.totalValue), 0);
  const printDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        {/* Header */}
        <View style={S.headerRow} fixed>
          <View>
            <Text style={S.companyName}>{company.name}</Text>
            {company.address && <Text style={S.companyMeta}>{company.address}</Text>}
          </View>
          <View>
            <Text style={S.title}>LAPORAN STOK OPNAME</Text>
            <Text style={S.subtitle}>{opnameNumber}</Text>
          </View>
        </View>
        <View style={S.divider} fixed />

        {/* Meta */}
        <View style={S.metaRow}>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>Tanggal</Text>
            <Text style={S.metaValue}>{fmtDate(date)}</Text>
          </View>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>Status</Text>
            <Text style={S.metaValue}>{status === 'Submitted' ? 'Selesai' : status}</Text>
          </View>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>Dibuat Oleh</Text>
            <Text style={S.metaValue}>{createdBy || '-'}</Text>
          </View>
          <View style={S.metaItem}>
            <Text style={S.metaLabel}>Total Item</Text>
            <Text style={S.metaValue}>{items.length} item ({itemsWithDiff.length} selisih)</Text>
          </View>
        </View>

        {/* Summary */}
        <View style={S.summaryRow}>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>Surplus</Text>
            <Text style={[S.summaryValue, { color: C.green }]}>{idr(totalSurplus)}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>Defisit</Text>
            <Text style={[S.summaryValue, { color: C.red }]}>{idr(totalDeficit)}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>Selisih Bersih</Text>
            <Text style={[S.summaryValue, { color: totalSurplus - totalDeficit >= 0 ? C.green : C.red }]}>
              {idr(totalSurplus - totalDeficit)}
            </Text>
          </View>
        </View>

        {/* Table */}
        <View style={S.tableHeader} wrap={false}>
          <Text style={[S.tableHeaderText, S.colNo]}>#</Text>
          <Text style={[S.tableHeaderText, S.colCode]}>Kode</Text>
          <Text style={[S.tableHeaderText, S.colName]}>Nama Item</Text>
          <Text style={[S.tableHeaderText, S.colUnit]}>Sat.</Text>
          <Text style={[S.tableHeaderText, S.colNum]}>Sistem</Text>
          <Text style={[S.tableHeaderText, S.colNum]}>Aktual</Text>
          <Text style={[S.tableHeaderText, S.colDiff]}>Selisih</Text>
          <Text style={[S.tableHeaderText, S.colVal]}>Nilai Selisih</Text>
        </View>
        {itemsWithDiff.map((item, i) => (
          <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
            <Text style={[S.cell, S.colNo, { color: C.faint }]}>{i + 1}</Text>
            <Text style={[S.cell, S.colCode, { fontFamily: 'Helvetica', fontSize: 7.5 }]}>{item.code}</Text>
            <Text style={[S.cell, S.colName]}>{item.name}</Text>
            <Text style={[S.cell, S.colUnit, { color: C.muted }]}>{item.unit}</Text>
            <Text style={[S.cell, S.colNum]}>{fmtNum(item.systemStock)}</Text>
            <Text style={[S.cell, S.colNum]}>{fmtNum(item.actualStock)}</Text>
            <Text style={[S.cell, S.colDiff, { fontFamily: 'Helvetica-Bold', color: item.difference > 0 ? C.green : C.red }]}>
              {item.difference > 0 ? '+' : ''}{fmtNum(item.difference)}
            </Text>
            <Text style={[S.cell, S.colVal, { fontFamily: 'Helvetica-Bold' }]}>{idr(Math.abs(item.totalValue))}</Text>
          </View>
        ))}

        {/* Notes */}
        {notes && (
          <View style={S.notesBox}>
            <Text style={S.notesLabel}>CATATAN</Text>
            <Text style={S.notesText}>{notes}</Text>
          </View>
        )}

        {/* Signature */}
        <View style={S.sigRow}>
          <View style={S.sigBox}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>Diperiksa oleh</Text>
          </View>
          <View style={S.sigBox}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>Disetujui oleh</Text>
          </View>
          <View style={S.sigBox}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>Mengetahui</Text>
          </View>
        </View>

        {/* Footer */}
        <View style={S.footer} fixed>
          <View style={S.footerLine} />
          <View style={S.footerRow}>
            <Text style={S.footerText}>{company.name} — {opnameNumber}</Text>
            <Text style={S.footerText}>Dicetak: {printDate}</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};

export default StockOpnamePDF;
