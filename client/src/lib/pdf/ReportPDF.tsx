import React from 'react';
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import { C, FOOTER_SPACE } from './theme';
import { pdfDate, pdfDateShort, pdfRp, pdfT } from './pdfFormat';
import { PdfFooter, PdfHeader } from './kit';

// Palette
const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    color: C.dark,
    paddingTop: 36,
    paddingBottom: FOOTER_SPACE,
    paddingHorizontal: 36,
    backgroundColor: C.white,
  },

  // Report header
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  companyBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  companyLogo: { width: 46, height: 46, objectFit: 'contain' as const },
  companyInfo: { flexDirection: 'column' as const },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.primary },
  companyMeta: { fontSize: 7, color: C.muted, marginTop: 1 },
  reportTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.dark, textAlign: 'right' },
  reportPeriod: { fontSize: 8, color: C.muted, textAlign: 'right', marginTop: 2 },
  reportDate: { fontSize: 7.5, color: C.faint, textAlign: 'right', marginTop: 1 },
  divider: { height: 1.5, backgroundColor: C.primary, marginBottom: 14, marginTop: 8 },

  // Section header
  sectionHeader: { borderLeftWidth: 3, borderLeftColor: C.primary, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 0 },
  sectionHeaderText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.primary, letterSpacing: 0.5 },

  // Data rows
  row: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowAlt: { backgroundColor: C.bgLight },
  rowGroup: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowTotal: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.primary },
  rowGrandTotal: { flexDirection: 'row', borderTopWidth: 1.5, borderTopColor: C.primary, paddingVertical: 7, paddingHorizontal: 8, marginTop: 4 },

  colLabel:    { flex: 1, fontSize: 8, color: C.mid },
  colLabelBold: { flex: 1, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark },
  colLabelGroup: { flex: 1, fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.primary },
  colLabelIndent: { flex: 1, fontSize: 8, color: C.mid, paddingLeft: 16 },
  colLabelIndent2: { flex: 1, fontSize: 8, color: C.mid, paddingLeft: 28 },
  colAccNumber: { width: 52, fontSize: 7.5, color: C.faint, fontFamily: 'Helvetica' },
  colDebit:  { width: 90, textAlign: 'right', fontSize: 8, fontFamily: 'Helvetica', color: C.mid },
  colCredit: { width: 90, textAlign: 'right', fontSize: 8, fontFamily: 'Helvetica', color: C.mid },
  colBalance:{ width: 100, textAlign: 'right', fontSize: 8, fontFamily: 'Helvetica', color: C.mid },
  colTotalBold: { width: 100, textAlign: 'right', fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark },
  colTotalWhite: { width: 100, textAlign: 'right', fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.primary },
  colGTLabel: { flex: 1, fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.primary },

  // Summary box
  summaryBox: {
    marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end',
  },

  // Footer
  footer: { position: 'absolute', bottom: 18, left: 36, right: 36 },
  footerLine: { height: 0.5, backgroundColor: C.border, marginBottom: 3 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: C.faint },
});

/** Signed rupiah: negative values keep their minus sign. */
function idr(n: number, showSign = false): string {
  const prefix = showSign && n > 0 ? '+' : '';
  return prefix + pdfRp(n);
}
/** ISO dates (YYYY-MM-DD) inside the period text become "04 Okt 2026" / "Oct 04, 2026". */
const prettyPeriod = (s: string): string =>
  s.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (m) => pdfDateShort(m));
const today = (): string => pdfDate(new Date());

export interface CompanyInfo { name: string; address?: string | null; taxId?: string | null; logoUrl?: string | null; }

