import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { groupByCategory } from '../stockCategories';
import { C, FOOTER_SPACE } from './theme';
import { pdfDate, pdfDateTime, pdfFixed, pdfNum, pdfRp, pdfT } from './pdfFormat';
import { PdfFooter, PdfHeader } from './kit';

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8.5, color: C.dark, paddingTop: 36, paddingBottom: FOOTER_SPACE, paddingHorizontal: 36, backgroundColor: C.white },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  companyBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  companyLogo: { width: 46, height: 46, objectFit: 'contain' as const },
  companyInfo: { flexDirection: 'column' as const },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.primary },
  companyMeta: { fontSize: 7, color: C.muted, marginTop: 1 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.dark, textAlign: 'right' },
  subtitle: { fontSize: 8, color: C.muted, textAlign: 'right', marginTop: 2 },
  divider: { height: 1.5, backgroundColor: C.primary, marginBottom: 14, marginTop: 8 },

  summaryRow: { flexDirection: 'row', marginBottom: 14, gap: 8 },
  summaryBox: { flex: 1, padding: 8, borderRadius: 3, borderWidth: 0.5, borderColor: C.border },
  summaryLabel: { fontSize: 7, color: C.muted, marginBottom: 2 },
  summaryValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },

  warehouseBlock: { marginBottom: 14 },
  warehouseHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.bgLight, paddingVertical: 5, paddingHorizontal: 6, borderTopWidth: 0.5, borderBottomWidth: 0.5, borderColor: C.border },
  warehouseTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.dark },
  warehouseMeta: { fontSize: 8, color: C.muted },

  tableHeader: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.primary, paddingVertical: 5, paddingHorizontal: 6 },
  tableHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.primary, letterSpacing: 0.3 },
  row: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowAlt: { backgroundColor: C.bgLight },
  cell: { fontSize: 8 },
  colNo: { width: 22 },
  colCode: { width: 90 },
  colName: { flex: 1 },
  colUnit: { width: 32, textAlign: 'center' },
  colNum: { width: 70, textAlign: 'right' },
  colCost: { width: 70, textAlign: 'right' },
  colVal: { width: 90, textAlign: 'right' },

  emptyText: { fontSize: 8, fontStyle: 'italic', color: C.faint, paddingVertical: 6, paddingHorizontal: 6 },

  catHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, paddingHorizontal: 6, backgroundColor: C.primaryLt, borderBottomWidth: 0.5, borderBottomColor: C.border },
  catHeaderText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.mid, letterSpacing: 0.3 },
  catSubtotal: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.dark },

  subtotalRow: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderTopWidth: 0.5, borderTopColor: C.border, backgroundColor: C.bgLight },
  subtotalLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.dark, flex: 1, textAlign: 'right', paddingRight: 6 },
  subtotalValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark, width: 90, textAlign: 'right' },

  footer: { position: 'absolute', bottom: 18, left: 36, right: 36 },
  footerLine: { height: 0.5, backgroundColor: C.border, marginBottom: 3 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: C.faint },
});

const idr = (n: number): string => pdfRp(n);
const fmtNum = (n: number, dec = 3): string => pdfNum(n, dec);

export interface WarehouseStockItem {
  code: string;
  name: string;
  unit: string;
  category?: string | null;
  currentStock: number;
  averageCost: number;
}

export interface WarehouseBlock {
  code: string;
  name: string;
  location: string | null;
  isDefault: boolean;
  items: WarehouseStockItem[];
}

export interface WarehouseStockPDFProps {
  warehouses: WarehouseBlock[];
  generatedAt: Date;
  company: { name: string; address?: string | null; logoUrl?: string | null };
  // Optional: ketika diisi, laporan dianggap snapshot "stok per tanggal" —
  // judul subtitle pakai tanggal ini, bukan waktu cetak.
  asOfDate?: string | null;
  valuationNote?: string | null;
}

