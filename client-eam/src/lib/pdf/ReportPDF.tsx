import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';

Font.registerHyphenationCallback((word) => [word]);

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
  primary:   '#374151',
  primaryLt: '#f3f4f6',
  dark:      '#111827',
  mid:       '#374151',
  muted:     '#6b7280',
  faint:     '#9ca3af',
  border:    '#e5e7eb',
  bgLight:   '#f9fafb',
  white:     '#ffffff',
  red:       '#dc2626',
  green:     '#16a34a',
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    color: C.dark,
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 36,
    backgroundColor: C.white,
  },

  // ── Report header ──
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.primary },
  companyMeta: { fontSize: 7, color: C.muted, marginTop: 1 },
  reportTitle: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.dark, textAlign: 'right' },
  reportPeriod: { fontSize: 8, color: C.muted, textAlign: 'right', marginTop: 2 },
  reportDate: { fontSize: 7.5, color: C.faint, textAlign: 'right', marginTop: 1 },
  divider: { height: 1.5, backgroundColor: C.primary, marginBottom: 14, marginTop: 8 },

  // ── Section header ──
  sectionHeader: { backgroundColor: C.primary, paddingVertical: 5, paddingHorizontal: 8, marginBottom: 0 },
  sectionHeaderText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white, letterSpacing: 0.5 },

  // ── Data rows ──
  row: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowAlt: { backgroundColor: C.bgLight },
  rowGroup: { flexDirection: 'row', backgroundColor: '#eff6ff', paddingVertical: 5, paddingHorizontal: 8, borderBottomWidth: 0.5, borderBottomColor: C.primaryLt },
  rowTotal: { flexDirection: 'row', backgroundColor: C.primaryLt, paddingVertical: 6, paddingHorizontal: 8, borderTopWidth: 1, borderTopColor: C.primary },
  rowGrandTotal: { flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 7, paddingHorizontal: 8, marginTop: 4 },

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
  colTotalWhite: { width: 100, textAlign: 'right', fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.white },
  colGTLabel: { flex: 1, fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.white },

  // ── Summary box ──
  summaryBox: {
    marginTop: 12, flexDirection: 'row', justifyContent: 'flex-end',
  },

  // ── Footer ──
  footer: { position: 'absolute', bottom: 18, left: 36, right: 36 },
  footerLine: { height: 0.5, backgroundColor: C.border, marginBottom: 3 },
  footerRow: { flexDirection: 'row', justifyContent: 'space-between' },
  footerText: { fontSize: 7, color: C.faint },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function idr(n: number, showSign = false): string {
  const prefix = showSign && n > 0 ? '+' : '';
  return prefix + 'Rp ' + Math.abs(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function today(): string {
  return new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CompanyInfo { name: string; address?: string | null; taxId?: string | null; }

// ── Trial Balance ─────────────────────────────────────────────────────────────
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
  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        <ReportHeader company={company} title="NERACA SALDO" period={period} />
        <View style={S.sectionHeader} wrap={false}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={[S.sectionHeaderText, { width: 52 }]}>Kode</Text>
            <Text style={[S.sectionHeaderText, { flex: 1 }]}>Nama Akun</Text>
            <Text style={[S.sectionHeaderText, S.colDebit]}>Debit</Text>
            <Text style={[S.sectionHeaderText, S.colCredit]}>Kredit</Text>
          </View>
        </View>
        {rows.map((r, i) => (
          <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
            <Text style={S.colAccNumber}>{r.accountNumber}</Text>
            <Text style={S.colLabel}>{r.accountName}</Text>
            <Text style={[S.colDebit, Number(r.debit)  > 0 ? {} : { color: C.faint }]}>{Number(r.debit)  > 0 ? idr(Number(r.debit))  : '—'}</Text>
            <Text style={[S.colCredit, Number(r.credit) > 0 ? {} : { color: C.faint }]}>{Number(r.credit) > 0 ? idr(Number(r.credit)) : '—'}</Text>
          </View>
        ))}
        <View style={S.rowGrandTotal} wrap={false}>
          <Text style={{ width: 52, fontSize: 8, color: C.white }}>TOTAL</Text>
          <Text style={[S.colGTLabel, { fontSize: 8 }]}> </Text>
          <Text style={S.colTotalWhite}>{idr(totalDebit)}</Text>
          <Text style={S.colTotalWhite}>{idr(totalCredit)}</Text>
        </View>
        <View style={[S.summaryBox, { marginTop: 8 }]} wrap={false}>
          <Text style={{ fontSize: 7.5, color: totalDebit === totalCredit ? C.green : C.red, fontFamily: 'Helvetica-Bold' }}>
            {totalDebit === totalCredit ? '✓ Neraca Saldo Seimbang' : '⚠ Neraca Saldo Tidak Seimbang'}
          </Text>
        </View>
        <ReportFooter company={company} title="Neraca Saldo" />
      </Page>
    </Document>
  );
};

// ── P&L ───────────────────────────────────────────────────────────────────────
export interface PLSection { name: string; accountNumber?: string; balance: number; children?: PLSection[]; }
interface PLPDFProps {
  company: CompanyInfo; period: string;
  revenue: PLSection[]; totalRevenue: number;
  expense: PLSection[]; totalExpense: number;
  netProfit: number;
}
export const ProfitLossPDF: React.FC<PLPDFProps> = ({ company, period, revenue, expense, totalRevenue, totalExpense, netProfit }) => (
  <Document>
    <Page size="A4" style={S.page} wrap>
      <ReportHeader company={company} title="LAPORAN LABA RUGI" period={period} />

      {/* Revenue */}
      <View style={S.sectionHeader} wrap={false}><Text style={S.sectionHeaderText}>PENDAPATAN</Text></View>
      {revenue.map((r, i) => <PLRow key={i} item={r} depth={0} alt={i % 2 === 1} />)}
      <View style={S.rowTotal} wrap={false}>
        <Text style={S.colLabelBold}>Total Pendapatan</Text>
        <Text style={[S.colTotalBold, { color: C.green }]}>{idr(Number(totalRevenue))}</Text>
      </View>

      <View style={{ height: 10 }} />

      {/* Expense */}
      <View style={S.sectionHeader} wrap={false}><Text style={S.sectionHeaderText}>BEBAN</Text></View>
      {expense.map((r, i) => <PLRow key={i} item={r} depth={0} alt={i % 2 === 1} />)}
      <View style={S.rowTotal} wrap={false}>
        <Text style={S.colLabelBold}>Total Beban</Text>
        <Text style={[S.colTotalBold, { color: C.red }]}>{idr(Number(totalExpense))}</Text>
      </View>

      {/* Net profit */}
      <View style={S.rowGrandTotal} wrap={false}>
        <Text style={S.colGTLabel}>LABA BERSIH</Text>
        <Text style={[S.colTotalWhite, { color: Number(netProfit) >= 0 ? '#86efac' : '#fca5a5' }]}>
          {idr(Number(netProfit))}
        </Text>
      </View>
      <ReportFooter company={company} title="Laporan Laba Rugi" />
    </Page>
  </Document>
);

function PLRow({ item, depth, alt }: { item: PLSection; depth: number; alt: boolean }) {
  const indent = depth === 0 ? S.colLabelBold : depth === 1 ? S.colLabelIndent : S.colLabelIndent2;
  const hasChildren = item.children && item.children.length > 0;
  return (
    <>
      <View style={hasChildren ? S.rowGroup : [S.row, alt ? S.rowAlt : {}]} wrap={false}>
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

// ── Balance Sheet ─────────────────────────────────────────────────────────────
export interface BSSection { name: string; balance: number; children?: BSSection[]; }
interface BSPDFProps {
  company: CompanyInfo; asOf: string;
  assets: BSSection[]; totalAssets: number;
  liabilities: BSSection[]; totalLiabilities: number;
  equity: BSSection[]; totalEquity: number;
}
export const BalanceSheetPDF: React.FC<BSPDFProps> = ({ company, asOf, assets, totalAssets, liabilities, equity, totalLiabilities, totalEquity }) => (
  <Document>
    <Page size="A4" style={S.page} wrap>
      <ReportHeader company={company} title="NERACA" period={`Per ${asOf}`} />

      {/* ASSETS */}
      <View style={S.sectionHeader} wrap={false}><Text style={S.sectionHeaderText}>ASET</Text></View>
      {assets.map((a, i) => <BSRow key={i} item={a} depth={0} alt={i % 2 === 1} />)}
      <View style={S.rowTotal} wrap={false}>
        <Text style={S.colLabelBold}>Total Aset</Text>
        <Text style={S.colTotalBold}>{idr(Number(totalAssets))}</Text>
      </View>

      <View style={{ height: 12 }} />

      {/* LIABILITIES */}
      <View style={S.sectionHeader} wrap={false}><Text style={S.sectionHeaderText}>LIABILITAS</Text></View>
      {liabilities.map((a, i) => <BSRow key={i} item={a} depth={0} alt={i % 2 === 1} />)}
      <View style={S.rowTotal} wrap={false}>
        <Text style={S.colLabelBold}>Total Liabilitas</Text>
        <Text style={S.colTotalBold}>{idr(Number(totalLiabilities))}</Text>
      </View>

      <View style={{ height: 8 }} />

      {/* EQUITY */}
      <View style={S.sectionHeader} wrap={false}><Text style={S.sectionHeaderText}>EKUITAS</Text></View>
      {equity.map((a, i) => <BSRow key={i} item={a} depth={0} alt={i % 2 === 1} />)}
      <View style={S.rowTotal} wrap={false}>
        <Text style={S.colLabelBold}>Total Ekuitas</Text>
        <Text style={S.colTotalBold}>{idr(Number(totalEquity))}</Text>
      </View>

      {/* Grand total */}
      <View style={S.rowGrandTotal} wrap={false}>
        <Text style={S.colGTLabel}>Total Liabilitas + Ekuitas</Text>
        <Text style={S.colTotalWhite}>{idr(Number(totalLiabilities) + Number(totalEquity))}</Text>
      </View>

      {/* Balance check */}
      <View style={[S.summaryBox, { marginTop: 8 }]} wrap={false}>
        <Text style={{ fontSize: 7.5, color: Math.abs(Number(totalAssets) - (Number(totalLiabilities) + Number(totalEquity))) < 1 ? C.green : C.red, fontFamily: 'Helvetica-Bold' }}>
          {Math.abs(Number(totalAssets) - (Number(totalLiabilities) + Number(totalEquity))) < 1 ? '✓ Neraca Seimbang' : '⚠ Neraca Tidak Seimbang'}
        </Text>
      </View>

      <ReportFooter company={company} title="Neraca" />
    </Page>
  </Document>
);

function BSRow({ item, depth, alt }: { item: BSSection; depth: number; alt: boolean }) {
  const indent = depth === 0 ? S.colLabelBold : depth === 1 ? S.colLabelIndent : S.colLabelIndent2;
  const hasChildren = item.children && item.children.length > 0;
  return (
    <>
      <View style={hasChildren ? S.rowGroup : [S.row, alt ? S.rowAlt : {}]} wrap={false}>
        <Text style={indent}>{item.name}</Text>
        {!hasChildren && <Text style={S.colBalance}>{idr(Number(item.balance))}</Text>}
      </View>
      {hasChildren && item.children!.map((c, ci) => (
        <BSRow key={ci} item={c} depth={depth + 1} alt={ci % 2 === 1} />
      ))}
    </>
  );
}

// ── Cash Flow ─────────────────────────────────────────────────────────────────
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
  return (
    <Document>
      <Page size="A4" style={S.page} wrap>
        <ReportHeader company={company} title="LAPORAN ARUS KAS" period={period} />

        <CFSection title="AKTIVITAS OPERASIONAL" items={operatingItems} total={operating} />
        <View style={{ height: 8 }} />
        <CFSection title="AKTIVITAS INVESTASI" items={investingItems} total={investing} />
        <View style={{ height: 8 }} />
        <CFSection title="AKTIVITAS PENDANAAN" items={financingItems} total={financing} />

        <View style={{ marginTop: 12 }}>
          <View style={S.rowTotal} wrap={false}>
            <Text style={S.colLabelBold}>Perubahan Kas Bersih</Text>
            <Text style={[S.colTotalBold, { color: Number(netChange) >= 0 ? C.green : C.red }]}>{idr(Number(netChange), true)}</Text>
          </View>
          {openingBalance !== undefined && (
            <View style={[S.row, S.rowAlt]} wrap={false}>
              <Text style={S.colLabel}>Saldo Awal Periode</Text>
              <Text style={S.colBalance}>{idr(Number(openingBalance))}</Text>
            </View>
          )}
          <View style={S.rowGrandTotal} wrap={false}>
            <Text style={S.colGTLabel}>SALDO AKHIR KAS & BANK</Text>
            <Text style={S.colTotalWhite}>{idr(Number(closing))}</Text>
          </View>
        </View>

        <ReportFooter company={company} title="Laporan Arus Kas" />
      </Page>
    </Document>
  );
};

function CFSection({ title, items, total }: { title: string; items: CFItem[]; total: number }) {
  return (
    <>
      <View style={S.sectionHeader} wrap={false}><Text style={S.sectionHeaderText}>{title}</Text></View>
      {items.length === 0 ? (
        <View style={S.row} wrap={false}><Text style={[S.colLabel, { color: C.faint, fontStyle: 'italic' }]}>Tidak ada transaksi</Text><Text style={S.colBalance}>Rp 0</Text></View>
      ) : items.map((it, i) => (
        <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
          <Text style={S.colLabel}>{it.description}</Text>
          <Text style={[S.colBalance, { color: Number(it.amount) < 0 ? C.red : C.mid }]}>{idr(Number(it.amount), true)}</Text>
        </View>
      ))}
      <View style={S.rowTotal} wrap={false}>
        <Text style={S.colLabelBold}>Subtotal {title.split(' ').slice(1).join(' ')}</Text>
        <Text style={[S.colTotalBold, { color: Number(total) >= 0 ? C.green : C.red }]}>{idr(Number(total), true)}</Text>
      </View>
    </>
  );
}

// ── Aging Analysis ───────────────────────────────────────────────────────────
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
  const title = type === 'Customer' ? 'AGING PIUTANG' : 'AGING HUTANG';
  const cols = ['Belum JT', '1-30', '31-60', '61-90', '>90', 'Total'];
  const w = 68;
  return (
    <Document>
      <Page size="A4" orientation="landscape" style={S.page} wrap>
        <ReportHeader company={company} title={title} period={`Per ${today()}`} />
        <View style={S.sectionHeader} wrap={false}>
          <View style={{ flexDirection: 'row' }}>
            <Text style={[S.sectionHeaderText, { flex: 1 }]}>Nama Mitra</Text>
            {cols.map((c) => (
              <Text key={c} style={[S.sectionHeaderText, { width: w, textAlign: 'right' }]}>{c}</Text>
            ))}
          </View>
        </View>
        {rows.map((r, i) => (
          <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
            <Text style={[S.colLabel, { flex: 1 }]}>{r.name}</Text>
            <Text style={[S.colBalance, { width: w }]}>{idr(r.current)}</Text>
            <Text style={[S.colBalance, { width: w }]}>{idr(r.d1_30)}</Text>
            <Text style={[S.colBalance, { width: w, color: r.d31_60 > 0 ? '#d97706' : C.muted }]}>{idr(r.d31_60)}</Text>
            <Text style={[S.colBalance, { width: w, color: r.d61_90 > 0 ? '#ea580c' : C.muted }]}>{idr(r.d61_90)}</Text>
            <Text style={[S.colBalance, { width: w, color: r.d91_plus > 0 ? C.red : C.muted }]}>{idr(r.d91_plus)}</Text>
            <Text style={[S.colTotalBold, { width: w }]}>{idr(r.total)}</Text>
          </View>
        ))}
        <View style={S.rowGrandTotal} wrap={false}>
          <Text style={[S.colGTLabel, { flex: 1 }]}>TOTAL</Text>
          <Text style={[S.colTotalWhite, { width: w }]}>{idr(totals.current)}</Text>
          <Text style={[S.colTotalWhite, { width: w }]}>{idr(totals.d1_30)}</Text>
          <Text style={[S.colTotalWhite, { width: w }]}>{idr(totals.d31_60)}</Text>
          <Text style={[S.colTotalWhite, { width: w }]}>{idr(totals.d61_90)}</Text>
          <Text style={[S.colTotalWhite, { width: w }]}>{idr(totals.d91_plus)}</Text>
          <Text style={[S.colTotalWhite, { width: w }]}>{idr(totals.total)}</Text>
        </View>
        <ReportFooter company={company} title={type === 'Customer' ? 'Aging Piutang' : 'Aging Hutang'} />
      </Page>
    </Document>
  );
};

// ── Shared sub-components ─────────────────────────────────────────────────────
function ReportHeader({ company, title, period }: { company: CompanyInfo; title: string; period: string }) {
  return (
    <>
      <View style={S.headerRow} fixed>
        <View>
          <Text style={S.companyName}>{company.name}</Text>
          {company.address && <Text style={S.companyMeta}>{company.address}</Text>}
          {company.taxId   && <Text style={S.companyMeta}>NPWP: {company.taxId}</Text>}
        </View>
        <View>
          <Text style={S.reportTitle}>{title}</Text>
          <Text style={S.reportPeriod}>{period}</Text>
          <Text style={S.reportDate}>Dicetak: {today()}</Text>
        </View>
      </View>
      <View style={S.divider} fixed />
    </>
  );
}

function ReportFooter({ company, title }: { company: CompanyInfo; title: string }) {
  return (
    <View style={S.footer} fixed>
      <View style={S.footerLine} />
      <View style={S.footerRow}>
        <Text style={S.footerText}>{company.name} — {title}</Text>
        <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Hal. ${pageNumber} / ${totalPages}`} />
      </View>
    </View>
  );
}
