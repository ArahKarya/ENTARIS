import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { C, F, FOOTER_SPACE } from './theme';
import { pdfDate, pdfNum, pdfRp } from './pdfFormat';
import { PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfSection, PdfSignatureBlock, PdfTable, type PdfColumn } from './kit';

const S = StyleSheet.create({
  page: { fontFamily: F.regular, fontSize: 8.5, color: C.dark, paddingTop: 36, paddingBottom: FOOTER_SPACE, paddingHorizontal: 36, backgroundColor: C.white },
  summaryRow: { flexDirection: 'row', marginBottom: 14, gap: 8 },
  summaryBox: { flex: 1, padding: 8, borderRadius: 3, borderWidth: 0.5, borderColor: C.border },
  summaryLabel: { fontSize: 7.5, color: C.muted, marginBottom: 2 },
  summaryValue: { fontSize: 10, fontFamily: F.bold },
  notesText: { fontSize: 8.5, color: C.mid, lineHeight: 1.5 },
});

const COLUMNS: PdfColumn[] = [
  { key: 'no', label: '#', width: 0.4, align: 'center' },
  { key: 'code', label: 'Kode', width: 1.1 },
  { key: 'name', label: 'Nama Item', width: 3 },
  { key: 'unit', label: 'Sat.', width: 0.6, align: 'center' },
  { key: 'sys', label: 'Sistem', width: 1.2, align: 'right' },
  { key: 'act', label: 'Aktual', width: 1.2, align: 'right' },
  { key: 'diff', label: 'Selisih', width: 1.2, align: 'right' },
  { key: 'val', label: 'Nilai Selisih', width: 1.7, align: 'right' },
];

const fmtNum = (n: number) => pdfNum(n, 3);

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
  company: { name: string; address?: string | null; logoUrl?: string | null };
}

const StockOpnamePDF: React.FC<StockOpnamePDFProps> = ({
  opnameNumber, date, status, notes, createdBy, items, company,
}) => {
  const itemsWithDiff = items.filter((i) => i.difference !== 0);
  const totalSurplus = items.filter((i) => i.difference > 0).reduce((s, i) => s + i.totalValue, 0);
  const totalDeficit = items.filter((i) => i.difference < 0).reduce((s, i) => s + Math.abs(i.totalValue), 0);
  const net = totalSurplus - totalDeficit;
  const statusLabel = status === 'Submitted' ? 'Selesai' : status;

  const rows = itemsWithDiff.map((item, i) => ({
    no: String(i + 1),
    code: item.code,
    name: item.name,
    unit: item.unit,
    sys: fmtNum(item.systemStock),
    act: fmtNum(item.actualStock),
    diff: (
      <Text style={{ fontSize: 8.5, fontFamily: F.bold, textAlign: 'right', color: item.difference > 0 ? C.greenDk : C.redDk }}>
        {item.difference > 0 ? '+' : ''}{fmtNum(item.difference)}
      </Text>
    ),
    val: <Text style={{ fontSize: 8.5, fontFamily: F.bold, textAlign: 'right' }}>{pdfRp(Math.abs(item.totalValue))}</Text>,
  }));

  return (
    <Document title={`Laporan Stok Opname ${opnameNumber}`} author={company.name}>
      <Page size="A4" style={S.page} wrap>
        <PdfHeader
          company={company}
          title="LAPORAN STOK OPNAME"
          number={opnameNumber}
          dateLine={`Tanggal: ${pdfDate(date)}`}
          status={statusLabel}
        />

        <PdfMetaRow gap={20}>
          <PdfMetaField label="Tanggal" value={pdfDate(date)} bold />
          <PdfMetaField label="Status" value={statusLabel} bold />
          <PdfMetaField label="Dibuat Oleh" value={createdBy} bold />
          <PdfMetaField label="Total Item" value={`${items.length} item (${itemsWithDiff.length} selisih)`} bold />
        </PdfMetaRow>

        <View style={S.summaryRow} wrap={false}>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>Surplus</Text>
            <Text style={[S.summaryValue, { color: C.greenDk }]}>{pdfRp(totalSurplus)}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>Defisit</Text>
            <Text style={[S.summaryValue, { color: C.redDk }]}>{pdfRp(totalDeficit)}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>Selisih Bersih</Text>
            <Text style={[S.summaryValue, { color: net >= 0 ? C.greenDk : C.redDk }]}>
              {net < 0 ? '-' : ''}{pdfRp(Math.abs(net))}{net < 0 ? ' (defisit)' : ''}
            </Text>
          </View>
        </View>

        <PdfTable columns={COLUMNS} rows={rows} emptyText="Tidak ada selisih stok." />

        {notes ? (
          <PdfSection title="Catatan">
            <Text style={S.notesText}>{notes}</Text>
          </PdfSection>
        ) : null}

        <PdfSignatureBlock
          signatures={[{ label: 'Diperiksa oleh' }, { label: 'Disetujui oleh' }, { label: 'Mengetahui' }]}
        />

        <PdfFooter company={company.name} docRef={opnameNumber} paddingHorizontal={36} />
      </Page>
    </Document>
  );
};

export default StockOpnamePDF;
