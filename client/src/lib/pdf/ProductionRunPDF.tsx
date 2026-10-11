import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { CARBON as C, F, FOOTER_SPACE, NCR_PAGE } from './theme';
import { pdfDate, pdfFixed, pdfNum, pdfRp, pdfRpAuto, pdfT, type PdfT } from './pdfFormat';
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

const itemCols = (t: PdfT): PdfColumn[] => [
  { key: 'no', label: t('ncr.columns.no'), width: 0.45, align: 'center' },
  { key: 'code', label: t('ncr.columns.code'), width: 1.5 },
  { key: 'name', label: t('production.columns.name'), width: 3.2 },
  { key: 'qty', label: t('ncr.columns.qty'), width: 1.2, align: 'right' },
  { key: 'unit', label: t('ncr.columns.unit'), width: 0.7, align: 'center' },
  { key: 'cost', label: t('production.columns.unitCost'), width: 1.7, align: 'right' },
  { key: 'total', label: t('common.totalUpper'), width: 1.9, align: 'right' },
];
const costCols = (t: PdfT): PdfColumn[] => [
  { key: 'desc', label: t('production.columns.description'), width: 3.2 },
  { key: 'side', label: t('production.columns.side'), width: 0.9 },
  { key: 'rate', label: t('production.columns.rate'), width: 1.6, align: 'right' },
  { key: 'basis', label: t('production.columns.basis'), width: 1.1 },
  { key: 'total', label: t('common.totalUpper'), width: 1.9, align: 'right' },
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


const ProductionRunPDF: React.FC<ProductionRunPDFProps> = ({
  runNumber, date, warehouseName, referenceNumber, notes, yieldPct, processes,
  inputs, outputs, byproducts, costs, totals, company, createdByName,
}) => {
  const t = pdfT();
  const itemTable = (rows: ProductionRunPDFItem[]) => (
    <PdfTable
      tone="mono"
      zebra={false}
      fontSize={10}
      repeatHeader={false}
      columns={itemCols(t)}
      rows={rows.map((it, i) => ({
        no: String(i + 1),
        code: it.code || '—',
        name: (
          <View>
            <Text style={{ fontSize: 10 }}>{it.name}</Text>
            {it.batchRef ? <Text style={{ fontSize: 8.5, color: C.grey }}>{t('production.batch', { ref: it.batchRef })}</Text> : null}
          </View>
        ),
        qty: <Text style={{ fontSize: 10, fontFamily: F.bold, textAlign: 'right' }}>{fmtNum(it.qty)}</Text>,
        unit: it.unit,
        cost: it.unitCost != null ? fmtRp(it.unitCost, 2) : '—',
        total: it.unitCost != null ? (
          <Text style={{ fontSize: 10, fontFamily: F.bold, textAlign: 'right' }}>{fmtRp((it.unitCost ?? 0) * it.qty, 0)}</Text>
        ) : '—',
      }))}
    />
  );

  return (
    <Document title={t('production.docTitle', { number: runNumber })} author={company.name}>
      <Page size="A4" style={{ ...NCR_PAGE, paddingBottom: FOOTER_SPACE }} wrap>
        <PdfHeader company={company} title={t('production.title')} number={runNumber} tone="mono" pageMeta />

        <PdfMetaRow gap={16}>
          <View style={{ flex: 1 }}>
            <PdfMetaField tone="mono" label={t('common.date')} value={pdfDate(date)} bold />
            <PdfMetaField tone="mono" label={t('production.warehouse')} value={warehouseName} bold />
          </View>
          <View style={{ flex: 1 }}>
            <PdfMetaField tone="mono" label={t('production.reference')} value={referenceNumber} bold />
            <PdfMetaField tone="mono" label={t('production.yield')} value={yieldPct != null ? `${pdfFixed(yieldPct, 1)}%` : null} bold />
          </View>
        </PdfMetaRow>

        {processes && processes.length > 0 && (
          <PdfMetaField tone="mono" label={t('production.processes')} value={processes.join('  >  ')} bold />
        )}

        <Text style={S.sectionTitle} minPresenceAhead={60}>{t('production.inputs', { count: inputs.length })}</Text>
        {itemTable(inputs)}

        <Text style={S.sectionTitle} minPresenceAhead={60}>{t('production.outputs', { count: outputs.length })}</Text>
        {itemTable(outputs)}

        {byproducts.length > 0 && (
          <>
            <Text style={S.sectionTitle} minPresenceAhead={60}>{t('production.byproducts', { count: byproducts.length })}</Text>
            {itemTable(byproducts)}
          </>
        )}

        {costs.length > 0 && (
          <>
            <Text style={S.sectionTitle} minPresenceAhead={60}>{t('production.costs', { count: costs.length })}</Text>
            <PdfTable
              tone="mono"
              zebra={false}
              fontSize={10}
              repeatHeader={false}
              columns={costCols(t)}
              rows={costs.map((c) => ({
                desc: (
                  <View>
                    <Text style={{ fontSize: 10 }}>{c.description}</Text>
                    {c.accountLabel ? <Text style={{ fontSize: 8.5, color: C.grey }}>{c.accountLabel}</Text> : null}
                  </View>
                ),
                side: t(`production.side.${c.costSide}`),
                rate: fmtRp(c.rate, 2),
                basis: t(`production.basis.${c.basis}`),
                total: <Text style={{ fontSize: 10, fontFamily: F.bold, textAlign: 'right' }}>{fmtRp(c.totalAmount, 0)}</Text>,
              }))}
            />
          </>
        )}

        {totals.computedHpp != null && (
          <View style={S.hppBox} wrap={false}>
            <Text style={S.hppHeader}>
              {t('production.hppTitle', { mode: totals.hppManualOverride ? t('production.hppManual') : t('production.hppAuto') })}
            </Text>
            <View style={S.hppRow}><Text style={S.hppLabel}>{t('production.materialCost')}</Text><Text style={S.hppVal}>{fmtRp(totals.totalMaterialCost, 0)}</Text></View>
            <View style={S.hppRow}><Text style={S.hppLabel}>{t('production.inputSideCost')}</Text><Text style={S.hppVal}>{fmtRp(totals.totalCostInputSide, 0)}</Text></View>
            <View style={S.hppRow}><Text style={S.hppLabel}>{t('production.outputSideCost')}</Text><Text style={S.hppVal}>{fmtRp(totals.totalCostOutputSide, 0)}</Text></View>
            <View style={S.hppRow}><Text style={S.hppLabel}>{t('production.byproductValue')}</Text><Text style={S.hppVal}>{fmtRp(totals.totalByproductValue, 0)}</Text></View>
            <View style={S.hppFinalRow}>
              <Text style={S.hppFinalLabel}>{t('production.hppPerKg', { qty: fmtNum(totals.mainOutputQty) })}</Text>
              <Text style={S.hppFinalVal}>{fmtRp(totals.computedHpp, 2)}</Text>
            </View>
          </View>
        )}

        <NcrNotes notes={notes} />

        <PdfSignatureBlock
          tone="mono"
          signatures={[
            { label: t('production.signatures.staff'), name: createdByName },
            { label: t('production.signatures.supervisor') },
            { label: t('production.signatures.manager') },
          ]}
        />

        <PdfFooter tone="mono" company={company.name} docRef={runNumber} />
      </Page>
    </Document>
  );
};

export default ProductionRunPDF;
