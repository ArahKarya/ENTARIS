import React from 'react';
import { Document, Page, View, Text, Image, StyleSheet, Font } from '@react-pdf/renderer';
import { C as T } from './theme';
import { computePoTotals, paymentTermLabel, poDueDate } from '../purchaseOrderCalc';

const C = { ink: T.dark, soft: T.muted, line: T.border, navy: T.primary };

Font.registerHyphenationCallback((word) => [word]);

// PDF Purchase Order (Pesanan Pembelian) untuk dikirim ke pemasok:
// header perusahaan + data pemasok + item (estimasi harga) + total + catatan/syarat + tanda tangan.

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 9, color: C.ink, paddingTop: 30, paddingBottom: 36, paddingHorizontal: 32 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  companyBlock: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  logo: { width: 48, height: 48, objectFit: 'contain' as const },
  companyName: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.navy },
  companyMeta: { fontSize: 8, color: C.soft, marginTop: 1 },
  title: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: C.navy, textAlign: 'right' as const },
  titleSub: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.soft, textAlign: 'right' as const, marginTop: 1 },
  subtitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', textAlign: 'right' as const, marginTop: 4 },
  printMeta: { fontSize: 7, color: C.soft, textAlign: 'right' as const, marginTop: 3 },
  divider: { height: 1.5, backgroundColor: C.navy, marginTop: 8, marginBottom: 10 },
  metaRow: { flexDirection: 'row', marginBottom: 12, gap: 20 },
  metaCol: { flex: 1 },
  label: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.soft, marginBottom: 1, textTransform: 'uppercase' as const },
  val: { fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 3 },
  valReg: { fontSize: 9, marginBottom: 3 },
  th: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.ink, paddingVertical: 4, paddingHorizontal: 3 },
  thText: { fontSize: 8, fontFamily: 'Helvetica-Bold' },
  tr: { flexDirection: 'row', borderBottomWidth: 0.5, borderColor: C.line, paddingVertical: 3.5, paddingHorizontal: 3 },
  td: { fontSize: 8.5 },
  tdDesc: { fontSize: 7.5, color: C.soft, marginTop: 1 },
  right: { textAlign: 'right' as const },
  center: { textAlign: 'center' as const },
  padR: { paddingRight: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 6 },
  subTotalRow: { width: 220, flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 2 },
  subTotalLabel: { fontSize: 8.5, color: C.soft },
  subTotalVal: { fontSize: 8.5 },
  totalBox: { width: 220, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderColor: C.ink, paddingTop: 4 },
  totalLabel: { fontSize: 9, fontFamily: 'Helvetica-Bold' },
  totalVal: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  note: { fontSize: 7.5, color: C.soft, marginTop: 2, textAlign: 'right' as const },
  sectionTitle: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.navy, marginTop: 14, marginBottom: 3 },
  para: { fontSize: 8.5, lineHeight: 1.4 },
  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28, gap: 16 },
  signCol: { flex: 1, alignItems: 'center' as const },
  signLabel: { fontSize: 8.5, marginBottom: 46 },
  signLine: { width: '80%', borderTopWidth: 0.8, borderColor: C.ink, paddingTop: 3 },
  signName: { fontSize: 8, textAlign: 'center' as const },
  footer: { position: 'absolute' as const, bottom: 16, left: 32, right: 32, fontSize: 7, color: C.soft, textAlign: 'center' as const },
});

type Num = number | string | null | undefined;

const toNum = (n: Num) => Number(n ?? 0) || 0;
/** Indonesian grouping, up to 2 decimals for money (no "Rp" in table cells). */
const money = (n: Num) => toNum(n).toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const qty = (n: Num) => toNum(n).toLocaleString('id-ID', { maximumFractionDigits: 3 });
const dt = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '-';

export interface PurchaseOrderPDFItem {
  itemName: string;
  description?: string | null;
  quantity: Num;
  unit: string;
  estimatedRate: Num;
  estimatedAmount?: Num;
  discount?: Num;
  taxPct?: Num;
}

export interface PurchaseOrderPDFData {
  poNumber: string;
  date: string;
  expectedDeliveryDate?: string | null;
  notes?: string | null;
  terms?: string | null;
  totalEstimated: Num;
  /** Draft | PendingApproval | Submitted | Cancelled — non-ordered POs print a DRAF marker. */
  displayStatus?: string;
  paymentTermDays?: number | null;
  supplierQuoteRef?: string | null;
  otherCosts?: Num;
  otherCostsLabel?: string | null;
  warehouse?: { code?: string | null; name: string } | null;
  supplier?: { name: string; address?: string | null; phone?: string | null; taxId?: string | null } | null;
  user?: { fullName?: string | null } | null;
  items: PurchaseOrderPDFItem[];
}

