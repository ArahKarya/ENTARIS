import React from 'react';
import {
  Document, Page, View, Text, Image, StyleSheet, Font,
} from '@react-pdf/renderer';

// ─── Register fonts (Helvetica is built-in — no download needed) ─────────────
Font.registerHyphenationCallback((word) => [word]);

// ─── Color palette ────────────────────────────────────────────────────────────
const C = {
  primary:    '#374151', // gray-700
  primaryLt:  '#f3f4f6', // gray-100
  accent:     '#4b5563', // gray-600
  dark:       '#111827', // gray-900
  mid:        '#374151', // gray-700
  muted:      '#6b7280', // gray-500
  faint:      '#9ca3af', // gray-400
  border:     '#e5e7eb', // gray-200
  bgLight:    '#f9fafb', // gray-50
  white:      '#ffffff',
  red:        '#dc2626',
  green:      '#16a34a',
  orange:     '#d97706',
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 8.5,
    color: C.dark,
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    backgroundColor: C.white,
  },

  // ── Header ──
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  companyBlock: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 },
  companyLogo: { width: 56, height: 56, objectFit: 'contain' as const },
  companyInfo: { flexDirection: 'column' as const, flex: 1 },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.primary, marginBottom: 2 },
  companyMeta: { fontSize: 7.5, color: C.muted, lineHeight: 1.5 },
  invoiceBlock: { alignItems: 'flex-end', flexShrink: 0, marginLeft: 20 },
  invoiceTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: C.primary, letterSpacing: 1, marginBottom: 4 },
  invoiceNumber: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.dark },
  statusPill: {
    marginTop: 5, paddingVertical: 3, paddingHorizontal: 10,
    borderRadius: 4, alignSelf: 'flex-end',
  },
  statusText: { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 0.8 },

  // ── Divider ──
  divider: { height: 1.5, backgroundColor: C.primary, marginBottom: 16 },
  dividerThin: { height: 0.5, backgroundColor: C.border, marginVertical: 8 },

  // ── Meta grid (date / bill-to) ──
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  metaCol: { width: '48%' },
  metaLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.faint, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 4 },
  metaValue: { fontSize: 8.5, color: C.dark, lineHeight: 1.5 },
  metaBold: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.dark },
  metaGrid: { flexDirection: 'row', gap: 16 },
  metaItem: { flex: 1 },
  metaItemLabel: { fontSize: 7, color: C.faint, marginBottom: 1 },
  metaItemValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.dark },

  // ── Items table ──
  tableContainer: { marginBottom: 16 },
  tableHeader: { flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 7, paddingHorizontal: 6 },
  tableHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, letterSpacing: 0.5 },
  tableRow: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.border },
  tableRowAlt: { backgroundColor: C.bgLight },
  tableCell: { fontSize: 8 },
  colNo:     { width: 22 },
  colDesc:   { flex: 1 },
  colQty:    { width: 42, textAlign: 'right' },
  colUnit:   { width: 36, textAlign: 'center' },
  colRate:   { width: 68, textAlign: 'right' },
  colDisc:   { width: 30, textAlign: 'right' },
  colTax:    { width: 30, textAlign: 'right' },
  colAmount: { width: 76, textAlign: 'right' },
  tableMono: { fontFamily: 'Helvetica', fontSize: 8 },

  // ── Summary section ──
  summaryRow: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 2 },
  summaryRight: { width: 260, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6, paddingVertical: 2.5 },
  summaryLabel: { fontSize: 8, color: C.mid },
  summaryValue: { fontSize: 8, fontFamily: 'Helvetica', textAlign: 'right', minWidth: 90 },
  summaryTotalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  summaryTotal: { width: 260, flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.primary, paddingHorizontal: 6, paddingVertical: 6, borderRadius: 3 },
  summaryTotalLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.white },
  summaryTotalValue: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.white, textAlign: 'right', minWidth: 90 },

  // ── Notes / Terms ──
  notesBox: { marginTop: 16, padding: 10, backgroundColor: C.bgLight, borderRadius: 4, borderWidth: 0.5, borderColor: C.border },
  notesLabel: { fontSize: 7, fontFamily: 'Helvetica-Bold', color: C.faint, letterSpacing: 0.8, marginBottom: 4 },
  notesText: { fontSize: 8, color: C.mid, lineHeight: 1.5 },

  // ── Signature area ──
  sigRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  sigBox: { width: '30%', alignItems: 'center' },
  sigLine: { height: 0.5, backgroundColor: C.border, marginTop: 28, marginBottom: 4, width: '100%' },
  sigLabel: { fontSize: 7, color: C.muted, textAlign: 'center' },
  sigName: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.dark, textAlign: 'center' },

  // ── Footer ──
  footer: { position: 'absolute', bottom: 20, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footerText: { fontSize: 7, color: C.faint },
  footerLine: { height: 0.5, backgroundColor: C.border, marginBottom: 4 },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
function idr(n: number): string {
  return 'Rp ' + n.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function tgl(d: string | null | undefined): string {
  if (!d) return '—';
  const dt = new Date(d);
  return dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}

// ─── Types ────────────────────────────────────────────────────────────────────
export interface InvoicePDFItem {
  itemName: string;
  quantity: number | string;
  unit: string;
  rate: number | string;
  discount?: number | string;
  taxPct?: number | string;
  pphPct?: number | string;
  amount: number | string;
  description?: string | null;
  // Purchase-specific fields (raw material weighing flow)
  kualitas?: string | null;
  nomorMobil?: string | null;
  timbanganTruk?: number | string | null;
  refaksi?: number | string | null;
  timbanganDiterima?: number | string | null;
  potonganItem?: number | string | null;
}

export interface InvoiceFormatSettings {
  sales?: {
    bankAccounts?: string;
    footerNote?: string;
    showSignature?: boolean;
    signatureLabels?: string[];
  };
  purchase?: {
    footerNote?: string;
    showSignature?: boolean;
    signatureLabels?: string[];
  };
}

export interface PaymentSplitBreakdown {
  accountNumber: string;
  accountName: string;
  rootType: string;
  amount: number | string;
  notes?: string | null;
}
export interface PaymentBreakdown {
  paymentNumber: string;
  date: string;
  amount: number | string;
  referenceNo?: string | null;
  notes?: string | null;
  primaryAccount?: { accountNumber: string; name: string; rootType: string } | null;
  splits: PaymentSplitBreakdown[];
  allocatedAmount: number | string;
}

export interface InvoicePDFProps {
  type: 'sales' | 'purchase';
  invoiceNumber: string;
  date: string;
  dueDate?: string | null;
  terms?: string | null;
  status: string;
  notes?: string | null;
  taxPct?: number | string;
  potongan?: number | string;
  biayaLain?: number | string;
  labelPotongan?: string | null;
  labelBiaya?: string | null;
  grandTotal: number | string;
  outstanding?: number | string;
  paidFromCash?: number | string;
  paidFromDeposit?: number | string;
  partyDepositBalance?: number | string;
  party: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    taxId?: string | null;
  };
  items: InvoicePDFItem[];
  company: {
    name: string;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
    taxId?: string | null;
    logoUrl?: string | null;
  };
  invoiceSettings?: InvoiceFormatSettings | null;
  // Payments allocated to this invoice (for "Rincian Pembayaran" section).
  // When provided and non-empty, renders the per-payment / per-split breakdown
  // below the totals panel. Does not change grand_total — it is read-only info.
  payments?: PaymentBreakdown[];
}

// ─── Status pill color ────────────────────────────────────────────────────────
function statusStyle(status: string) {
  if (status === 'Paid') return { bg: '#dcfce7', text: '#15803d' };
  if (status === 'PartiallyPaid') return { bg: '#fef9c3', text: '#a16207' };
  if (status === 'Overdue') return { bg: '#fee2e2', text: '#b91c1c' };
  if (status === 'Cancelled') return { bg: '#f3f4f6', text: '#6b7280' };
  return { bg: '#f3f4f6', text: '#374151' }; // Submitted / Draft
}

// ─── Main component ───────────────────────────────────────────────────────────
const InvoicePDF: React.FC<InvoicePDFProps> = (props) => {
  const {
    type, invoiceNumber, date, dueDate, terms, status, notes,
    taxPct = 0, potongan = 0, biayaLain = 0,
    labelPotongan, labelBiaya, grandTotal,
    outstanding, paidFromCash, paidFromDeposit, partyDepositBalance,
    party, items, company, invoiceSettings,
    payments,
  } = props;

  const isSales = type === 'sales';
  const title = isSales ? 'FAKTUR PENJUALAN' : 'FAKTUR PEMBELIAN';
  const partyLabel = isSales ? 'Kepada Yth.' : 'Dari Supplier';

  const fmt = isSales ? invoiceSettings?.sales : invoiceSettings?.purchase;
  const showSignature = fmt?.showSignature !== false;
  const sigLabels = fmt?.signatureLabels?.length
    ? fmt.signatureLabels
    : ['Disiapkan oleh', 'Disetujui oleh', 'Diterima oleh'];
  const footerNote = fmt?.footerNote || null;
  const bankAccounts = isSales ? (invoiceSettings?.sales?.bankAccounts || null) : null;

  const numTax   = Number(taxPct);
  const numPot   = Number(potongan);
  const numBiaya = Number(biayaLain);
  const numGT    = Number(grandTotal);

  // Subtotal from items
  const subtotal = items.reduce((s, i) => s + Number(i.amount), 0);
  // Per-item tax: sum each item's tax, fallback to invoice-level for old invoices
  const hasPerItemTax = items.some(i => Number(i.taxPct ?? 0) > 0);
  const taxAmount = hasPerItemTax
    ? items.reduce((s, i) => s + Number(i.amount) * Number(i.taxPct ?? 0) / 100, 0)
    : (numTax > 0 ? subtotal * numTax / 100 : 0);
  const hasPerItemPph = items.some(i => Number(i.pphPct ?? 0) > 0);
  const pphAmount = hasPerItemPph
    ? items.reduce((s, i) => s + Number(i.amount) * Number(i.pphPct ?? 0) / 100, 0)
    : 0;
  const showTax = taxAmount > 0;
  const showPph = pphAmount > 0;
  const showPot = numPot > 0;
  const showBiaya = numBiaya > 0;

  const pill = statusStyle(status);
  const today = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });

  return (
    <Document>
      <Page size="A4" style={S.page}>

        {/* ── HEADER ── */}
        <View style={S.headerRow} fixed>
          <View style={S.companyBlock}>
            {company.logoUrl && (
              <Image style={S.companyLogo} src={company.logoUrl} />
            )}
            <View style={S.companyInfo}>
              <Text style={S.companyName}>{company.name}</Text>
              {company.address && <Text style={S.companyMeta}>{company.address}</Text>}
              {company.phone  && <Text style={S.companyMeta}>Telp: {company.phone}</Text>}
              {company.email  && <Text style={S.companyMeta}>{company.email}</Text>}
              {company.taxId  && <Text style={S.companyMeta}>NPWP: {company.taxId}</Text>}
            </View>
          </View>
          <View style={S.invoiceBlock}>
            <Text style={S.invoiceTitle}>{title}</Text>
            <Text style={S.invoiceNumber}>{invoiceNumber}</Text>
            <View style={[S.statusPill, { backgroundColor: pill.bg }]}>
              <Text style={[S.statusText, { color: pill.text }]}>{status.toUpperCase()}</Text>
            </View>
          </View>
        </View>

        <View style={S.divider} />

        {/* ── META (date / party) ── */}
        <View style={S.metaRow}>
          {/* Left — party info */}
          <View style={S.metaCol}>
            <Text style={S.metaLabel}>{partyLabel}</Text>
            <Text style={S.metaBold}>{party.name}</Text>
            {party.address && <Text style={S.metaValue}>{party.address}</Text>}
            {party.phone   && <Text style={S.metaValue}>Telp: {party.phone}</Text>}
            {party.email   && <Text style={S.metaValue}>{party.email}</Text>}
            {party.taxId   && <Text style={S.metaValue}>NPWP: {party.taxId}</Text>}
          </View>

          {/* Right — invoice details grid */}
          <View style={S.metaCol}>
            <Text style={S.metaLabel}>Informasi Invoice</Text>
            <View style={{ gap: 4 }}>
              <View style={S.metaGrid}>
                <View style={S.metaItem}>
                  <Text style={S.metaItemLabel}>Tanggal</Text>
                  <Text style={S.metaItemValue}>{tgl(date)}</Text>
                </View>
                <View style={S.metaItem}>
                  <Text style={S.metaItemLabel}>Jatuh Tempo</Text>
                  <Text style={S.metaItemValue}>{tgl(dueDate)}</Text>
                </View>
              </View>
              {terms && (
                <View style={S.metaItem}>
                  <Text style={S.metaItemLabel}>Termin</Text>
                  <Text style={S.metaItemValue}>{terms}</Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* ── ITEMS TABLE ── */}
        <View style={S.tableContainer}>
          {/* Table header */}
          <View style={S.tableHeader}>
            <Text style={[S.tableHeaderText, S.colNo]}>#</Text>
            <Text style={[S.tableHeaderText, S.colDesc]}>Nama Barang / Jasa</Text>
            <Text style={[S.tableHeaderText, S.colQty]}>Qty</Text>
            <Text style={[S.tableHeaderText, S.colUnit]}>Sat.</Text>
            <Text style={[S.tableHeaderText, S.colRate]}>Harga Sat.</Text>
            <Text style={[S.tableHeaderText, S.colDisc]}>Disk%</Text>
            <Text style={[S.tableHeaderText, S.colTax]}>PPN%</Text>
            {hasPerItemPph && <Text style={[S.tableHeaderText, S.colTax]}>PPh%</Text>}
            <Text style={[S.tableHeaderText, S.colAmount]}>Jumlah</Text>
          </View>

          {/* Table rows */}
          {items.map((item, idx) => (
            <View key={idx} style={[S.tableRow, idx % 2 === 1 ? S.tableRowAlt : {}]}>
              <Text style={[S.tableCell, S.colNo, { color: C.faint }]}>{idx + 1}</Text>
              <View style={S.colDesc}>
                <Text style={[S.tableCell, { fontFamily: 'Helvetica-Bold' }]}>{item.itemName}</Text>
                {item.description && (
                  <Text style={[S.tableCell, { color: C.muted, marginTop: 1 }]}>{item.description}</Text>
                )}
                {!isSales && (() => {
                  const parts: string[] = [];
                  if (item.nomorMobil) parts.push(`Mobil: ${item.nomorMobil}`);
                  if (item.kualitas) parts.push(`Kualitas: ${item.kualitas}`);
                  const truk = Number(item.timbanganTruk ?? 0);
                  const refaksi = Number(item.refaksi ?? 0);
                  const diterima = Number(item.timbanganDiterima ?? 0);
                  if (truk > 0 || refaksi > 0) {
                    parts.push(`Timbangan: ${truk.toLocaleString('id-ID')} − ${refaksi.toLocaleString('id-ID')} = ${diterima.toLocaleString('id-ID')} kg`);
                  }
                  const pot = Number(item.potonganItem ?? 0);
                  if (pot > 0) parts.push(`Potongan: ${idr(pot)}`);
                  if (parts.length === 0) return null;
                  return (
                    <Text style={[S.tableCell, { color: C.muted, fontSize: 7, marginTop: 1 }]}>
                      {parts.join('  •  ')}
                    </Text>
                  );
                })()}
              </View>
              <Text style={[S.tableCell, S.tableMono, S.colQty]}>
                {Number(item.quantity).toLocaleString('id-ID')}
              </Text>
              <Text style={[S.tableCell, S.colUnit, { color: C.mid }]}>{item.unit}</Text>
              <Text style={[S.tableCell, S.tableMono, S.colRate]}>
                {idr(Number(item.rate))}
              </Text>
              <Text style={[S.tableCell, S.tableMono, S.colDisc, { color: Number(item.discount) > 0 ? C.orange : C.faint }]}>
                {Number(item.discount) > 0 ? `${Number(item.discount)}%` : '—'}
              </Text>
              <Text style={[S.tableCell, S.tableMono, S.colTax, { color: Number(item.taxPct) > 0 ? C.accent : C.faint }]}>
                {Number(item.taxPct) > 0 ? `${Number(item.taxPct)}%` : '—'}
              </Text>
              {hasPerItemPph && (
                <Text style={[S.tableCell, S.tableMono, S.colTax, { color: Number(item.pphPct) > 0 ? C.orange : C.faint }]}>
                  {Number(item.pphPct) > 0 ? `${Number(item.pphPct)}%` : '—'}
                </Text>
              )}
              <Text style={[S.tableCell, S.tableMono, S.colAmount, { fontFamily: 'Helvetica-Bold' }]}>
                {idr(Number(item.amount))}
              </Text>
            </View>
          ))}
        </View>

        {/* ── SUMMARY ── */}
        <View style={S.summaryRow}>
          <View style={{ width: 260 }}>
            <View style={[S.summaryRight, { borderTopWidth: 0.5, borderTopColor: C.border }]}>
              <Text style={S.summaryLabel}>Subtotal</Text>
              <Text style={S.summaryValue}>{idr(subtotal)}</Text>
            </View>
            {showTax && (
              <View style={S.summaryRight}>
                <Text style={S.summaryLabel}>{hasPerItemTax ? 'PPN (per item)' : `PPN ${numTax}%`}</Text>
                <Text style={S.summaryValue}>{idr(taxAmount)}</Text>
              </View>
            )}
            {showPph && (
              <View style={S.summaryRight}>
                <Text style={[S.summaryLabel, { color: C.orange }]}>PPh (per item) (−)</Text>
                <Text style={[S.summaryValue, { color: C.orange }]}>({idr(pphAmount)})</Text>
              </View>
            )}
            {showPot && (
              <View style={S.summaryRight}>
                <Text style={[S.summaryLabel, { color: C.red }]}>
                  {labelPotongan || 'Potongan'} (−)
                </Text>
                <Text style={[S.summaryValue, { color: C.red }]}>({idr(numPot)})</Text>
              </View>
            )}
            {showBiaya && (
              <View style={S.summaryRight}>
                <Text style={S.summaryLabel}>{labelBiaya || 'Biaya Lain'} (+)</Text>
                <Text style={S.summaryValue}>{idr(numBiaya)}</Text>
              </View>
            )}
          </View>
        </View>
        <View style={S.summaryTotalRow}>
          <View style={S.summaryTotal}>
            <Text style={S.summaryTotalLabel}>TOTAL</Text>
            <Text style={S.summaryTotalValue}>{idr(numGT)}</Text>
          </View>
        </View>

        {/* ── PAYMENT STATUS ── */}
        {(() => {
          const numOut = Number(outstanding ?? numGT);
          const numCash = Number(paidFromCash ?? 0);
          const numDep = Number(paidFromDeposit ?? 0);
          const numBal = Number(partyDepositBalance ?? 0);
          const hasPaymentInfo = numCash > 0 || numDep > 0 || numOut !== numGT || numBal > 0;
          if (!hasPaymentInfo) return null;
          return (
            <View style={{ marginTop: 8, paddingTop: 6, borderTopWidth: 0.5, borderTopColor: C.border }}>
              <Text style={{ fontSize: 8, fontWeight: 600, color: C.muted, marginBottom: 3 }}>STATUS PEMBAYARAN</Text>
              {numCash > 0 && (
                <View style={S.summaryRight}>
                  <Text style={S.summaryLabel}>Bayar Tunai/Bank</Text>
                  <Text style={S.summaryValue}>{idr(numCash)}</Text>
                </View>
              )}
              {numDep > 0 && (
                <View style={S.summaryRight}>
                  <Text style={S.summaryLabel}>Bayar Uang Muka</Text>
                  <Text style={S.summaryValue}>{idr(numDep)}</Text>
                </View>
              )}
              <View style={S.summaryRight}>
                <Text style={[S.summaryLabel, { color: numOut > 0 ? C.red : '#15803d', fontWeight: 600 }]}>
                  {numOut > 0 ? 'Sisa Tagihan' : 'LUNAS'}
                </Text>
                <Text style={[S.summaryValue, { color: numOut > 0 ? C.red : '#15803d', fontWeight: 600 }]}>
                  {idr(numOut)}
                </Text>
              </View>
              {numBal > 0 && (
                <View style={S.summaryRight}>
                  <Text style={[S.summaryLabel, { fontStyle: 'italic' }]}>Saldo Uang Muka {isSales ? 'Pelanggan' : 'Supplier'}</Text>
                  <Text style={[S.summaryValue, { fontStyle: 'italic' }]}>{idr(numBal)}</Text>
                </View>
              )}
            </View>
          );
        })()}

        {/* ── RINCIAN PEMBAYARAN (detail per payment + split) ── */}
        {payments && payments.length > 0 && (
          <View style={{ marginTop: 10, padding: 6, borderWidth: 0.5, borderColor: C.border, borderRadius: 3 }}>
            <Text style={{ fontSize: 8, fontWeight: 600, color: C.muted, marginBottom: 4, letterSpacing: 0.5 }}>
              RINCIAN PEMBAYARAN
            </Text>
            {payments.map((p, idx) => (
              <View key={idx} style={{ marginBottom: idx < payments.length - 1 ? 5 : 0, paddingBottom: idx < payments.length - 1 ? 4 : 0, borderBottomWidth: idx < payments.length - 1 ? 0.3 : 0, borderBottomColor: C.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 1 }}>
                  <Text style={{ fontSize: 7.5, fontWeight: 600, color: C.dark }}>
                    {tgl(p.date)} · {p.paymentNumber}
                    {p.referenceNo ? ` (Ref: ${p.referenceNo})` : ''}
                  </Text>
                  <Text style={{ fontSize: 7.5, fontWeight: 600, color: C.dark }}>{idr(Number(p.allocatedAmount))}</Text>
                </View>
                {p.splits && p.splits.length > 0 ? (
                  p.splits.map((s, sidx) => (
                    <View key={sidx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 8 }}>
                      <Text style={{ fontSize: 7, color: C.muted }}>
                        • {s.accountNumber} {s.accountName}
                        {s.notes ? ` — ${s.notes}` : ''}
                      </Text>
                      <Text style={{ fontSize: 7, color: C.muted }}>{idr(Number(s.amount))}</Text>
                    </View>
                  ))
                ) : p.primaryAccount ? (
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingLeft: 8 }}>
                    <Text style={{ fontSize: 7, color: C.muted }}>
                      • {p.primaryAccount.accountNumber} {p.primaryAccount.name}
                    </Text>
                    <Text style={{ fontSize: 7, color: C.muted }}>{idr(Number(p.amount))}</Text>
                  </View>
                ) : null}
              </View>
            ))}
            {/* Aggregate summary: cash vs non-cash */}
            {(() => {
              let cashTotal = 0;
              let nonCashTotal = 0;
              for (const p of payments) {
                if (p.splits && p.splits.length > 0) {
                  for (const s of p.splits) {
                    const isCashLike = s.accountNumber?.startsWith('1.1');
                    if (isCashLike) cashTotal += Number(s.amount);
                    else nonCashTotal += Number(s.amount);
                  }
                } else {
                  const isCashLike = p.primaryAccount?.accountNumber?.startsWith('1.1');
                  const amt = Number(p.allocatedAmount);
                  if (isCashLike) cashTotal += amt;
                  else nonCashTotal += amt;
                }
              }
              if (nonCashTotal < 0.01) return null;
              return (
                <View style={{ marginTop: 4, paddingTop: 3, borderTopWidth: 0.3, borderTopColor: C.border }}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 7.5, color: C.muted }}>Diterima cash / bank</Text>
                    <Text style={{ fontSize: 7.5, color: C.muted }}>{idr(cashTotal)}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 7.5, color: C.muted }}>Potongan / alokasi lain</Text>
                    <Text style={{ fontSize: 7.5, color: C.muted }}>{idr(nonCashTotal)}</Text>
                  </View>
                </View>
              );
            })()}
          </View>
        )}

        {/* ── BANK ACCOUNTS (sales only) ── */}
        {bankAccounts && (
          <View style={S.notesBox}>
            <Text style={S.notesLabel}>INFORMASI PEMBAYARAN</Text>
            <Text style={S.notesText}>{bankAccounts}</Text>
          </View>
        )}

        {/* ── NOTES ── */}
        {notes && (
          <View style={S.notesBox}>
            <Text style={S.notesLabel}>CATATAN</Text>
            <Text style={S.notesText}>{notes}</Text>
          </View>
        )}

        {/* ── FOOTER NOTE ── */}
        {footerNote && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 7.5, color: C.muted, lineHeight: 1.5 }}>{footerNote}</Text>
          </View>
        )}

        {/* ── SIGNATURE ── */}
        {showSignature && (
          <View style={S.sigRow}>
            {sigLabels.map((label, i) => (
              <View key={i} style={S.sigBox}>
                <View style={S.sigLine} />
                <Text style={S.sigLabel}>{label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── FOOTER ── */}
        <View style={S.footer} fixed>
          <View style={{ flex: 1 }}>
            <View style={S.footerLine} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={S.footerText}>{company.name} — {invoiceNumber}</Text>
              <Text style={S.footerText}>Dicetak: {today}</Text>
            </View>
          </View>
        </View>

      </Page>
    </Document>
  );
};

export default InvoicePDF;
