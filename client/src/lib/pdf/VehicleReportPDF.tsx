/**
 * PDF report per-kendaraan — ringkasan TCO, rincian biaya, trend bulanan,
 * kepatuhan dokumen, dan kondisi fisik. Dipakai oleh GaVehicleReportTab.
 */
import { Document, Page, View, Text, StyleSheet, Font } from '@react-pdf/renderer';
import type { VehicleReport, ComplianceState } from '../../components/GaVehicleReportTab';
import { C } from './theme';

Font.registerHyphenationCallback((word) => [word]);

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8.5, color: C.dark, paddingTop: 36, paddingBottom: 56, paddingHorizontal: 36, backgroundColor: C.white },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  companyName: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: C.primary },
  companyMeta: { fontSize: 7, color: C.muted, marginTop: 1 },
  title: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: C.dark, textAlign: 'right' },
  subtitle: { fontSize: 8, color: C.muted, textAlign: 'right', marginTop: 2 },
  divider: { height: 1.5, backgroundColor: C.primary, marginBottom: 14, marginTop: 8 },

  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 6, marginTop: 4 },

  summaryRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  summaryBox: { flex: 1, padding: 8, borderRadius: 3, borderWidth: 0.5, borderColor: C.border },
  summaryLabel: { fontSize: 7, color: C.muted, marginBottom: 2 },
  summaryValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  summarySub: { fontSize: 6.5, color: C.faint, marginTop: 2 },

  idGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  idCell: { width: '25%', marginBottom: 6 },
  idLabel: { fontSize: 6.5, color: C.faint, marginBottom: 1 },
  idValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.mid },

  tableHeader: { flexDirection: 'row', backgroundColor: C.primary, paddingVertical: 5, paddingHorizontal: 6 },
  tableHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.white, letterSpacing: 0.3 },
  row: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowAlt: { backgroundColor: C.bgLight },
  totalRow: { flexDirection: 'row', paddingVertical: 5, paddingHorizontal: 6, borderTopWidth: 1, borderTopColor: C.primary, backgroundColor: C.bgLight },
  cell: { fontSize: 8 },
  cellBold: { fontSize: 8, fontFamily: 'Helvetica-Bold' },

  colCat: { flex: 1 },
  colCount: { width: 60, textAlign: 'center' },
  colPct: { width: 50, textAlign: 'right' },
  colAmt: { width: 90, textAlign: 'right' },

  colMonth: { width: 60 },
  colTrendNum: { flex: 1, textAlign: 'right' },

  colDoc: { width: 60 },
  colDesc: { flex: 1 },
  colDate: { width: 65 },
  colDays: { width: 45, textAlign: 'center' },
  colState: { width: 80, textAlign: 'center' },

  emptyText: { fontSize: 8, fontStyle: 'italic', color: C.faint, paddingVertical: 6, paddingHorizontal: 6 },
  noteText: { fontSize: 7.5, color: C.muted, marginTop: 4, lineHeight: 1.4 },

  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 6 },
  footerText: { fontSize: 6.5, color: C.faint },
});

const rp = (v: number) =>
  `Rp ${Math.round(v).toLocaleString('id-ID')}`;
const num = (v: number, digits = 0) =>
  v.toLocaleString('id-ID', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const dt = (v: string | Date | null | undefined) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};