export interface PurchaseOrderPDFProps {
  po: PurchaseOrderPDFData;
  company: { name: string; address?: string | null; phone?: string | null; email?: string | null; taxId?: string | null; logoUrl?: string | null };
}

const COLS = { no: 0.4, item: 3.0, qty: 1.0, unit: 0.7, rate: 1.5, disc: 0.7, tax: 0.7, amount: 1.7 };

const STATUS_MARK: Record<string, string> = {
  Draft: 'DRAF — BELUM DIPESAN',
  PendingApproval: 'MENUNGGU PERSETUJUAN',
  Cancelled: 'DIBATALKAN',
};

const PurchaseOrderPDF: React.FC<PurchaseOrderPDFProps> = ({ po, company }) => {
  const printDate = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
  const supplier = po.supplier;
  // Recomputed from lines (same rules as the server) so legacy POs print too.
  const totals = computePoTotals(
    po.items.map((it) => ({
      quantity: toNum(it.quantity),
      estimatedRate: toNum(it.estimatedRate),
      discount: toNum(it.discount ?? 0),
      taxPct: toNum(it.taxPct ?? 0),
    })),
    toNum(po.otherCosts ?? 0),
  );
  const dueDate = poDueDate(po.date, po.paymentTermDays);
  const mark = po.displayStatus ? STATUS_MARK[po.displayStatus] : undefined;
  const pct = (n: Num | undefined) => (toNum(n ?? 0) > 0 ? `${money(n ?? 0)}` : '—');

  return (
    <Document title={`Purchase Order ${po.poNumber}`} author={company.name}>
      <Page size="A4" style={S.page} wrap>
        <View style={S.headerRow} fixed>
          <View style={S.companyBlock}>
            {company.logoUrl && <Image style={S.logo} src={company.logoUrl} />}
            <View style={{ flex: 1 }}>
              <Text style={S.companyName}>{company.name}</Text>
              {company.address && <Text style={S.companyMeta}>{company.address}</Text>}
              {(company.phone || company.email) && (
                <Text style={S.companyMeta}>
                  {[company.phone && `Telp: ${company.phone}`, company.email].filter(Boolean).join(' • ')}
                </Text>
              )}
              {company.taxId && <Text style={S.companyMeta}>NPWP: {company.taxId}</Text>}
            </View>
          </View>
          <View>
            <Text style={S.title}>PURCHASE ORDER</Text>
            <Text style={S.titleSub}>PESANAN PEMBELIAN</Text>
            <Text style={S.subtitle}>{po.poNumber}</Text>
            {mark ? <Text style={[S.subtitle, { color: '#B45309' }]}>{mark}</Text> : null}
            <Text
              style={S.printMeta}
              render={({ pageNumber, totalPages }) => `Dicetak ${printDate} • Hal ${pageNumber}/${totalPages}`}
            />
          </View>
        </View>
        <View style={S.divider} />

        <View style={S.metaRow}>
          <View style={S.metaCol}>
            <Text style={S.label}>Kepada (Pemasok)</Text>
            {supplier ? (
              <>
                <Text style={S.val}>{supplier.name}</Text>
                {supplier.address && <Text style={S.valReg}>{supplier.address}</Text>}
                {supplier.phone && <Text style={S.valReg}>Telp: {supplier.phone}</Text>}
                {supplier.taxId && <Text style={S.valReg}>NPWP: {supplier.taxId}</Text>}
              </>
            ) : (
              <Text style={S.valReg}>PO Umum — dapat dipenuhi pemasok mana saja</Text>
            )}
          </View>
          <View style={S.metaCol}>
            <Text style={S.label}>Nomor PO</Text>
            <Text style={S.val}>{po.poNumber}</Text>
            <Text style={S.label}>Tanggal PO</Text>
            <Text style={S.valReg}>{dt(po.date)}</Text>
            <Text style={S.label}>Tanggal Kirim Diharapkan</Text>
            <Text style={S.valReg}>{dt(po.expectedDeliveryDate)}</Text>
            <Text style={S.label}>Termin Pembayaran</Text>
            <Text style={S.valReg}>
              {paymentTermLabel(po.paymentTermDays)}
              {dueDate && po.paymentTermDays ? ` (jatuh tempo ${dt(dueDate)})` : ''}
            </Text>
          </View>
          <View style={S.metaCol}>
            <Text style={S.label}>Kirim ke Gudang</Text>
            <Text style={S.valReg}>{po.warehouse ? [po.warehouse.code, po.warehouse.name].filter(Boolean).join(' — ') : '—'}</Text>
            <Text style={S.label}>No. Penawaran Pemasok</Text>
            <Text style={S.valReg}>{po.supplierQuoteRef || '—'}</Text>
          </View>
        </View>

        <View style={S.th} fixed>
          <Text style={[S.thText, S.center, { flex: COLS.no }]}>No</Text>
          <Text style={[S.thText, { flex: COLS.item }]}>Barang</Text>
          <Text style={[S.thText, S.right, S.padR, { flex: COLS.qty }]}>Qty</Text>
          <Text style={[S.thText, { flex: COLS.unit }]}>Satuan</Text>
          <Text style={[S.thText, S.right, S.padR, { flex: COLS.rate }]}>Harga (Rp)</Text>
          <Text style={[S.thText, S.right, S.padR, { flex: COLS.disc }]}>Disk %</Text>
          <Text style={[S.thText, S.right, S.padR, { flex: COLS.tax }]}>PPN %</Text>
          <Text style={[S.thText, S.right, { flex: COLS.amount }]}>Jumlah (Rp)</Text>
        </View>
        {po.items.map((it, i) => {
          const amount = totals.lines[i]?.amount ?? toNum(it.estimatedAmount ?? 0);
          return (
            <View style={S.tr} key={i} wrap={false}>
              <Text style={[S.td, S.center, { flex: COLS.no }]}>{i + 1}</Text>
              <View style={{ flex: COLS.item }}>
                <Text style={S.td}>{it.itemName}</Text>
                {it.description ? <Text style={S.tdDesc}>{it.description}</Text> : null}
              </View>
              <Text style={[S.td, S.right, S.padR, { flex: COLS.qty }]}>{qty(it.quantity)}</Text>
              <Text style={[S.td, { flex: COLS.unit }]}>{it.unit}</Text>
              <Text style={[S.td, S.right, S.padR, { flex: COLS.rate }]}>{money(it.estimatedRate)}</Text>
              <Text style={[S.td, S.right, S.padR, { flex: COLS.disc }]}>{pct(it.discount)}</Text>
              <Text style={[S.td, S.right, S.padR, { flex: COLS.tax }]}>{pct(it.taxPct)}</Text>
              <Text style={[S.td, S.right, { flex: COLS.amount }]}>{money(amount)}</Text>
            </View>
          );
        })}

        <View style={S.totalRow} wrap={false}>
          <View>
            {[
              { label: 'Subtotal', value: totals.subtotal, show: true },
              { label: 'Diskon', value: -totals.discountTotal, show: totals.discountTotal > 0 },
              { label: 'PPN', value: totals.taxTotal, show: totals.taxTotal > 0 },
              { label: po.otherCostsLabel || 'Biaya lain', value: totals.otherCosts, show: totals.otherCosts > 0 },
            ]
              .filter((r) => r.show)
              .map((r) => (
                <View style={S.subTotalRow} key={r.label}>
                  <Text style={S.subTotalLabel}>{r.label}</Text>
                  <Text style={S.subTotalVal}>{money(r.value)}</Text>
                </View>
              ))}
            <View style={S.totalBox}>
              <Text style={S.totalLabel}>Grand Total</Text>
              <Text style={S.totalVal}>Rp {money(totals.grandTotal)}</Text>
            </View>
            <Text style={S.note}>Harga final mengikuti faktur pemasok.</Text>
          </View>
        </View>

        {po.notes ? (
          <View wrap={false}>
            <Text style={S.sectionTitle}>Catatan</Text>
            <Text style={S.para}>{po.notes}</Text>
          </View>
        ) : null}
        {po.terms ? (
          <View wrap={false}>
            <Text style={S.sectionTitle}>Syarat & Ketentuan</Text>
            <Text style={S.para}>{po.terms}</Text>
          </View>
        ) : null}

        <View style={S.signRow} wrap={false}>
          {[
            { label: 'Dibuat oleh', name: po.user?.fullName ?? '' },
            { label: 'Disetujui oleh', name: '' },
            { label: 'Pemasok', name: supplier?.name ?? '' },
          ].map((s) => (
            <View style={S.signCol} key={s.label}>
              <Text style={S.signLabel}>{s.label}</Text>
              <View style={S.signLine}>
                <Text style={S.signName}>{s.name || ' '}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text
          style={S.footer}
          fixed
          render={({ pageNumber, totalPages }) => `${company.name} — ${po.poNumber} • Hal ${pageNumber}/${totalPages}`}
        />
      </Page>
    </Document>
  );
};

export default PurchaseOrderPDF;