// Trial Balance
export interface TrialBalanceRow {
  accountNumber: string; accountName: string;
  debit: number; credit: number;
}
interface TrialBalancePDFProps {
  company: CompanyInfo;
  period: string;
  rows: TrialBalanceRow[];
}
export const TrialBalancePDF: React.FC<TrialBalancePDFProps> = ({ company, period, rows }) => {
  const totalDebit  = rows.reduce((s, r) => s + Number(r.debit),  0);
  const totalCredit = rows.reduce((s, r) => s + Number(r.credit), 0);
  const t = pdfT();
  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        <ReportHeader company={company} title={t('report.trialBalance.title')} period={period} />
        <View style={S.sectionHeader} fixed minPresenceAhead={60}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={[S.sectionHeaderText, { width: 52 }]}>{t('common.code')}</Text>
            <Text style={[S.sectionHeaderText, { flex: 1 }]}>{t('report.trialBalance.accountName')}</Text>
            <Text style={[S.sectionHeaderText, S.colDebit]}>{t('report.trialBalance.debit')}</Text>
            <Text style={[S.sectionHeaderText, S.colCredit]}>{t('report.trialBalance.credit')}</Text>
          </View>
        </View>
        {rows.map((r, i) => (
          <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
            <Text style={S.colAccNumber}>{r.accountNumber}</Text>
            <Text style={S.colLabel}>{r.accountName}</Text>
            <Text style={[S.colDebit, Number(r.debit) !== 0 ? {} : { color: C.faint }]}>{Number(r.debit) !== 0 ? idr(Number(r.debit)) : '—'}</Text>
            <Text style={[S.colCredit, Number(r.credit) !== 0 ? {} : { color: C.faint }]}>{Number(r.credit) !== 0 ? idr(Number(r.credit)) : '—'}</Text>
          </View>
        ))}
        <View style={S.rowGrandTotal} wrap={false}>
          <Text style={{ width: 52, fontSize: 8, color: C.primary }}>{t('common.totalUpper')}</Text>
          <Text style={[S.colGTLabel, { fontSize: 8 }]}> </Text>
          <Text style={S.colTotalWhite}>{idr(totalDebit)}</Text>
          <Text style={S.colTotalWhite}>{idr(totalCredit)}</Text>
        </View>
        <View style={[S.summaryBox, { marginTop: 8 }]} wrap={false}>
          <Text style={{ fontSize: 7.5, color: Math.abs(totalDebit - totalCredit) < 1 ? C.green : C.red, fontFamily: 'Helvetica-Bold' }}>
            {Math.abs(totalDebit - totalCredit) < 1 ? t('report.trialBalance.balanced') : t('report.trialBalance.unbalanced')}
          </Text>
        </View>
        <ReportFooter company={company} title={t('report.trialBalance.docRef')} />
      </Page>
    </Document>
  );
};

// P&L
export interface PLSection { name: string; accountNumber?: string; balance: number; children?: PLSection[]; }
interface PLPDFProps {
  company: CompanyInfo; period: string;
  revenue: PLSection[]; totalRevenue: number;
  expense: PLSection[]; totalExpense: number;
  netProfit: number;
}
export const ProfitLossPDF: React.FC<PLPDFProps> = ({ company, period, revenue, expense, totalRevenue, totalExpense, netProfit }) => {
  const t = pdfT();
  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        <ReportHeader company={company} title={t('report.profitLoss.title')} period={period} />

        {/* Revenue */}
        <View style={S.sectionHeader} wrap={false} minPresenceAhead={60}><Text style={S.sectionHeaderText}>{t('report.profitLoss.revenue')}</Text></View>
        {revenue.map((r, i) => <PLRow key={i} item={r} depth={0} alt={i % 2 === 1} />)}
        <View style={S.rowTotal} wrap={false}>
          <Text style={S.colLabelBold}>{t('report.profitLoss.totalRevenue')}</Text>
          <Text style={[S.colTotalBold, { color: C.green }]}>{idr(Number(totalRevenue))}</Text>
        </View>

        <View style={{ height: 10 }} />

        {/* Expense */}
        <View style={S.sectionHeader} wrap={false} minPresenceAhead={60}><Text style={S.sectionHeaderText}>{t('report.profitLoss.expense')}</Text></View>
        {expense.map((r, i) => <PLRow key={i} item={r} depth={0} alt={i % 2 === 1} />)}
        <View style={S.rowTotal} wrap={false}>
          <Text style={S.colLabelBold}>{t('report.profitLoss.totalExpense')}</Text>
          <Text style={[S.colTotalBold, { color: C.red }]}>{idr(Number(totalExpense))}</Text>
        </View>

        {/* Net profit */}
        <View style={S.rowGrandTotal} wrap={false}>
          <Text style={S.colGTLabel}>{t('report.profitLoss.netProfit')}</Text>
          <Text style={[S.colTotalWhite, { color: Number(netProfit) >= 0 ? C.greenDk : C.redDk }]}>
            {idr(Number(netProfit))}
          </Text>
        </View>
        <ReportFooter company={company} title={t('report.profitLoss.docRef')} />
      </Page>
    </Document>
  );
};