const monthLabel = (key: string) => {
  const [y, m] = key.split('-');
  const names = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${names[Number(m) - 1] ?? m} ${String(y).slice(2)}`;
};

const CAT_LABEL: Record<string, string> = {
  service: 'Service & Perawatan',
  fuel: 'Bahan Bakar',
  tax: 'Pajak Kendaraan',
  insurance: 'Asuransi',
  incident: 'Insiden & Perbaikan',
};
const CAT_ORDER = ['service', 'fuel', 'tax', 'insurance', 'incident'] as const;

const STATE_LABEL: Record<ComplianceState, string> = {
  EXPIRED: 'Lewat Tempo',
  EXPIRING: 'Segera',
  OK: 'Aman',
  NONE: '—',
};
const stateColor = (s: ComplianceState) =>
  s === 'EXPIRED' ? C.red : s === 'EXPIRING' ? C.amber : s === 'OK' ? C.green : C.faint;

interface Props {
  report: VehicleReport;
  company: { name: string; address: string | null };
  generatedAt: Date;
}

export default function VehicleReportPDF({ report, company, generatedAt }: Props) {
  const { asset, tco, compliance, condition, period } = report;
  const trendRows = report.monthlyTrend.filter((m) => m.total > 0);

  return (
    <Document title={`Report Kendaraan ${asset.code}`}>
      <Page size="A4" style={S.page}>
        {/* Header */}
        <View style={S.headerRow}>
          <View>
            <Text style={S.companyName}>{company.name}</Text>
            {company.address ? <Text style={S.companyMeta}>{company.address}</Text> : null}
          </View>
          <View>
            <Text style={S.title}>REPORT KENDARAAN</Text>
            <Text style={S.subtitle}>
              {asset.noPlat ?? asset.code} · {dt(period.from)} — {dt(period.to)}
            </Text>
          </View>
        </View>
        <View style={S.divider} />

        {/* Ringkasan */}
        <View style={S.summaryRow}>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>TOTAL BIAYA (TCO)</Text>
            <Text style={[S.summaryValue, { color: C.primary }]}>{rp(tco.totalCost)}</Text>
            <Text style={S.summarySub}>{rp(tco.costPerMonth)} / bulan</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>BIAYA PER KM</Text>
            <Text style={S.summaryValue}>{tco.costPerKm != null ? rp(tco.costPerKm) : '—'}</Text>
            <Text style={S.summarySub}>
              {tco.distanceKm != null ? `${num(tco.distanceKm)} km tercatat` : 'Data odometer belum cukup'}
            </Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>KONSUMSI BBM</Text>
            <Text style={S.summaryValue}>{tco.kmPerLiter != null ? `${num(tco.kmPerLiter, 1)} km/L` : '—'}</Text>
            <Text style={S.summarySub}>{num(tco.totalLiters, 1)} liter</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>ISU KEPATUHAN</Text>
            <Text style={[S.summaryValue, { color: compliance.issueCount > 0 ? C.red : C.green }]}>
              {compliance.issueCount}
            </Text>
            <Text style={S.summarySub}>
              {compliance.issueCount > 0 ? 'Perlu tindak lanjut' : 'Semua dokumen aman'}
            </Text>
          </View>
        </View>

        {/* Identitas */}
        <Text style={S.sectionTitle}>Identitas Kendaraan</Text>
        <View style={S.idGrid}>
          {[
            ['Kode Aset', asset.code],
            ['Nomor Plat', asset.noPlat ?? '—'],
            ['Merek / Tipe', [asset.brand, asset.tipe].filter(Boolean).join(' ') || '—'],
            ['Tahun Produksi', asset.tahunProduksi != null ? String(asset.tahunProduksi) : '—'],
            ['Kategori', asset.categoryName ?? '—'],
            ['Status', asset.status],
            ['Kondisi', asset.condition],
            ['Odometer Terakhir', asset.odometerTerakhir != null ? `${num(asset.odometerTerakhir)} km` : '—'],
          ].map(([label, value]) => (
            <View key={label} style={S.idCell}>
              <Text style={S.idLabel}>{label.toUpperCase()}</Text>
              <Text style={S.idValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Rincian biaya */}
        <Text style={S.sectionTitle}>Rincian Biaya Periode</Text>
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderText, S.colCat]}>KATEGORI</Text>
          <Text style={[S.tableHeaderText, S.colCount]}>TRANSAKSI</Text>
          <Text style={[S.tableHeaderText, S.colPct]}>PORSI</Text>
          <Text style={[S.tableHeaderText, S.colAmt]}>JUMLAH</Text>
        </View>
        {CAT_ORDER.map((k, i) => {
          const amount = tco.breakdown[k];
          const pct = tco.totalCost > 0 ? (amount / tco.totalCost) * 100 : 0;
          return (
            <View key={k} style={i % 2 === 1 ? [S.row, S.rowAlt] : S.row}>
              <Text style={[S.cell, S.colCat]}>{CAT_LABEL[k]}</Text>
              <Text style={[S.cell, S.colCount]}>{tco.counts[k]}</Text>
              <Text style={[S.cell, S.colPct]}>{num(pct, 1)}%</Text>
              <Text style={[S.cell, S.colAmt]}>{rp(amount)}</Text>
            </View>
          );
        })}
        <View style={S.totalRow}>
          <Text style={[S.cellBold, S.colCat]}>TOTAL</Text>
          <Text style={[S.cellBold, S.colCount]} />
          <Text style={[S.cellBold, S.colPct]} />
          <Text style={[S.cellBold, S.colAmt, { color: C.primary }]}>{rp(tco.totalCost)}</Text>
        </View>

        {/* Trend bulanan */}
        <Text style={S.sectionTitle}>Trend Biaya Bulanan</Text>
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderText, S.colMonth]}>BULAN</Text>
          <Text style={[S.tableHeaderText, S.colTrendNum]}>SERVICE</Text>
          <Text style={[S.tableHeaderText, S.colTrendNum]}>BBM</Text>
          <Text style={[S.tableHeaderText, S.colTrendNum]}>PAJAK</Text>
          <Text style={[S.tableHeaderText, S.colTrendNum]}>ASURANSI</Text>
          <Text style={[S.tableHeaderText, S.colTrendNum]}>INSIDEN</Text>
          <Text style={[S.tableHeaderText, S.colTrendNum]}>TOTAL</Text>
        </View>
        {trendRows.length === 0 ? (
          <Text style={S.emptyText}>Belum ada biaya tercatat pada periode ini.</Text>
        ) : (
          trendRows.map((m, i) => (
            <View key={m.month} style={i % 2 === 1 ? [S.row, S.rowAlt] : S.row} wrap={false}>
              <Text style={[S.cell, S.colMonth]}>{monthLabel(m.month)}</Text>
              <Text style={[S.cell, S.colTrendNum]}>{m.service ? rp(m.service) : '—'}</Text>
              <Text style={[S.cell, S.colTrendNum]}>{m.fuel ? rp(m.fuel) : '—'}</Text>
              <Text style={[S.cell, S.colTrendNum]}>{m.tax ? rp(m.tax) : '—'}</Text>
              <Text style={[S.cell, S.colTrendNum]}>{m.insurance ? rp(m.insurance) : '—'}</Text>
              <Text style={[S.cell, S.colTrendNum]}>{m.incident ? rp(m.incident) : '—'}</Text>
              <Text style={[S.cellBold, S.colTrendNum]}>{rp(m.total)}</Text>
            </View>
          ))
        )}

        {/* Kepatuhan */}
        <Text style={S.sectionTitle} break={trendRows.length > 14}>Kepatuhan Dokumen</Text>
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderText, S.colDoc]}>DOKUMEN</Text>
          <Text style={[S.tableHeaderText, S.colDesc]}>KETERANGAN</Text>
          <Text style={[S.tableHeaderText, S.colDate]}>JATUH TEMPO</Text>
          <Text style={[S.tableHeaderText, S.colDays]}>SISA HARI</Text>
          <Text style={[S.tableHeaderText, S.colState]}>STATUS</Text>
          <Text style={[S.tableHeaderText, S.colAmt]}>NILAI</Text>
        </View>
        {compliance.taxes.length === 0 && compliance.insurances.length === 0 ? (
          <Text style={S.emptyText}>Belum ada dokumen aktif.</Text>
        ) : (
          <>
            {compliance.taxes.map((t, i) => (
              <View key={`tax-${i}`} style={i % 2 === 1 ? [S.row, S.rowAlt] : S.row} wrap={false}>
                <Text style={[S.cell, S.colDoc]}>Pajak</Text>
                <Text style={[S.cell, S.colDesc]}>{t.type} · TA {t.periodYear}</Text>
                <Text style={[S.cell, S.colDate]}>{dt(t.dueDate)}</Text>
                <Text style={[S.cell, S.colDays]}>{t.daysRemaining ?? '—'}</Text>
                <Text style={[S.cell, S.colState, { color: stateColor(t.state) }]}>{STATE_LABEL[t.state]}</Text>
                <Text style={[S.cell, S.colAmt]}>{rp(t.amount)}</Text>
              </View>
            ))}
            {compliance.insurances.map((ins, i) => (
              <View key={`ins-${i}`} style={(compliance.taxes.length + i) % 2 === 1 ? [S.row, S.rowAlt] : S.row} wrap={false}>
                <Text style={[S.cell, S.colDoc]}>Asuransi</Text>
                <Text style={[S.cell, S.colDesc]}>{ins.type}{ins.provider ? ` · ${ins.provider}` : ''}</Text>
                <Text style={[S.cell, S.colDate]}>{dt(ins.endDate)}</Text>
                <Text style={[S.cell, S.colDays]}>{ins.daysRemaining ?? '—'}</Text>
                <Text style={[S.cell, S.colState, { color: stateColor(ins.state) }]}>{STATE_LABEL[ins.state]}</Text>
                <Text style={[S.cell, S.colAmt]}>{rp(ins.premium)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Insiden terbuka */}
        {compliance.openIncidents.length > 0 && (
          <>
            <Text style={S.sectionTitle}>Insiden Belum Selesai</Text>
            <View style={S.tableHeader}>
              <Text style={[S.tableHeaderText, S.colDate]}>TANGGAL</Text>
              <Text style={[S.tableHeaderText, S.colDesc]}>DESKRIPSI</Text>
              <Text style={[S.tableHeaderText, S.colState]}>TINGKAT</Text>
              <Text style={[S.tableHeaderText, S.colState]}>STATUS</Text>
              <Text style={[S.tableHeaderText, S.colAmt]}>BIAYA</Text>
            </View>
            {compliance.openIncidents.map((inc, i) => (
              <View key={i} style={i % 2 === 1 ? [S.row, S.rowAlt] : S.row} wrap={false}>
                <Text style={[S.cell, S.colDate]}>{dt(inc.tanggal)}</Text>
                <Text style={[S.cell, S.colDesc]}>{inc.description ?? '—'}</Text>
                <Text style={[S.cell, S.colState]}>{inc.severity}</Text>
                <Text style={[S.cell, S.colState]}>{inc.status}</Text>
                <Text style={[S.cell, S.colAmt]}>{rp(inc.cost)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Kondisi fisik */}
        <Text style={S.sectionTitle}>Kondisi Fisik</Text>
        <Text style={S.noteText}>
          Inspeksi terakhir:{' '}
          {condition.lastInspection
            ? `${dt(condition.lastInspection.tanggal)} — hasil ${condition.lastInspection.overallResult}${
                condition.lastInspection.odometer != null ? ` pada ${num(condition.lastInspection.odometer)} km` : ''
              }${condition.lastInspection.notes ? `. ${condition.lastInspection.notes}` : ''}`
            : 'belum ada catatan.'}
        </Text>
        <Text style={S.noteText}>
          Ganti oli terakhir:{' '}
          {condition.lastOil
            ? `${dt(condition.lastOil.tanggal)} pada ${num(condition.lastOil.odometer)} km${
                condition.lastOil.brand ? ` (${condition.lastOil.brand})` : ''
              }. Jadwal berikutnya ${num(condition.lastOil.nextOdometerDue)} km${
                condition.lastOil.remainingKm != null ? `, sisa ${num(condition.lastOil.remainingKm)} km` : ''
              }${condition.lastOil.isDue ? ' — SUDAH JATUH TEMPO.' : '.'}`
            : 'belum ada log.'}
        </Text>

        {condition.activeTires.length > 0 && (
          <>
            <Text style={[S.sectionTitle, { marginTop: 8 }]}>Ban Terpasang ({condition.activeTireCount})</Text>
            <View style={S.tableHeader}>
              <Text style={[S.tableHeaderText, S.colDoc]}>POSISI</Text>
              <Text style={[S.tableHeaderText, S.colDesc]}>MEREK / SERIAL</Text>
              <Text style={[S.tableHeaderText, S.colDate]}>DIPASANG</Text>
              <Text style={[S.tableHeaderText, S.colAmt]}>PEMAKAIAN</Text>
            </View>
            {condition.activeTires.map((t, i) => (
              <View key={i} style={i % 2 === 1 ? [S.row, S.rowAlt] : S.row} wrap={false}>
                <Text style={[S.cell, S.colDoc]}>{t.position}</Text>
                <Text style={[S.cell, S.colDesc]}>
                  {t.brand ?? '—'}{t.serialNumber ? ` · ${t.serialNumber}` : ''}
                </Text>
                <Text style={[S.cell, S.colDate]}>{dt(t.installedAt)}</Text>
                <Text style={[S.cell, S.colAmt]}>{t.usageKm != null ? `${num(t.usageKm)} km` : '—'}</Text>
              </View>
            ))}
          </>
        )}

        {/* Footer */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>
            Dicetak {generatedAt.toLocaleString('id-ID')} · {company.name}
          </Text>
          <Text style={S.footerText} render={({ pageNumber, totalPages }) => `Halaman ${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