const WarehouseStockPDF: React.FC<WarehouseStockPDFProps> = ({ warehouses, generatedAt, company, asOfDate, valuationNote }) => {
  const t = pdfT();
  const totalItems = warehouses.reduce((s, w) => s + w.items.length, 0);
  const totalNegative = warehouses.reduce(
    (s, w) => s + w.items.filter((i) => i.currentStock < 0).length,
    0,
  );
  const grandTotalValue = warehouses.reduce(
    (s, w) => s + w.items.reduce((ws, i) => ws + i.currentStock * i.averageCost, 0),
    0,
  );
  const printDate = pdfDateTime(generatedAt);
  const asOfLabel = asOfDate ? pdfDate(asOfDate) : null;

  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        <PdfHeader
          company={company}
          title={t('warehouseStock.title')}
          dateLine={asOfLabel ? t('warehouseStock.positionAsOf', { date: asOfLabel }) : t('common.asOf', { date: printDate })}
        />
        {valuationNote && (
          <Text style={{ fontSize: 7, color: C.faint, fontStyle: 'italic', marginBottom: 8 }}>
            {valuationNote}
          </Text>
        )}

        {/* Summary */}
        <View style={S.summaryRow}>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('warehouseStock.totalWarehouses')}</Text>
            <Text style={S.summaryValue}>{warehouses.length}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('warehouseStock.totalItemLines')}</Text>
            <Text style={S.summaryValue}>{totalItems}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('warehouseStock.negativeItems')}</Text>
            <Text style={[S.summaryValue, { color: totalNegative > 0 ? C.red : C.dark }]}>{totalNegative}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('warehouseStock.grandTotalValue')}</Text>
            <Text style={[S.summaryValue, { color: grandTotalValue < 0 ? C.red : C.dark }]}>{idr(grandTotalValue)}</Text>
          </View>
        </View>

        {/* Per-warehouse blocks */}
        {warehouses.map((w) => {
          const subtotal = w.items.reduce((s, i) => s + i.currentStock * i.averageCost, 0);
          return (
            <View key={w.code} style={S.warehouseBlock} wrap>
              <View style={S.warehouseHeader} wrap={false}>
                <Text style={S.warehouseTitle}>
                  {w.code} · {w.name}{w.isDefault ? `  ${t('common.defaultMark')}` : ''}
                </Text>
                <Text style={S.warehouseMeta}>
                  {t('common.itemCount', { count: w.items.length })}{w.location ? ` • ${w.location}` : ''}
                </Text>
              </View>
              {w.items.length === 0 ? (
                <Text style={S.emptyText}>{t('warehouseStock.empty')}</Text>
              ) : (
                <>
                  <View style={S.tableHeader} wrap={false}>
                    <Text style={[S.tableHeaderText, S.colNo]}>#</Text>
                    <Text style={[S.tableHeaderText, S.colCode]}>{t('common.code')}</Text>
                    <Text style={[S.tableHeaderText, S.colName]}>{t('common.itemName')}</Text>
                    <Text style={[S.tableHeaderText, S.colUnit]}>{t('common.unitShort')}</Text>
                    <Text style={[S.tableHeaderText, S.colNum]}>{t('common.stock')}</Text>
                    <Text style={[S.tableHeaderText, S.colCost]}>{t('common.avgCost')}</Text>
                    <Text style={[S.tableHeaderText, S.colVal]}>{t('common.value')}</Text>
                  </View>
                  {groupByCategory(w.items, (it) => it.category).map((group) => {
                    const groupVal = group.rows.reduce((s, i) => s + i.currentStock * i.averageCost, 0);
                    return (
                      <View key={`${w.code}-${group.label}`}>
                        <View style={S.catHeaderRow} wrap={false}>
                          <Text style={S.catHeaderText}>
                            {group.label.toUpperCase()}  ({t('common.itemCount', { count: group.rows.length })})
                          </Text>
                          <Text style={[S.catSubtotal, { color: groupVal < 0 ? C.red : C.dark }]}>{idr(groupVal)}</Text>
                        </View>
                        {group.rows.map((it, idx) => {
                          const qty = it.currentStock;
                          const cost = it.averageCost;
                          const val = qty * cost;
                          const isNeg = qty < 0;
                          return (
                            <View key={`${w.code}-${it.code}`} style={[S.row, idx % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
                              <Text style={[S.cell, S.colNo, { color: C.faint }]}>{idx + 1}</Text>
                              <Text style={[S.cell, S.colCode, { fontFamily: 'Helvetica', fontSize: 7.5 }]}>{it.code}</Text>
                              <Text style={[S.cell, S.colName]}>{it.name}</Text>
                              <Text style={[S.cell, S.colUnit, { color: C.muted }]}>{it.unit}</Text>
                              <Text style={[S.cell, S.colNum, { fontFamily: 'Helvetica-Bold', color: isNeg ? C.red : C.dark }]}>
                                {fmtNum(qty)}
                              </Text>
                              <Text style={[S.cell, S.colCost, { color: C.muted }]}>
                                {cost > 0 ? pdfFixed(cost, 0) : '—'}
                              </Text>
                              <Text style={[S.cell, S.colVal, { color: val < 0 ? C.red : C.dark }]}>
                                {val !== 0 ? idr(val) : '—'}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    );
                  })}
                  <View style={S.subtotalRow} wrap={false}>
                    <Text style={S.subtotalLabel}>{t('common.subtotalOf', { name: w.code })}</Text>
                    <Text style={[S.subtotalValue, { color: subtotal < 0 ? C.red : C.dark }]}>{idr(subtotal)}</Text>
                  </View>
                </>
              )}
            </View>
          );
        })}

        <PdfFooter company={company.name} docRef={t('warehouseStock.docRef')} paddingHorizontal={36} printedAt={printDate} />
      </Page>
    </Document>
  );
};

export default WarehouseStockPDF;
