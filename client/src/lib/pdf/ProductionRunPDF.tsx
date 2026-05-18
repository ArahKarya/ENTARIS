import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';

Font.registerHyphenationCallback((word) => [word]);

const C = { black: '#000000', white: '#ffffff', grey: '#555555', light: '#cccccc' };

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 10, color: C.black, paddingTop: 32, paddingBottom: 24, paddingHorizontal: 32, backgroundColor: C.white },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  companyBlock: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  companyLogo: { width: 54, height: 54, objectFit: 'contain' as const },
  companyInfo: { flexDirection: 'column' as const, flex: 1 },
  companyName: { fontSize: 15, fontFamily: 'Helvetica-Bold' },
  companyMeta: { fontSize: 9, marginTop: 1 },
  title: { fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  subtitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', textAlign: 'right', marginTop: 4 },
  printMeta: { fontSize: 8, textAlign: 'right', marginTop: 2 },
  divider: { height: 2, backgroundColor: C.black, marginTop: 8, marginBottom: 3 },
  dividerThin: { height: 0.8, backgroundColor: C.black, marginBottom: 12 },

  metaRow: { flexDirection: 'row', marginBottom: 10, gap: 16 },
  metaCol: { flex: 1 },
  metaLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 1 },
  metaValue: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 6 },

  sectionTitle: { fontSize: 11, fontFamily: 'Helvetica-Bold', marginTop: 10, marginBottom: 4, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: C.black },

  tableHeader: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 4, borderTopWidth: 1.2, borderBottomWidth: 1.2, borderColor: C.black, backgroundColor: '#f5f5f5' },
  tableHeaderText: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },
  row: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 0.6, borderBottomColor: C.light },
  rowLast: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 4, borderBottomWidth: 1.2, borderBottomColor: C.black },
  cell: { fontSize: 9.5 },
  cellBold: { fontSize: 9.5, fontFamily: 'Helvetica-Bold' },

  colNo: { width: 22, paddingRight: 4 },
  colCode: { width: 80, paddingRight: 6, fontSize: 8.5 },
  colName: { flex: 1, paddingRight: 6 },
  colQty: { width: 60, paddingRight: 4, textAlign: 'right' },
  colUnit: { width: 36, paddingRight: 4, textAlign: 'center' },
  colCost: { width: 72, paddingRight: 4, textAlign: 'right' },
  colTotal: { width: 88, textAlign: 'right' },

  // cost components table
  colCostDesc: { flex: 1, paddingRight: 6 },
  colCostSide: { width: 60, paddingRight: 4 },
  colCostRate: { width: 90, paddingRight: 4, textAlign: 'right' },
  colCostBasis: { width: 80, paddingRight: 4, textAlign: 'right' },
  colCostTotal: { width: 100, textAlign: 'right' },

  hppBox: { marginTop: 12, padding: 8, borderWidth: 1.2, borderColor: C.black },
  hppHeader: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 6 },
  hppRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  hppLabel: { fontSize: 9.5 },
  hppVal: { fontSize: 9.5 },
  hppFinalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 5, marginTop: 5, borderTopWidth: 1, borderTopColor: C.black },
  hppFinalLabel: { fontSize: 10.5, fontFamily: 'Helvetica-Bold' },
  hppFinalVal: { fontSize: 12, fontFamily: 'Helvetica-Bold' },

  notesBox: { marginTop: 10, padding: 6, borderWidth: 0.8, borderColor: C.black },
  notesLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  notesText: { fontSize: 9.5, lineHeight: 1.4 },

  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  sigBox: { width: '30%', alignItems: 'center' },
  sigLine: { height: 1, backgroundColor: C.black, marginTop: 40, marginBottom: 4, width: '100%' },
  sigLabel: { fontSize: 9.5, textAlign: 'center', fontFamily: 'Helvetica-Bold' },
});