function PLRow({ item, depth, alt }: { item: PLSection; depth: number; alt: boolean }) {
  const indent = depth === 0 ? S.colLabelBold : depth === 1 ? S.colLabelIndent : S.colLabelIndent2;
  const hasChildren = item.children && item.children.length > 0;
  return (
    <>
      <View style={hasChildren ? S.rowGroup : [S.row, alt ? S.rowAlt : {}]} wrap={false} minPresenceAhead={hasChildren ? 40 : 0}>
        <Text style={indent}>{item.name}</Text>
        {!hasChildren && <Text style={S.colTotalBold}>{idr(Number(item.balance))}</Text>}
        {hasChildren && <Text style={[S.colTotalBold, { color: C.primary }]}> </Text>}
      </View>
      {hasChildren && item.children!.map((c, ci) => (
        <PLRow key={ci} item={c} depth={depth + 1} alt={ci % 2 === 1} />
      ))}
    </>
  );
}

// Balance Sheet
export interface BSSection { name: string; balance: number; children?: BSSection[]; }
interface BSPDFProps {
  company: CompanyInfo; asOf: string;
  assets: BSSection[]; totalAssets: number;
  liabilities: BSSection[]; totalLiabilities: number;
  equity: BSSection[]; totalEquity: number;
}
export const BalanceSheetPDF: React.FC<BSPDFProps> = ({ company, asOf, assets, totalAssets, liabilities, equity, totalLiabilities, totalEquity }) => {
  const t = pdfT();
  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        <ReportHeader company={company} title={t('report.balanceSheet.title')} period={t('common.asOf', { date: asOf })} />

        {/* Assets */}
        <View style={S.sectionHeader} wrap={false} minPresenceAhead={60}><Text style={S.sectionHeaderText}>{t('report.balanceSheet.assets')}</Text></View>
        {assets.map((a, i) => <BSRow key={i} item={a} depth={0} alt={i % 2 === 1} />)}
        <View style={S.rowTotal} wrap={false}>
          <Text style={S.colLabelBold}>{t('report.balanceSheet.totalAssets')}</Text>
          <Text style={S.colTotalBold}>{idr(Number(totalAssets))}</Text>
        </View>

        <View style={{ height: 12 }} />

        {/* Liabilities */}
        <View style={S.sectionHeader} wrap={false} minPresenceAhead={60}><Text style={S.sectionHeaderText}>{t('report.balanceSheet.liabilities')}</Text></View>
        {liabilities.map((a, i) => <BSRow key={i} item={a} depth={0} alt={i % 2 === 1} />)}
        <View style={S.rowTotal} wrap={false}>
          <Text style={S.colLabelBold}>{t('report.balanceSheet.totalLiabilities')}</Text>
          <Text style={S.colTotalBold}>{idr(Number(totalLiabilities))}</Text>
        </View>

        <View style={{ height: 8 }} />

        {/* Equity */}
        <View style={S.sectionHeader} wrap={false} minPresenceAhead={60}><Text style={S.sectionHeaderText}>{t('report.balanceSheet.equity')}</Text></View>
        {equity.map((a, i) => <BSRow key={i} item={a} depth={0} alt={i % 2 === 1} />)}
        <View style={S.rowTotal} wrap={false}>
          <Text style={S.colLabelBold}>{t('report.balanceSheet.totalEquity')}</Text>
          <Text style={S.colTotalBold}>{idr(Number(totalEquity))}</Text>
        </View>

        {/* Grand total + balance check (one block so they never split across pages) */}
        <View wrap={false}>
        <View style={S.rowGrandTotal}>
          <Text style={S.colGTLabel}>{t('report.balanceSheet.totalLiabilitiesEquity')}</Text>
          <Text style={S.colTotalWhite}>{idr(Number(totalLiabilities) + Number(totalEquity))}</Text>
        </View>

        {/* Balance check */}
        <View style={[S.summaryBox, { marginTop: 8 }]}>
          <Text style={{ fontSize: 7.5, color: Math.abs(Number(totalAssets) - (Number(totalLiabilities) + Number(totalEquity))) < 1 ? C.green : C.red, fontFamily: 'Helvetica-Bold' }}>
            {Math.abs(Number(totalAssets) - (Number(totalLiabilities) + Number(totalEquity))) < 1 ? t('report.balanceSheet.balanced') : t('report.balanceSheet.unbalanced')}
          </Text>
        </View>
        </View>

        <ReportFooter company={company} title={t('report.balanceSheet.docRef')} />
      </Page>
    </Document>
  );
};

