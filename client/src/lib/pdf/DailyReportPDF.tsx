import React from 'react';
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';
import type { CompanyInfo } from './ReportPDF';
import { C } from './theme';

Font.registerHyphenationCallback((word) => [word]);

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 7.5, color: C.dark, paddingTop: 30, paddingBottom: 50, paddingHorizontal: 30, backgroundColor: C.white },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  companyName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: C.primary },
  companyMeta: { fontSize: 6.5, color: C.muted, marginTop: 1 },
  reportTitle: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.dark, textAlign: 'right' },
  reportPeriod: { fontSize: 7.5, color: C.muted, textAlign: 'right', marginTop: 2 },
  reportDate: { fontSize: 7, color: C.faint, textAlign: 'right', marginTop: 1 },
  divider: { height: 1.5, backgroundColor: C.primary, marginBottom: 10, marginTop: 6 },
  sectionHeader: { backgroundColor: C.primary, paddingVertical: 4, paddingHorizontal: 8, marginTop: 8, marginBottom: 0 },
  sectionHeaderText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.white, letterSpacing: 0.5 },
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

function idr(n: number): string {
  return 'Rp ' + Math.abs(n).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function today(): string {
  return new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
}
function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function num(n: number): string { return n.toLocaleString('id-ID'); }

function Header({ company, date }: { company: CompanyInfo; date: string }) {
  return (
    <>
      <View style={S.headerRow} fixed>
        <View>
          <Text style={S.companyName}>{company.name}</Text>
          {company.address && <Text style={S.companyMeta}>{company.address}</Text>}
          {company.taxId && <Text style={S.companyMeta}>NPWP: {company.taxId}</Text>}
        </View>
        <View>
          <Text style={S.reportTitle}>LAPORAN HARIAN</Text>
          <Text style={S.reportPeriod}>{fmtDate(date)}</Text>
          <Text style={S.reportDate}>Dicetak: {today()}</Text>
        </View>
      </View>
      <View style={S.divider} fixed />
    </>
  );
}

function Footer({ company }: { company: CompanyInfo }) {
  return (
    <View style={S.footer} fixed>
      <View style={S.footerLine} />
      <View style={S.footerRow}>
        <Text style={S.footerText}>{company.name} — Laporan Harian</Text>
        <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Hal. ${pageNumber} / ${totalPages}`} />
      </View>
    </View>
  );
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

export const DailyReportPDF: React.FC<DailyReportPDFProps> = ({ company, date, data }) => (
  <Document>
    <Page size="A4" orientation="landscape" style={S.page} wrap>
      <Header company={company} date={date} />

      {/* 1. PENJUALAN */}
      <SectionTitle title="PENJUALAN" />
      <SummaryRow items={[
        { label: 'Jumlah Faktur', value: String(data.sales.summary.count) },
        { label: 'Total Qty', value: `${num(data.sales.summary.totalQty)} kg` },
        { label: 'Total Omzet', value: idr(data.sales.summary.totalRevenue) },
        { label: 'Piutang Baru', value: idr(data.sales.summary.totalNewReceivables) },
      ]} />
      {data.sales.invoices.length > 0 ? (
        <>
          <View style={S.thRow} wrap={false}>
            <Text style={[S.th, { width: 95 }]}>No. Faktur</Text>
            <Text style={[S.th, { width: 120 }]}>Pelanggan</Text>
            <Text style={[S.th, { flex: 1 }]}>Item</Text>
            <Text style={[S.th, { width: 65, textAlign: 'right' }]}>Qty</Text>
            <Text style={[S.th, { width: 100, textAlign: 'right' }]}>Total</Text>
            <Text style={[S.th, { width: 100, textAlign: 'right' }]}>Sisa Piutang</Text>
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
        <View style={S.empty}><Text style={S.emptyText}>Tidak ada penjualan hari ini</Text></View>
      )}

      {/* 2. PEMBELIAN */}
      <SectionTitle title="PEMBELIAN" />
      <SummaryRow items={[
        { label: 'Jumlah Faktur', value: String(data.purchases.summary.count) },
        { label: 'Total Qty', value: `${num(data.purchases.summary.totalQty)} kg` },
        { label: 'Total Belanja', value: idr(data.purchases.summary.totalSpend) },
        { label: 'Hutang Baru', value: idr(data.purchases.summary.totalNewPayables) },
      ]} />
      {data.purchases.invoices.length > 0 ? (
        <>
          <View style={S.thRow} wrap={false}>
            <Text style={[S.th, { width: 95 }]}>No. Faktur</Text>
            <Text style={[S.th, { width: 120 }]}>Supplier</Text>
            <Text style={[S.th, { flex: 1 }]}>Item</Text>
            <Text style={[S.th, { width: 65, textAlign: 'right' }]}>Qty</Text>
            <Text style={[S.th, { width: 100, textAlign: 'right' }]}>Total</Text>
            <Text style={[S.th, { width: 100, textAlign: 'right' }]}>Sisa Hutang</Text>
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
        <View style={S.empty}><Text style={S.emptyText}>Tidak ada pembelian hari ini</Text></View>
      )}

      {/* 3. PRODUKSI */}
      <SectionTitle title="PRODUKSI" />
      <SummaryRow items={[
        { label: 'Jumlah Run', value: String(data.production.summary.totalRuns) },
        { label: 'Total Input (kg)', value: num(data.production.summary.totalInputKg) },
        { label: 'Total Output (kg)', value: num(data.production.summary.totalOutputKg) },
        { label: 'Yield Rata-rata', value: data.production.summary.avgYield > 0 ? `${data.production.summary.avgYield}%` : '—' },
      ]} />
      {data.production.runs.length > 0 ? (
        <>
          <View style={S.thRow} wrap={false}>
            <Text style={[S.th, { width: 95 }]}>No. Run</Text>
            <Text style={[S.th, { flex: 1 }]}>Input</Text>
            <Text style={[S.th, { width: 70, textAlign: 'right' }]}>Qty Input</Text>
            <Text style={[S.th, { flex: 1 }]}>Output</Text>
            <Text style={[S.th, { width: 70, textAlign: 'right' }]}>Qty Output</Text>
            <Text style={[S.th, { width: 60, textAlign: 'right' }]}>Yield</Text>
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
        <View style={S.empty}><Text style={S.emptyText}>Tidak ada produksi hari ini</Text></View>
      )}

      {/* 3b. KONDISI STOK (snapshot posisi akhir tanggal) */}
      {data.stock && (
        <>
          <SectionTitle title="KONDISI STOK" />
          <SummaryRow items={[
            { label: 'Jumlah Gudang', value: String(data.stock.summary.totalWarehouses) },
            { label: 'Total Baris Item', value: String(data.stock.summary.totalItemLines) },
            { label: 'Item Stok Negatif', value: String(data.stock.summary.totalNegative) },
            { label: 'Total Nilai Stok', value: idr(data.stock.summary.grandTotalValue) },
          ]} />
          <Text style={{ fontSize: 6.5, color: C.faint, fontStyle: 'italic', marginTop: 3, marginBottom: 2, paddingHorizontal: 2 }}>
            {data.stock.valuationNote}
          </Text>
          {data.stock.warehouses.filter((w: any) => w.items.length > 0).length === 0 ? (
            <View style={S.empty}><Text style={S.emptyText}>Tidak ada stok pada tanggal ini</Text></View>
          ) : (
            data.stock.warehouses.filter((w: any) => w.items.length > 0).map((w: any, wi: number) => (
              <View key={wi} wrap={false}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', backgroundColor: C.bgLight, paddingVertical: 3, paddingHorizontal: 6, marginTop: 6 }}>
                  <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.dark }}>
                    {w.code} — {w.name}{w.isDefault ? ' (default)' : ''} · {w.itemCount} item
                  </Text>
                  <Text style={{ fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.dark }}>{idr(w.totalValue)}</Text>
                </View>
                <View style={S.thRow} wrap={false}>
                  <Text style={[S.th, { width: 80 }]}>Kode</Text>
                  <Text style={[S.th, { flex: 1 }]}>Nama Item</Text>
                  <Text style={[S.th, { width: 30, textAlign: 'center' }]}>Sat.</Text>
                  <Text style={[S.th, { width: 65, textAlign: 'right' }]}>Stok</Text>
                  <Text style={[S.th, { width: 60, textAlign: 'right' }]}>Avg Cost</Text>
                  <Text style={[S.th, { width: 80, textAlign: 'right' }]}>Nilai</Text>
                </View>
                {w.items.map((it: any, ii: number) => (
                  <View key={ii} style={[S.row, ii % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
                    <Text style={[S.cell, { width: 80, fontSize: 7 }]}>{it.code}</Text>
                    <Text style={[S.cell, { flex: 1 }]}>{it.name}</Text>
                    <Text style={[S.cell, { width: 30, textAlign: 'center', color: C.muted }]}>{it.unit}</Text>
                    <Text style={[S.cellRight, { width: 65, color: it.qty < 0 ? C.red : C.dark }]}>{num(it.qty)}</Text>
                    <Text style={[S.cellRight, { width: 60, color: C.muted }]}>{it.averageCost > 0 ? Math.round(it.averageCost).toLocaleString('id-ID') : '—'}</Text>
                    <Text style={[S.cellRight, { width: 80, color: it.value < 0 ? C.red : C.dark }]}>{it.value !== 0 ? idr(it.value) : '—'}</Text>
                  </View>
                ))}
              </View>
            ))
          )}
        </>
      )}

      {/* 4. KEUANGAN */}
      <SectionTitle title="KEUANGAN" />
      <SummaryRow items={[
        { label: 'Penerimaan', value: idr(data.finance.summary.totalIn) },
        { label: 'Pengeluaran', value: idr(data.finance.summary.totalOut) },
        { label: 'Arus Kas Bersih', value: idr(data.finance.summary.netCashFlow) },
        { label: 'Jurnal Manual', value: String(data.finance.manualJournals) },
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
            <Text style={[S.th, { width: 110 }]}>No. Pembayaran</Text>
            <Text style={[S.th, { flex: 1 }]}>Pihak</Text>
            <Text style={[S.th, { width: 80 }]}>Akun</Text>
            <Text style={[S.th, { width: 55, textAlign: 'center' }]}>Tipe</Text>
            <Text style={[S.th, { width: 110, textAlign: 'right' }]}>Jumlah</Text>
          </View>
          {[...data.finance.paymentsIn.map((p: any) => ({ ...p, type: 'Masuk' })),
            ...data.finance.paymentsOut.map((p: any) => ({ ...p, type: 'Keluar' }))
          ].map((p: any, i: number) => (
            <View key={i} style={[S.row, i % 2 === 1 ? S.rowAlt : {}]} wrap={false}>
              <Text style={[S.cell, { width: 110 }]}>{p.paymentNumber}</Text>
              <Text style={[S.cell, { flex: 1 }]}>{p.partyName}</Text>
              <Text style={[S.cell, { width: 80 }]}>{p.accountName}</Text>
              <Text style={[S.cell, { width: 55, textAlign: 'center', color: p.type === 'Masuk' ? C.green : C.red }]}>{p.type}</Text>
              <Text style={[S.cellRight, { width: 110 }]}>{idr(p.amount)}</Text>
            </View>
          ))}
        </>
      )}

      {/* 5. PIUTANG */}
      <SectionTitle title="PIUTANG USAHA" />
      <SummaryRow items={[
        { label: 'Total Piutang', value: idr(data.receivables.summary.totalOutstanding) },
        { label: 'Jatuh Tempo', value: idr(data.receivables.summary.totalOverdue) },
        { label: 'Pelanggan', value: String(data.receivables.summary.totalCustomers) },
      ]} />
      {data.receivables.byCustomer.length > 0 ? (
        <>
          <View style={S.thRow} wrap={false}>
            <Text style={[S.th, { flex: 1 }]}>Pelanggan</Text>
            <Text style={[S.th, { width: 95, textAlign: 'right' }]}>Lancar</Text>
            <Text style={[S.th, { width: 95, textAlign: 'right' }]}>1-30 hari</Text>
            <Text style={[S.th, { width: 95, textAlign: 'right' }]}>31-60 hari</Text>
            <Text style={[S.th, { width: 95, textAlign: 'right' }]}>61-90 hari</Text>
            <Text style={[S.th, { width: 95, textAlign: 'right' }]}>&gt;90 hari</Text>
            <Text style={[S.th, { width: 110, textAlign: 'right' }]}>Total</Text>
          </View>
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
        <View style={S.empty}><Text style={S.emptyText}>Tidak ada piutang</Text></View>
      )}

      {/* 6. HUTANG */}
      <SectionTitle title="HUTANG USAHA" />
      <SummaryRow items={[
        { label: 'Total Hutang', value: idr(data.payables.summary.totalOutstanding) },
        { label: 'Jatuh Tempo', value: idr(data.payables.summary.totalOverdue) },
        { label: 'Supplier', value: String(data.payables.summary.totalSuppliers) },
      ]} />
      {data.payables.bySupplier.length > 0 ? (
        <>
          <View style={S.thRow} wrap={false}>
            <Text style={[S.th, { flex: 1 }]}>Supplier</Text>
            <Text style={[S.th, { width: 95, textAlign: 'right' }]}>Lancar</Text>
            <Text style={[S.th, { width: 95, textAlign: 'right' }]}>1-30 hari</Text>
            <Text style={[S.th, { width: 95, textAlign: 'right' }]}>31-60 hari</Text>
            <Text style={[S.th, { width: 95, textAlign: 'right' }]}>61-90 hari</Text>
            <Text style={[S.th, { width: 95, textAlign: 'right' }]}>&gt;90 hari</Text>
            <Text style={[S.th, { width: 110, textAlign: 'right' }]}>Total</Text>
          </View>
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
        <View style={S.empty}><Text style={S.emptyText}>Tidak ada hutang</Text></View>
      )}

      {/* 7. DEPOSIT SUPPLIER */}
      <SectionTitle title="DEPOSIT SUPPLIER" />
      <SummaryRow items={[
        { label: 'Total Deposit', value: idr(data.vendorDeposits.summary.totalDeposits) },
        { label: 'Sudah Dialokasi', value: idr(data.vendorDeposits.summary.totalApplied) },
        { label: 'Sisa Belum Dialokasi', value: idr(data.vendorDeposits.summary.totalRemaining) },
      ]} />
      {data.vendorDeposits.deposits.length > 0 ? (
        <>
          <View style={S.thRow} wrap={false}>
            <Text style={[S.th, { width: 110 }]}>No. Pembayaran</Text>
            <Text style={[S.th, { flex: 1 }]}>Supplier</Text>
            <Text style={[S.th, { width: 110, textAlign: 'right' }]}>Jumlah Deposit</Text>
            <Text style={[S.th, { width: 110, textAlign: 'right' }]}>Dialokasi</Text>
            <Text style={[S.th, { width: 110, textAlign: 'right' }]}>Sisa</Text>
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
        <View style={S.empty}><Text style={S.emptyText}>Tidak ada deposit supplier aktif</Text></View>
      )}

      <Footer company={company} />
    </Page>
  </Document>
);