function fmtNum(n: number, dec = 3): string {
  return n.toLocaleString('id-ID', { maximumFractionDigits: dec });
}
function fmtRp(n: number, dec = 0): string {
  return 'Rp ' + n.toLocaleString('id-ID', { maximumFractionDigits: dec });
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

export interface ProductionRunPDFItem {
  code?: string | null;
  name: string;
  qty: number;
  unit: string;
  unitCost?: number | null;     // material cost for inputs / HPP for outputs
  isByProduct?: boolean;
  batchRef?: string | null;     // for inputs with batch picked
}

export interface ProductionRunPDFCost {
  description: string;
  costSide: 'InputSide' | 'OutputSide';
  basis: 'InputQty' | 'OutputQty' | 'Fixed';
  rate: number;
  qtyBasis: number;
  totalAmount: number;
  accountLabel?: string | null;
}

export interface ProductionRunPDFProps {
  runNumber: string;
  date: string;
  warehouseName?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  yieldPct?: number | null;
  inputs: ProductionRunPDFItem[];
  outputs: ProductionRunPDFItem[];
  byproducts: ProductionRunPDFItem[];
  costs: ProductionRunPDFCost[];
  totals: {
    totalMaterialCost: number;
    totalCostInputSide: number;
    totalCostOutputSide: number;
    totalByproductValue: number;
    computedHpp: number | null;
    hppManualOverride: boolean;
    mainOutputQty: number;
  };
  company: { name: string; address?: string | null; phone?: string | null; email?: string | null; taxId?: string | null; logoUrl?: string | null };
  createdByName?: string | null;
}

const basisShort = (b: ProductionRunPDFCost['basis']) =>
  b === 'InputQty' ? 'per kg in' : b === 'OutputQty' ? 'per kg out' : 'flat';

const ProductionRunPDF: React.FC<ProductionRunPDFProps> = ({
  runNumber, date, warehouseName, referenceNumber, notes, yieldPct,
  inputs, outputs, byproducts, costs, totals, company, createdByName,
}) => {
  const printDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  const renderItemTable = (
    rows: ProductionRunPDFItem[],
    showCost: boolean,
  ) => (
    <>
      <View style={S.tableHeader} wrap={false}>
        <Text style={[S.tableHeaderText, S.colNo]}>NO</Text>
        <Text style={[S.tableHeaderText, S.colCode]}>KODE</Text>
        <Text style={[S.tableHeaderText, S.colName]}>NAMA</Text>
        <Text style={[S.tableHeaderText, S.colQty]}>QTY</Text>
        <Text style={[S.tableHeaderText, S.colUnit]}>SAT</Text>
        {showCost && <Text style={[S.tableHeaderText, S.colCost]}>HARGA/UNIT</Text>}
        {showCost && <Text style={[S.tableHeaderText, S.colTotal]}>TOTAL</Text>}
      </View>
      {rows.map((it, i) => {
        const isLast = i === rows.length - 1;
        const lineTotal = (it.unitCost ?? 0) * it.qty;
        return (
          <View key={i} style={isLast ? S.rowLast : S.row} wrap={false}>
            <Text style={[S.cell, S.colNo]}>{i + 1}</Text>
            <Text style={[S.cell, S.colCode]}>{it.code || '-'}</Text>
            <View style={[S.colName]}>
              <Text style={S.cell}>{it.name}</Text>
              {it.batchRef && (
                <Text style={[S.cell, { fontSize: 8.5, color: C.grey }]}>Batch: {it.batchRef}</Text>
              )}
            </View>
            <Text style={[S.cellBold, S.colQty]}>{fmtNum(it.qty)}</Text>
            <Text style={[S.cell, S.colUnit]}>{it.unit}</Text>
            {showCost && <Text style={[S.cell, S.colCost]}>{it.unitCost != null ? fmtRp(it.unitCost, 2) : '-'}</Text>}
            {showCost && <Text style={[S.cellBold, S.colTotal]}>{it.unitCost != null ? fmtRp(lineTotal, 0) : '-'}</Text>}
          </View>
        );
      })}
    </>
  );

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
              {company.phone && <Text style={S.companyMeta}>Telp: {company.phone}</Text>}
              {company.email && <Text style={S.companyMeta}>{company.email}</Text>}
              {company.taxId && <Text style={S.companyMeta}>NPWP: {company.taxId}</Text>}
            </View>
          </View>
          <View>
            <Text style={S.title}>PROSES PRODUKSI</Text>
            <Text style={S.subtitle}>{runNumber}</Text>
            <Text style={S.printMeta} render={({ pageNumber, totalPages }) => `Dicetak ${printDate}  •  Hal ${pageNumber}/${totalPages}`} fixed />
          </View>
        </View>
        <View style={S.divider} fixed />
        <View style={S.dividerThin} fixed />

        {/* Meta */}
        <View style={S.metaRow}>
          <View style={S.metaCol}>
            <Text style={S.metaLabel}>TANGGAL</Text>
            <Text style={S.metaValue}>{fmtDate(date)}</Text>
            <Text style={S.metaLabel}>GUDANG PRODUKSI</Text>
            <Text style={S.metaValue}>{warehouseName || '-'}</Text>
          </View>
          <View style={S.metaCol}>
            <Text style={S.metaLabel}>REFERENSI</Text>
            <Text style={S.metaValue}>{referenceNumber || '-'}</Text>
            <Text style={S.metaLabel}>YIELD</Text>
            <Text style={S.metaValue}>{yieldPct != null ? `${Number(yieldPct).toFixed(1)}%` : '-'}</Text>
          </View>
        </View>

        {/* Inputs */}
        <Text style={S.sectionTitle}>Bahan Input ({inputs.length})</Text>
        {renderItemTable(inputs, true)}

        {/* Outputs (main) */}
        <Text style={S.sectionTitle}>Hasil Output Utama ({outputs.length})</Text>
        {renderItemTable(outputs, true)}

        {/* Byproducts */}
        {byproducts.length > 0 && (
          <>
            <Text style={S.sectionTitle}>Produk Samping ({byproducts.length})</Text>
            {renderItemTable(byproducts, true)}
          </>
        )}

        {/* Cost components */}
        {costs.length > 0 && (
          <>
            <Text style={S.sectionTitle}>Komponen Biaya Produksi ({costs.length})</Text>
            <View style={S.tableHeader} wrap={false}>
              <Text style={[S.tableHeaderText, S.colCostDesc]}>KETERANGAN</Text>
              <Text style={[S.tableHeaderText, S.colCostSide]}>SISI</Text>
              <Text style={[S.tableHeaderText, S.colCostRate]}>RATE</Text>
              <Text style={[S.tableHeaderText, S.colCostBasis]}>BASIS</Text>
              <Text style={[S.tableHeaderText, S.colCostTotal]}>TOTAL</Text>
            </View>
            {costs.map((c, i) => {
              const isLast = i === costs.length - 1;
              return (
                <View key={i} style={isLast ? S.rowLast : S.row} wrap={false}>
                  <View style={S.colCostDesc}>
                    <Text style={S.cell}>{c.description}</Text>
                    {c.accountLabel && (
                      <Text style={[S.cell, { fontSize: 8.5, color: C.grey }]}>{c.accountLabel}</Text>
                    )}
                  </View>
                  <Text style={[S.cell, S.colCostSide]}>{c.costSide === 'InputSide' ? 'Input' : 'Output'}</Text>
                  <Text style={[S.cell, S.colCostRate]}>{fmtRp(c.rate, 2)}</Text>
                  <Text style={[S.cell, S.colCostBasis]}>{basisShort(c.basis)}</Text>
                  <Text style={[S.cellBold, S.colCostTotal]}>{fmtRp(c.totalAmount, 0)}</Text>
                </View>
              );
            })}
          </>
        )}

        {/* HPP Loaded breakdown */}
        {totals.computedHpp != null && (
          <View style={S.hppBox}>
            <Text style={S.hppHeader}>
              HPP LOADED {totals.hppManualOverride ? '(Override Manual)' : '(Auto-Calculated)'}
            </Text>
            <View style={S.hppRow}>
              <Text style={S.hppLabel}>Biaya Material</Text>
              <Text style={S.hppVal}>{fmtRp(totals.totalMaterialCost, 0)}</Text>
            </View>
            <View style={S.hppRow}>
              <Text style={S.hppLabel}>+ Biaya Sisi Input</Text>
              <Text style={S.hppVal}>{fmtRp(totals.totalCostInputSide, 0)}</Text>
            </View>
            <View style={S.hppRow}>
              <Text style={S.hppLabel}>+ Biaya Sisi Output</Text>
              <Text style={S.hppVal}>{fmtRp(totals.totalCostOutputSide, 0)}</Text>
            </View>
            <View style={S.hppRow}>
              <Text style={S.hppLabel}>− Nilai Produk Samping (NRV)</Text>
              <Text style={S.hppVal}>{fmtRp(totals.totalByproductValue, 0)}</Text>
            </View>
            <View style={S.hppFinalRow}>
              <Text style={S.hppFinalLabel}>
                HPP / Kg main output ({fmtNum(totals.mainOutputQty)} kg)
              </Text>
              <Text style={S.hppFinalVal}>{fmtRp(totals.computedHpp, 2)}</Text>
            </View>
          </View>
        )}

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
            <Text style={S.sigLabel}>STAFF PRODUKSI</Text>
            {createdByName && <Text style={[S.sigLabel, { fontSize: 8.5, fontFamily: 'Helvetica' }]}>{createdByName}</Text>}
          </View>
          <View style={S.sigBox}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>SUPERVISOR</Text>
          </View>
          <View style={S.sigBox}>
            <View style={S.sigLine} />
            <Text style={S.sigLabel}>MANAJER</Text>
          </View>
        </View>
      </Page>
    </Document>
  );
};

export default ProductionRunPDF;
