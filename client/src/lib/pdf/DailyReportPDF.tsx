import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { CompanyInfo } from './ReportPDF';
import { C, FOOTER_SPACE } from './theme';
import { pdfDateWeekday, pdfNum, pdfRp, pdfDate, pdfT, type PdfT } from './pdfFormat';
import { PdfFooter, PdfHeader } from './kit';

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 7.5, color: C.dark, paddingTop: 30, paddingBottom: FOOTER_SPACE, paddingHorizontal: 30, backgroundColor: C.white },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  companyBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  companyLogo: { width: 46, height: 46, objectFit: 'contain' as const },
  companyInfo: { flexDirection: 'column' as const },
  companyName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.primary },
  companyMeta: { fontSize: 6.5, color: C.muted, marginTop: 1 },
  reportTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.dark, textAlign: 'right' },
  reportPeriod: { fontSize: 7.5, color: C.muted, textAlign: 'right', marginTop: 2 },
  reportDate: { fontSize: 7, color: C.faint, textAlign: 'right', marginTop: 1 },
  divider: { height: 1.5, backgroundColor: C.primary, marginBottom: 10, marginTop: 6 },
  sectionHeader: { borderLeftWidth: 3, borderLeftColor: C.primary, paddingVertical: 4, paddingHorizontal: 8, marginTop: 8, marginBottom: 0 },
  sectionHeaderText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.primary, letterSpacing: 0.5 },
  thRow: { flexDirection: 'row', backgroundColor: C.bgLight, paddingVertical: 3.5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.border },
  th: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.muted },
  row: { flexDirection: 'row', paddingVertical: 3, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowAlt: { backgroundColor: C.bgLight },
  cell: { fontSize: 7, color: C.mid },
  cellRight: { fontSize: 7, color: C.mid, textAlign: 'right' },
  cellRightBold: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.dark, textAlign: 'right' },
  summaryBox: { flexDirection: 'row', marginTop: 5, marginBottom: 6, gap: 6 },
  summaryItem: { flex: 1, backgroundColor: C.bgLight, borderWidth: 0.5, borderColor: C.border, borderRadius: 3, padding: 5 },
  summaryLabel: { fontSize: 6, color: C.muted, marginBottom: 1.5 },
  summaryValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark },
  footer: { position: 'absolute', bottom: 16, left: 30, right: 30 },
  footerLine: { height: 0.5, backgroundColor: C.border, marginBottom: 3 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 6.5, color: C.faint },
  empty: { paddingVertical: 8, paddingHorizontal: 8 },
  emptyText: { fontSize: 7, color: C.faint, textAlign: 'center' },
});

const idr = (n: number): string => pdfRp(Math.abs(n));
const fmtDate = (d: string): string => pdfDateWeekday(d);
const num = (n: number): string => pdfNum(n, 3);

function Header({ company, date }: { company: CompanyInfo; date: string }) {
  const t = pdfT();
  return <PdfHeader company={company} title={t('daily.title')} dateLine={fmtDate(date)} extraLines={[t('common.printedLine', { date: pdfDate(new Date()) })]} />;
}

function Footer({ company }: { company: CompanyInfo }) {
  return <PdfFooter company={company.name} docRef={pdfT()('daily.docRef')} paddingHorizontal={30} />;
}

function SectionTitle({ title }: { title: string }) {
  return (
    <View style={S.sectionHeader} wrap={false}>
      <Text style={S.sectionHeaderText}>{title}</Text>
    </View>
  );
}

function SummaryRow({ items }: { items: Array<{ label: string; value: string }> }) {
  return (
    <View style={S.summaryBox} wrap={false}>
      {items.map((item, i) => (
        <View key={i} style={S.summaryItem}>
          <Text style={S.summaryLabel}>{item.label}</Text>
          <Text style={S.summaryValue}>{item.value}</Text>
        </View>
      ))}
    </View>
  );
}

