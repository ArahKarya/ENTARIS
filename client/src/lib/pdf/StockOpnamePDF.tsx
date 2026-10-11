import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { C, F, FOOTER_SPACE } from './theme';
import { pdfDate, pdfNum, pdfRp, pdfT, type PdfT } from './pdfFormat';
import { PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfSection, PdfSignatureBlock, PdfTable, type PdfColumn } from './kit';

const S = StyleSheet.create({
  page: { fontFamily: F.regular, fontSize: 8.5, color: C.dark, paddingTop: 36, paddingBottom: FOOTER_SPACE, paddingHorizontal: 36, backgroundColor: C.white },
  summaryRow: { flexDirection: 'row', marginBottom: 14, gap: 8 },
  summaryBox: { flex: 1, padding: 8, borderRadius: 3, borderWidth: 0.5, borderColor: C.border },
  summaryLabel: { fontSize: 7.5, color: C.muted, marginBottom: 2 },
  summaryValue: { fontSize: 10, fontFamily: F.bold },
  notesText: { fontSize: 8.5, color: C.mid, lineHeight: 1.5 },
});

const columns = (t: PdfT): PdfColumn[] => [
  { key: 'no', label: '#', width: 0.4, align: 'center' },
  { key: 'code', label: t('common.code'), width: 1.1 },
  { key: 'name', label: t('common.itemName'), width: 3 },
  { key: 'unit', label: t('common.unitShort'), width: 0.6, align: 'center' },
  { key: 'sys', label: t('stockOpname.columns.system'), width: 1.2, align: 'right' },
  { key: 'act', label: t('stockOpname.columns.actual'), width: 1.2, align: 'right' },
  { key: 'diff', label: t('stockOpname.columns.diff'), width: 1.2, align: 'right' },
  { key: 'val', label: t('stockOpname.columns.diffValue'), width: 1.7, align: 'right' },
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
  const t = pdfT();
  const itemsWithDiff = items.filter((i) => i.difference !== 0);
  const totalSurplus = items.filter((i) => i.difference > 0).reduce((s, i) => s + i.totalValue, 0);
  const totalDeficit = items.filter((i) => i.difference < 0).reduce((s, i) => s + Math.abs(i.totalValue), 0);
  const net = totalSurplus - totalDeficit;
  const statusLabel = status === 'Submitted' ? t('stockOpname.completed') : status;

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
    <Document title={t('stockOpname.docTitle', { number: opnameNumber })} author={company.name}>
      <Page size="A4" style={S.page} wrap>
        <PdfHeader
          company={company}
          title={t('stockOpname.title')}
          number={opnameNumber}
          dateLine={t('common.dateLine', { date: pdfDate(date) })}
          status={statusLabel}
        />

        <PdfMetaRow gap={20}>
          <PdfMetaField label={t('common.date')} value={pdfDate(date)} bold />
          <PdfMetaField label={t('common.status')} value={statusLabel} bold />
          <PdfMetaField label={t('stockOpname.createdBy')} value={createdBy} bold />
          <PdfMetaField
            label={t('stockOpname.totalItems')}
            value={t('stockOpname.totalItemsValue', { count: items.length, diff: itemsWithDiff.length })}
            bold
          />
        </PdfMetaRow>

        <View style={S.summaryRow} wrap={false}>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('stockOpname.surplus')}</Text>
            <Text style={[S.summaryValue, { color: C.greenDk }]}>{pdfRp(totalSurplus)}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('stockOpname.deficit')}</Text>
            <Text style={[S.summaryValue, { color: C.redDk }]}>{pdfRp(totalDeficit)}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('stockOpname.netDiff')}</Text>
            <Text style={[S.summaryValue, { color: net >= 0 ? C.greenDk : C.redDk }]}>
              {net < 0 ? '-' : ''}{pdfRp(Math.abs(net))}{net < 0 ? t('stockOpname.deficitSuffix') : ''}
            </Text>
          </View>
        </View>

        <PdfTable columns={columns(t)} rows={rows} emptyText={t('stockOpname.noDiff')} />

        {notes ? (
          <PdfSection title={t('common.notes')}>
            <Text style={S.notesText}>{notes}</Text>
          </PdfSection>
        ) : null}

        <PdfSignatureBlock
          signatures={[
            { label: t('stockOpname.signatures.checkedBy') },
            { label: t('stockOpname.signatures.approvedBy') },
            { label: t('stockOpname.signatures.acknowledgedBy') },
          ]}
        />

        <PdfFooter company={company.name} docRef={opnameNumber} paddingHorizontal={36} />
      </Page>
    </Document>
  );
};

export default StockOpnamePDF;