function BSRow({ item, depth, alt }: { item: BSSection; depth: number; alt: boolean }) {
  const indent = depth === 0 ? S.colLabelBold : depth === 1 ? S.colLabelIndent : S.colLabelIndent2;
  const hasChildren = item.children && item.children.length > 0;
  return (
    <>
      <View style={hasChildren ? S.rowGroup : [S.row, alt ? S.rowAlt : {}]} wrap={false} minPresenceAhead={hasChildren ? 40 : 0}>
        <Text style={indent}>{item.name}</Text>
        {!hasChildren && <Text style={S.colBalance}>{idr(Number(item.balance))}</Text>}
      </View>
      {hasChildren && item.children!.map((c, ci) => (
        <BSRow key={ci} item={c} depth={depth + 1} alt={ci % 2 === 1} />
      ))}
    </>
  );
}

// Cash Flow
interface CFItem { description: string; amount: number; }
interface CFPDFProps {
  company: CompanyInfo; period: string;
  operating: number; operatingItems?: CFItem[];
  investing: number; investingItems?: CFItem[];
  financing: number; financingItems?: CFItem[];
  netChange: number; openingBalance?: number; closingBalance?: number;
}
export const CashFlowPDF: React.FC<CFPDFProps> = ({
  company, period, operating, investing, financing, netChange,
  operatingItems = [], investingItems = [], financingItems = [],
  openingBalance = 0, closingBalance,
}) => {
  const closing = closingBalance ?? (Number(openingBalance) + Number(netChange));
  const t = pdfT();
  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        <ReportHeader company={company} title={t('report.cashFlow.title')} period={period} />

        <CFSection title={t('report.cashFlow.operating')} subtotalLabel={t('report.cashFlow.operatingSubtotal')} items={operatingItems} total={operating} />
        <View style={{ height: 8 }} />
        <CFSection title={t('report.cashFlow.investing')} subtotalLabel={t('report.cashFlow.investingSubtotal')} items={investingItems} total={investing} />
        <View style={{ height: 8 }} />
        <CFSection title={t('report.cashFlow.financing')} subtotalLabel={t('report.cashFlow.financingSubtotal')} items={financingItems} total={financing} />

        <View style={{ marginTop: 12 }}>
          <View style={S.rowTotal} wrap={false}>
            <Text style={S.colLabelBold}>{t('report.cashFlow.netChange')}</Text>
            <Text style={[S.colTotalBold, { color: Number(netChange) >= 0 ? C.green : C.red }]}>{idr(Number(netChange), true)}</Text>
          </View>
          {openingBalance !== undefined && (
            <View style={[S.row, S.rowAlt]} wrap={false}>
              <Text style={S.colLabel}>{t('report.cashFlow.openingBalance')}</Text>
              <Text style={S.colBalance}>{idr(Number(openingBalance))}</Text>
            </View>
          )}
          <View style={S.rowGrandTotal} wrap={false}>
            <Text style={S.colGTLabel}>{t('report.cashFlow.closingBalance')}</Text>
            <Text style={S.colTotalWhite}>{idr(Number(closing))}</Text>
          </View>
        </View>

        <ReportFooter company={company} title={t('report.cashFlow.docRef')} />
      </Page>
    </Document>
  );
};

function CFSection({ title, subtotalLabel, items, total }: { title: string; subtotalLabel: string; items: CFItem[]; total: number }) {
  const t = pdfT();
  return (
    <>
      <View style={S.sectionHeader} wrap={false} minPresenceAhead={60}><Text style={S.sectionHeaderText}>{title}</Text></View>
      {items.length === 0 ? (
        <View style={S.row} wrap={false}><Text style={[S.colLabel, { color: C.faint, fontStyle: 'italic' }]}>{t('report.cashFlow.noTransactions')}</Text><Text style={S.colBalance}>{idr(0)}</Text></View>
      ) : items.map((it, i) => (
        <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
          <Text style={S.colLabel}>{it.description}</Text>
          <Text style={[S.colBalance, { color: Number(it.amount) < 0 ? C.red : C.mid }]}>{idr(Number(it.amount), true)}</Text>
        </View>
      ))}
      <View style={S.rowTotal} wrap={false}>
        <Text style={S.colLabelBold}>{subtotalLabel}</Text>
        <Text style={[S.colTotalBold, { color: Number(total) >= 0 ? C.green : C.red }]}>{idr(Number(total), true)}</Text>
      </View>
    </>
  );
}