interface DailyReportPDFProps {
  company: CompanyInfo;
  date: string;
  data: any;
}

/** Aging column headers shared by the receivables and payables tables. */
function AgingHead({ t, partyLabel }: { t: PdfT; partyLabel: string }) {
  return (
    <View style={S.thRow} wrap={false}>
      <Text style={[S.th, { flex: 1 }]}>{partyLabel}</Text>
      <Text style={[S.th, { width: 95, textAlign: 'right' }]}>{t('daily.aging.current')}</Text>
      <Text style={[S.th, { width: 95, textAlign: 'right' }]}>{t('daily.aging.d1_30')}</Text>
      <Text style={[S.th, { width: 95, textAlign: 'right' }]}>{t('daily.aging.d31_60')}</Text>
      <Text style={[S.th, { width: 95, textAlign: 'right' }]}>{t('daily.aging.d61_90')}</Text>
      <Text style={[S.th, { width: 95, textAlign: 'right' }]}>{t('daily.aging.d90plus')}</Text>
      <Text style={[S.th, { width: 110, textAlign: 'right' }]}>{t('common.total')}</Text>
    </View>
  );
}

export const DailyReportPDF: React.FC<DailyReportPDFProps> = ({ company, date, data }) => {
  const t = pdfT();
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={S.page} wrap>
        <Header company={company} date={date} />

        {/* Sales */}
        <SectionTitle title={t('daily.sales.title')} />
        <SummaryRow items={[
          { label: t('daily.sales.invoiceCount'), value: String(data.sales.summary.count) },
          { label: t('daily.sales.totalQty'), value: `${num(data.sales.summary.totalQty)} kg` },
          { label: t('daily.sales.revenue'), value: idr(data.sales.summary.totalRevenue) },
          { label: t('daily.sales.newReceivables'), value: idr(data.sales.summary.totalNewReceivables) },
        ]} />
        {data.sales.invoices.length > 0 ? (
          <>
            <View style={S.thRow} wrap={false}>
              <Text style={[S.th, { width: 95 }]}>{t('daily.invoiceNo')}</Text>
              <Text style={[S.th, { width: 120 }]}>{t('common.customer')}</Text>
              <Text style={[S.th, { flex: 1 }]}>{t('common.item')}</Text>
              <Text style={[S.th, { width: 65, textAlign: 'right' }]}>{t('common.qty')}</Text>
              <Text style={[S.th, { width: 100, textAlign: 'right' }]}>{t('common.total')}</Text>
              <Text style={[S.th, { width: 100, textAlign: 'right' }]}>{t('daily.sales.outstanding')}</Text>
            </View>
            {data.sales.invoices.map((inv: any, i: number) => (
              <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
                <Text style={[S.cell, { width: 95 }]}>{inv.invoiceNumber}</Text>
                <Text style={[S.cell, { width: 120 }]}>{inv.customerName}</Text>
                <Text style={[S.cell, { flex: 1 }]}>{inv.items.map((it: any) => it.itemName).join(', ')}</Text>
                <Text style={[S.cellRight, { width: 65 }]}>{num(inv.totalQty)}</Text>
                <Text style={[S.cellRight, { width: 100 }]}>{idr(inv.grandTotal)}</Text>
                <Text style={[S.cellRight, { width: 100 }]}>{idr(inv.outstanding)}</Text>
              </View>
            ))}
          </>
        ) : (
          <View style={S.empty}><Text style={S.emptyText}>{t('daily.sales.empty')}</Text></View>
        )}

        {/* Purchasing */}
        <SectionTitle title={t('daily.purchases.title')} />
        <SummaryRow items={[
          { label: t('daily.sales.invoiceCount'), value: String(data.purchases.summary.count) },
          { label: t('daily.sales.totalQty'), value: `${num(data.purchases.summary.totalQty)} kg` },
          { label: t('daily.purchases.spend'), value: idr(data.purchases.summary.totalSpend) },
          { label: t('daily.purchases.newPayables'), value: idr(data.purchases.summary.totalNewPayables) },
        ]} />
        {data.purchases.invoices.length > 0 ? (
          <>
            <View style={S.thRow} wrap={false}>
              <Text style={[S.th, { width: 95 }]}>{t('daily.invoiceNo')}</Text>
              <Text style={[S.th, { width: 120 }]}>{t('common.supplier')}</Text>
              <Text style={[S.th, { flex: 1 }]}>{t('common.item')}</Text>
              <Text style={[S.th, { width: 65, textAlign: 'right' }]}>{t('common.qty')}</Text>
              <Text style={[S.th, { width: 100, textAlign: 'right' }]}>{t('common.total')}</Text>
              <Text style={[S.th, { width: 100, textAlign: 'right' }]}>{t('daily.purchases.outstanding')}</Text>
            </View>
            {data.purchases.invoices.map((inv: any, i: number) => (
              <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
                <Text style={[S.cell, { width: 95 }]}>{inv.invoiceNumber}</Text>
                <Text style={[S.cell, { width: 120 }]}>{inv.supplierName}</Text>
                <Text style={[S.cell, { flex: 1 }]}>{inv.items.map((it: any) => it.itemName).join(', ')}</Text>
                <Text style={[S.cellRight, { width: 65 }]}>{num(inv.totalQty)}</Text>
                <Text style={[S.cellRight, { width: 100 }]}>{idr(inv.grandTotal)}</Text>
                <Text style={[S.cellRight, { width: 100 }]}>{idr(inv.outstanding)}</Text>
              </View>
            ))}
          </>
        ) : (
          <View style={S.empty}><Text style={S.emptyText}>{t('daily.purchases.empty')}</Text></View>
        )}

        {/* Production */}
        <SectionTitle title={t('daily.production.title')} />
        <SummaryRow items={[
          { label: t('daily.production.runCount'), value: String(data.production.summary.totalRuns) },
          { label: t('daily.production.totalInput'), value: num(data.production.summary.totalInputKg) },
          { label: t('daily.production.totalOutput'), value: num(data.production.summary.totalOutputKg) },
          { label: t('daily.production.avgYield'), value: data.production.summary.avgYield > 0 ? `${data.production.summary.avgYield}%` : '—' },
        ]} />
        {data.production.runs.length > 0 ? (
          <>
            <View style={S.thRow} wrap={false}>
              <Text style={[S.th, { width: 95 }]}>{t('daily.production.runNo')}</Text>
              <Text style={[S.th, { flex: 1 }]}>{t('daily.production.input')}</Text>
              <Text style={[S.th, { width: 70, textAlign: 'right' }]}>{t('daily.production.inputQty')}</Text>
              <Text style={[S.th, { flex: 1 }]}>{t('daily.production.output')}</Text>
              <Text style={[S.th, { width: 70, textAlign: 'right' }]}>{t('daily.production.outputQty')}</Text>
              <Text style={[S.th, { width: 60, textAlign: 'right' }]}>{t('daily.production.yield')}</Text>
            </View>
            {data.production.runs.map((run: any, i: number) => {
              const totalIn = run.inputs.reduce((s: number, x: any) => s + x.quantity, 0);
              const totalOut = run.outputs.reduce((s: number, x: any) => s + x.quantity, 0);
              return (
                <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
                  <Text style={[S.cell, { width: 95 }]}>{run.runNumber}</Text>
                  <Text style={[S.cell, { flex: 1 }]}>{run.inputs.map((x: any) => x.itemName).join(', ')}</Text>
                  <Text style={[S.cellRight, { width: 70 }]}>{num(totalIn)} kg</Text>
                  <Text style={[S.cell, { flex: 1 }]}>{run.outputs.map((x: any) => `${x.itemName}${x.isByProduct ? ' *' : ''}`).join(', ')}</Text>
                  <Text style={[S.cellRight, { width: 70 }]}>{num(totalOut)} kg</Text>
                  <Text style={[S.cellRight, { width: 60 }]}>{run.yieldPct ? `${run.yieldPct}%` : '—'}</Text>
                </View>
              );
            })}
          </>
        ) : (
          <View style={S.empty}><Text style={S.emptyText}>{t('daily.production.empty')}</Text></View>
        )}

        {/* Stock position (snapshot at the end of the date) */}
        {data.stock && (
          <>
            <SectionTitle title={t('daily.stock.title')} />
            <SummaryRow items={[
              { label: t('daily.stock.warehouseCount'), value: String(data.stock.summary.totalWarehouses) },
              { label: t('daily.stock.itemLines'), value: String(data.stock.summary.totalItemLines) },
              { label: t('daily.stock.negativeItems'), value: String(data.stock.summary.totalNegative) },
              { label: t('daily.stock.totalValue'), value: idr(data.stock.summary.grandTotalValue) },
            ]} />
            <Text style={{ fontSize: 6.5, color: C.faint, fontStyle: 'italic', marginTop: 3, marginBottom: 2, paddingHorizontal: 2 }}>
              {data.stock.valuationNote}
            </Text>
            {data.stock.warehouses.filter((w: any) => w.items.length > 0).length === 0 ? (
              <View style={S.empty}><Text style={S.emptyText}>{t('daily.stock.empty')}</Text></View>
            ) : (
              data.stock.warehouses.filter((w: any) => w.items.length > 0).map((w: any, wi: number) => (
                <View key={wi} wrap={false}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.bgLight, paddingVertical: 3, paddingHorizontal: 6, marginTop: 6 }}>
                    <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.dark }}>
                      {w.code} · {w.name}{w.isDefault ? ` ${t('common.defaultMark')}` : ''} · {t('common.itemCount', { count: w.itemCount })}
                    </Text>
                    <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.dark }}>{idr(w.totalValue)}</Text>
                  </View>
                  <View style={S.thRow} wrap={false}>
                    <Text style={[S.th, { width: 80 }]}>{t('common.code')}</Text>
                    <Text style={[S.th, { flex: 1 }]}>{t('common.itemName')}</Text>
                    <Text style={[S.th, { width: 30, textAlign: 'center' }]}>{t('common.unitShort')}</Text>
                    <Text style={[S.th, { width: 65, textAlign: 'right' }]}>{t('common.stock')}</Text>
                    <Text style={[S.th, { width: 60, textAlign: 'right' }]}>{t('common.avgCost')}</Text>
                    <Text style={[S.th, { width: 80, textAlign: 'right' }]}>{t('common.value')}</Text>
                  </View>
                  {w.items.map((it: any, ii: number) => (
                    <View key={ii} style={[S.row, ii % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
                      <Text style={[S.cell, { width: 80, fontSize: 7 }]}>{it.code}</Text>
                      <Text style={[S.cell, { flex: 1 }]}>{it.name}</Text>
                      <Text style={[S.cell, { width: 30, textAlign: 'center', color: C.muted }]}>{it.unit}</Text>
                      <Text style={[S.cellRight, { width: 65, color: it.qty < 0 ? C.red : C.dark }]}>{num(it.qty)}</Text>
                      <Text style={[S.cellRight, { width: 60, color: C.muted }]}>{it.averageCost > 0 ? pdfNum(Math.round(it.averageCost)) : '—'}</Text>
                      <Text style={[S.cellRight, { width: 80, color: it.value < 0 ? C.red : C.dark }]}>{it.value !== 0 ? idr(it.value) : '—'}</Text>
                    </View>
                  ))}
                </View>
              ))
            )}
          </>
        )}

        {/* Finance */}
        <SectionTitle title={t('daily.finance.title')} />
        <SummaryRow items={[
          { label: t('daily.finance.cashIn'), value: idr(data.finance.summary.totalIn) },
          { label: t('daily.finance.cashOut'), value: idr(data.finance.summary.totalOut) },
          { label: t('daily.finance.netCashFlow'), value: idr(data.finance.summary.netCashFlow) },
          { label: t('daily.finance.manualJournals'), value: String(data.finance.manualJournals) },
        ]} />
        <View style={S.summaryBox} wrap={false}>
          {data.finance.cashBankBalances.map((cb: any, i: number) => (
            <View key={i} style={S.summaryItem}>
              <Text style={S.summaryLabel}>{cb.accountNumber} {cb.accountName}</Text>
              <Text style={S.summaryValue}>{idr(cb.balance)}</Text>
            </View>
          ))}
        </View>
        {(data.finance.paymentsIn.length > 0 || data.finance.paymentsOut.length > 0) && (
          <>
            <View style={S.thRow} wrap={false}>
              <Text style={[S.th, { width: 110 }]}>{t('daily.finance.paymentNo')}</Text>
              <Text style={[S.th, { flex: 1 }]}>{t('daily.finance.party')}</Text>
              <Text style={[S.th, { width: 80 }]}>{t('daily.finance.account')}</Text>
              <Text style={[S.th, { width: 55, textAlign: 'center' }]}>{t('daily.finance.type')}</Text>
              <Text style={[S.th, { width: 110, textAlign: 'right' }]}>{t('common.amount')}</Text>
            </View>
            {[...data.finance.paymentsIn.map((p: any) => ({ ...p, isIn: true })),
              ...data.finance.paymentsOut.map((p: any) => ({ ...p, isIn: false }))
            ].map((p: any, i: number) => (
              <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
                <Text style={[S.cell, { width: 110 }]}>{p.paymentNumber}</Text>
                <Text style={[S.cell, { flex: 1 }]}>{p.partyName}</Text>
                <Text style={[S.cell, { width: 80 }]}>{p.accountName}</Text>
                <Text style={[S.cell, { width: 55, textAlign: 'center', color: p.isIn ? C.green : C.red }]}>{p.isIn ? t('daily.finance.in') : t('daily.finance.out')}</Text>
                <Text style={[S.cellRight, { width: 110 }]}>{idr(p.amount)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Receivables */}
        <SectionTitle title={t('daily.receivables.title')} />
        <SummaryRow items={[
          { label: t('daily.receivables.total'), value: idr(data.receivables.summary.totalOutstanding) },
          { label: t('daily.aging.overdue'), value: idr(data.receivables.summary.totalOverdue) },
          { label: t('common.customer'), value: String(data.receivables.summary.totalCustomers) },
        ]} />
        {data.receivables.byCustomer.length > 0 ? (
          <>
            <AgingHead t={t} partyLabel={t('common.customer')} />
            {data.receivables.byCustomer.map((c: any, i: number) => (
              <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
                <Text style={[S.cell, { flex: 1 }]}>{c.customerName}</Text>
                <Text style={[S.cellRight, { width: 95 }]}>{c.current > 0 ? idr(c.current) : '—'}</Text>
                <Text style={[S.cellRight, { width: 95 }]}>{c.d1_30 > 0 ? idr(c.d1_30) : '—'}</Text>
                <Text style={[S.cellRight, { width: 95 }]}>{c.d31_60 > 0 ? idr(c.d31_60) : '—'}</Text>
                <Text style={[S.cellRight, { width: 95 }]}>{c.d61_90 > 0 ? idr(c.d61_90) : '—'}</Text>
                <Text style={[S.cellRight, { width: 95, color: c.d91_plus > 0 ? C.red : C.faint }]}>{c.d91_plus > 0 ? idr(c.d91_plus) : '—'}</Text>
                <Text style={[S.cellRightBold, { width: 110 }]}>{idr(c.total)}</Text>
              </View>
            ))}
          </>
        ) : (
          <View style={S.empty}><Text style={S.emptyText}>{t('daily.receivables.empty')}</Text></View>
        )}

        {/* Payables */}
        <SectionTitle title={t('daily.payables.title')} />
        <SummaryRow items={[
          { label: t('daily.payables.total'), value: idr(data.payables.summary.totalOutstanding) },
          { label: t('daily.aging.overdue'), value: idr(data.payables.summary.totalOverdue) },
          { label: t('common.supplier'), value: String(data.payables.summary.totalSuppliers) },
        ]} />
        {data.payables.bySupplier.length > 0 ? (
          <>
            <AgingHead t={t} partyLabel={t('common.supplier')} />
            {data.payables.bySupplier.map((s: any, i: number) => (
              <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
                <Text style={[S.cell, { flex: 1 }]}>{s.supplierName}</Text>
                <Text style={[S.cellRight, { width: 95 }]}>{s.current > 0 ? idr(s.current) : '—'}</Text>
                <Text style={[S.cellRight, { width: 95 }]}>{s.d1_30 > 0 ? idr(s.d1_30) : '—'}</Text>
                <Text style={[S.cellRight, { width: 95 }]}>{s.d31_60 > 0 ? idr(s.d31_60) : '—'}</Text>
                <Text style={[S.cellRight, { width: 95 }]}>{s.d61_90 > 0 ? idr(s.d61_90) : '—'}</Text>
                <Text style={[S.cellRight, { width: 95, color: s.d91_plus > 0 ? C.red : C.faint }]}>{s.d91_plus > 0 ? idr(s.d91_plus) : '—'}</Text>
                <Text style={[S.cellRightBold, { width: 110 }]}>{idr(s.total)}</Text>
              </View>
            ))}
          </>
        ) : (
          <View style={S.empty}><Text style={S.emptyText}>{t('daily.payables.empty')}</Text></View>
        )}

        {/* Supplier deposits */}
        <SectionTitle title={t('daily.deposits.title')} />
        <SummaryRow items={[
          { label: t('daily.deposits.total'), value: idr(data.vendorDeposits.summary.totalDeposits) },
          { label: t('daily.deposits.applied'), value: idr(data.vendorDeposits.summary.totalApplied) },
          { label: t('daily.deposits.remaining'), value: idr(data.vendorDeposits.summary.totalRemaining) },
        ]} />
        {data.vendorDeposits.deposits.length > 0 ? (
          <>
            <View style={S.thRow} wrap={false}>
              <Text style={[S.th, { width: 110 }]}>{t('daily.finance.paymentNo')}</Text>
              <Text style={[S.th, { flex: 1 }]}>{t('common.supplier')}</Text>
              <Text style={[S.th, { width: 110, textAlign: 'right' }]}>{t('daily.deposits.amount')}</Text>
              <Text style={[S.th, { width: 110, textAlign: 'right' }]}>{t('daily.deposits.allocated')}</Text>
              <Text style={[S.th, { width: 110, textAlign: 'right' }]}>{t('common.remaining')}</Text>
            </View>
            {data.vendorDeposits.deposits.map((d: any, i: number) => (
              <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
                <Text style={[S.cell, { width: 110 }]}>{d.paymentNumber}</Text>
                <Text style={[S.cell, { flex: 1 }]}>{d.supplierName}</Text>
                <Text style={[S.cellRight, { width: 110 }]}>{idr(d.amount)}</Text>
                <Text style={[S.cellRight, { width: 110 }]}>{idr(d.totalApplied)}</Text>
                <Text style={[S.cellRightBold, { width: 110 }]}>{idr(d.remaining)}</Text>
              </View>
            ))}
          </>
        ) : (
          <View style={S.empty}><Text style={S.emptyText}>{t('daily.deposits.empty')}</Text></View>
        )}

        <Footer company={company} />
      </Page>
    </Document>
  );
};
