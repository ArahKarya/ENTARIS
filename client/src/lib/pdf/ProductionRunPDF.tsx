import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { CARBON as C, F, FOOTER_SPACE, NCR_PAGE } from './theme';
import { pdfDate, pdfFixed, pdfNum, pdfRp, pdfRpAuto } from './pdfFormat';
import { PdfFooter, PdfHeader, PdfMetaField, PdfMetaRow, PdfSignatureBlock, PdfTable, type PdfColumn } from './kit';
import { NcrNotes } from './ncrParts';

const S = StyleSheet.create({
  sectionTitle: { fontSize: 11, fontFamily: F.bold, marginTop: 10, marginBottom: 4, paddingBottom: 2, borderBottomWidth: 1, borderBottomColor: C.black },
  hppBox: { marginTop: 12, padding: 8, borderWidth: 1.2, borderColor: C.black },
  hppHeader: { fontSize: 10, fontFamily: F.bold, marginBottom: 6 },
  hppRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 1.5 },
  hppLabel: { fontSize: 9.5 },
  hppVal: { fontSize: 9.5 },
  hppFinalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 5, marginTop: 5, borderTopWidth: 1, borderTopColor: C.black },
  hppFinalLabel: { fontSize: 10.5, fontFamily: F.bold },
  hppFinalVal: { fontSize: 12, fontFamily: F.bold },
});

const fmtNum = (n: number) => pdfNum(n, 3);
const fmtRp = (n: number, dec = 0) => (dec > 0 ? pdfRpAuto(n) : pdfRp(n));