// Aging Analysis
export interface AgingRow {
  name: string;
  current: number;
  d1_30: number;
  d31_60: number;
  d61_90: number;
  d91_plus: number;
  total: number;
}
interface AgingPDFProps {
  company: CompanyInfo;
  type: 'Customer' | 'Supplier';
  rows: AgingRow[];
  totals: AgingRow;
}
export const AgingPDF: React.FC<AgingPDFProps> = ({ company, type, rows, totals }) => {
  const t = pdfT();
  const title = type === 'Customer' ? t('report.aging.titleCustomer') : t('report.aging.titleSupplier');
  const cols = [t('report.aging.current'), '1-30', '31-60', '61-90', '>90', t('common.total')];
  const w = 88;
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={S.page} wrap>
        <ReportHeader company={company} title={title} period={t('common.asOf', { date: today() })} />
        <View style={S.sectionHeader} fixed minPresenceAhead={60}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={[S.sectionHeaderText, { flex: 1 }]}>{t('report.aging.partner')}</Text>
            {cols.map((c) => (
              <Text key={c} style={[S.sectionHeaderText, { width: w, textAlign: 'right', paddingLeft: 4 }]}>{c}</Text>
            ))}
          </View>
        </View>
        {rows.map((r, i) => (
          <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
            <Text style={[S.colLabel, { flex: 1 }]}>{r.name}</Text>
            <Text style={[S.colBalance, { width: w, paddingLeft: 4 }]}>{idr(r.current)}</Text>
            <Text style={[S.colBalance, { width: w, paddingLeft: 4 }]}>{idr(r.d1_30)}</Text>
            <Text style={[S.colBalance, { width: w, paddingLeft: 4, color: r.d31_60 > 0 ? C.amber : C.muted }]}>{idr(r.d31_60)}</Text>
            <Text style={[S.colBalance, { width: w, paddingLeft: 4, color: r.d61_90 > 0 ? C.orange : C.muted }]}>{idr(r.d61_90)}</Text>
            <Text style={[S.colBalance, { width: w, paddingLeft: 4, color: r.d91_plus > 0 ? C.red : C.muted }]}>{idr(r.d91_plus)}</Text>
            <Text style={[S.colTotalBold, { width: w, paddingLeft: 4 }]}>{idr(r.total)}</Text>
          </View>
        ))}
        <View style={S.rowGrandTotal} wrap={false}>
          <Text style={[S.colGTLabel, { flex: 1 }]}>{t('common.totalUpper')}</Text>
          <Text style={[S.colTotalWhite, { width: w, paddingLeft: 4 }]}>{idr(totals.current)}</Text>
          <Text style={[S.colTotalWhite, { width: w, paddingLeft: 4 }]}>{idr(totals.d1_30)}</Text>
          <Text style={[S.colTotalWhite, { width: w, paddingLeft: 4 }]}>{idr(totals.d31_60)}</Text>
          <Text style={[S.colTotalWhite, { width: w, paddingLeft: 4 }]}>{idr(totals.d61_90)}</Text>
          <Text style={[S.colTotalWhite, { width: w, paddingLeft: 4 }]}>{idr(totals.d91_plus)}</Text>
          <Text style={[S.colTotalWhite, { width: w, paddingLeft: 4 }]}>{idr(totals.total)}</Text>
        </View>
        <ReportFooter company={company} title={type === 'Customer' ? t('report.aging.docRefCustomer') : t('report.aging.docRefSupplier')} />
      </Page>
    </Document>
  );
};

function ReportHeader({ company, title, period }: { company: CompanyInfo; title: string; period: string }) {
  const t = pdfT();
  return <PdfHeader company={company} title={title} dateLine={prettyPeriod(period)} extraLines={[t('common.printedLine', { date: today() })]} />;
}

function ReportFooter({ company, title }: { company: CompanyInfo; title: string }) {
  return <PdfFooter company={company.name} docRef={title} paddingHorizontal={36} />;
}