const ITEM_COLS: PdfColumn[] = [
  { key: 'no', label: 'NO', width: 0.45, align: 'center' },
  { key: 'code', label: 'KODE', width: 1.5 },
  { key: 'name', label: 'NAMA', width: 3.2 },
  { key: 'qty', label: 'QTY', width: 1.2, align: 'right' },
  { key: 'unit', label: 'SAT', width: 0.7, align: 'center' },
  { key: 'cost', label: 'HARGA/UNIT', width: 1.7, align: 'right' },
  { key: 'total', label: 'TOTAL', width: 1.9, align: 'right' },
];
const COST_COLS: PdfColumn[] = [
  { key: 'desc', label: 'KETERANGAN', width: 3.2 },
  { key: 'side', label: 'SISI', width: 0.9 },
  { key: 'rate', label: 'RATE', width: 1.6, align: 'right' },
  { key: 'basis', label: 'BASIS', width: 1.1 },
  { key: 'total', label: 'TOTAL', width: 1.9, align: 'right' },
];

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
  processes?: string[];   // traceability tag names
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
  runNumber, date, warehouseName, referenceNumber, notes, yieldPct, processes,
  inputs, outputs, byproducts, costs, totals, company, createdByName,
}) => {
  const itemTable = (rows: ProductionRunPDFItem[]) => (
    <PdfTable
      tone="mono"
      zebra={false}
      fontSize={10}
      repeatHeader={false}
      columns={ITEM_COLS}
      rows={rows.map((it, i) => ({
        no: String(i + 1),
        code: it.code || '-',
        name: (
          <View>
            <Text style={{ fontSize: 10 }}>{it.name}</Text>
            {it.batchRef ? <Text style={{ fontSize: 8.5, color: C.grey }}>Batch: {it.batchRef}</Text> : null}
          </View>
        ),
        qty: <Text style={{ fontSize: 10, fontFamily: F.bold, textAlign: 'right' }}>{fmtNum(it.qty)}</Text>,
        unit: it.unit,
        cost: it.unitCost != null ? fmtRp(it.unitCost, 2) : '-',
        total: it.unitCost != null ? (
          <Text style={{ fontSize: 10, fontFamily: F.bold, textAlign: 'right' }}>{fmtRp((it.unitCost ?? 0) * it.qty, 0)}</Text>
        ) : '-',
      }))}
    />
  );

  return (
    <Document title={`Proses Produksi ${runNumber}`} author={company.name}>
      <Page size="A4" style={{ ...NCR_PAGE, paddingBottom: FOOTER_SPACE }} wrap>
        <PdfHeader company={company} title="PROSES PRODUKSI" number={runNumber} tone="mono" pageMeta />

        <PdfMetaRow gap={16}>
          <View style={{ flex: 1 }}>
            <PdfMetaField tone="mono" label="Tanggal" value={pdfDate(date)} bold />
            <PdfMetaField tone="mono" label="Gudang Produksi" value={warehouseName} bold />
          </View>
          <View style={{ flex: 1 }}>
            <PdfMetaField tone="mono" label="Referensi" value={referenceNumber} bold />
            <PdfMetaField tone="mono" label="Yield" value={yieldPct != null ? `${pdfFixed(yieldPct, 1)}%` : null} bold />
          </View>
        </PdfMetaRow>

        {processes && processes.length > 0 && (
          <PdfMetaField tone="mono" label="Proses Dijalankan" value={processes.join('  >  ')} bold />
        )}

        <Text style={S.sectionTitle} minPresenceAhead={60}>Bahan Input ({inputs.length})</Text>
        {itemTable(inputs)}

        <Text style={S.sectionTitle} minPresenceAhead={60}>Hasil Output Utama ({outputs.length})</Text>
        {itemTable(outputs)}

        {byproducts.length > 0 && (
          <>
            <Text style={S.sectionTitle} minPresenceAhead={60}>Produk Samping ({byproducts.length})</Text>
            {itemTable(byproducts)}
          </>
        )}

        {costs.length > 0 && (
          <>
            <Text style={S.sectionTitle} minPresenceAhead={60}>Komponen Biaya Produksi ({costs.length})</Text>
            <PdfTable
              tone="mono"
              zebra={false}
              fontSize={10}
              repeatHeader={false}
              columns={COST_COLS}
              rows={costs.map((c) => ({
                desc: (
                  <View>
                    <Text style={{ fontSize: 10 }}>{c.description}</Text>
                    {c.accountLabel ? <Text style={{ fontSize: 8.5, color: C.grey }}>{c.accountLabel}</Text> : null}
                  </View>
                ),
                side: c.costSide === 'InputSide' ? 'Input' : 'Output',
                rate: fmtRp(c.rate, 2),
                basis: basisShort(c.basis),
                total: <Text style={{ fontSize: 10, fontFamily: F.bold, textAlign: 'right' }}>{fmtRp(c.totalAmount, 0)}</Text>,
              }))}
            />
          </>
        )}

        {totals.computedHpp != null && (
          <View style={S.hppBox} wrap={false}>
            <Text style={S.hppHeader}>
              HPP LOADED {totals.hppManualOverride ? '(Override Manual)' : '(Auto-Calculated)'}
            </Text>
            <View style={S.hppRow}><Text style={S.hppLabel}>Biaya Material</Text><Text style={S.hppVal}>{fmtRp(totals.totalMaterialCost, 0)}</Text></View>
            <View style={S.hppRow}><Text style={S.hppLabel}>+ Biaya Sisi Input</Text><Text style={S.hppVal}>{fmtRp(totals.totalCostInputSide, 0)}</Text></View>
            <View style={S.hppRow}><Text style={S.hppLabel}>+ Biaya Sisi Output</Text><Text style={S.hppVal}>{fmtRp(totals.totalCostOutputSide, 0)}</Text></View>
            <View style={S.hppRow}><Text style={S.hppLabel}>− Nilai Produk Samping (NRV)</Text><Text style={S.hppVal}>{fmtRp(totals.totalByproductValue, 0)}</Text></View>
            <View style={S.hppFinalRow}>
              <Text style={S.hppFinalLabel}>HPP / Kg main output ({fmtNum(totals.mainOutputQty)} kg)</Text>
              <Text style={S.hppFinalVal}>{fmtRp(totals.computedHpp, 2)}</Text>
            </View>
          </View>
        )}

        <NcrNotes notes={notes} />

        <PdfSignatureBlock
          tone="mono"
          signatures={[{ label: 'STAFF PRODUKSI', name: createdByName }, { label: 'SUPERVISOR' }, { label: 'MANAJER' }]}
        />

        <PdfFooter tone="mono" company={company.name} docRef={runNumber} />
      </Page>
    </Document>
  );
};

export default ProductionRunPDF;
