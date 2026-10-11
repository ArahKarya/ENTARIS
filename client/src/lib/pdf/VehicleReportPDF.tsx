/**
 * PDF report per-kendaraan — ringkasan TCO, rincian biaya, trend bulanan,
 * kepatuhan dokumen, dan kondisi fisik. Dipakai oleh GaVehicleReportTab.
 */
import { Document, Page, View, Text, StyleSheet } from '@react-pdf/renderer';
import type { VehicleReport, ComplianceState } from '../../components/GaVehicleReportTab';
import { C, FOOTER_SPACE } from './theme';
import { pdfDateShort, pdfDateTime, pdfFixed, pdfMonthShort, pdfRp, pdfT, type PdfT } from './pdfFormat';
import { PdfFooter, PdfHeader } from './kit';

const S = StyleSheet.create({
  page: { fontFamily: 'Helvetica', fontSize: 8.5, color: C.dark, paddingTop: 36, paddingBottom: FOOTER_SPACE, paddingHorizontal: 36, backgroundColor: C.white },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 },
  companyBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  companyLogo: { width: 46, height: 46, objectFit: 'contain' as const },
  companyInfo: { flexDirection: 'column' as const },
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
  idCell: { width: '25%', marginBottom: 6, paddingRight: 8 },
  idLabel: { fontSize: 6.5, color: C.faint, marginBottom: 1 },
  idValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.mid },

  tableHeader: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.primary, paddingVertical: 5, paddingHorizontal: 6 },
  tableHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.primary, letterSpacing: 0.3 },
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
  colDesc: { flex: 1, paddingRight: 8 },
  colDate: { width: 65 },
  colDays: { width: 45, textAlign: 'center' },
  colState: { width: 80, textAlign: 'center' },

  emptyText: { fontSize: 8, fontStyle: 'italic', color: C.faint, paddingVertical: 6, paddingHorizontal: 6 },
  noteText: { fontSize: 7.5, color: C.muted, marginTop: 4, lineHeight: 1.4 },

  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 6 },
  footerText: { fontSize: 6.5, color: C.faint },
});

const rp = (v: number) => pdfRp(Math.round(v));
const num = (v: number, digits = 0) => pdfFixed(v, digits);
const dt = (v: string | Date | null | undefined) => pdfDateShort(v);
const CAT_ORDER = ['service', 'fuel', 'tax', 'insurance', 'incident'] as const;

/** Server enum labels (UPPER_SNAKE); unknown values fall back to Title Case. */
const ENUM_KEYS = [
  'ACTIVE', 'IN_REPAIR', 'RETIRED', 'LOST', 'GOOD', 'FAIR', 'POOR', 'BROKEN',
  'PERLU_PERHATIAN', 'BAIK', 'TIDAK_LAYAK', 'KIR', 'TLO', 'STNK_TAHUNAN', 'STNK_5_TAHUNAN',
  'ALL_RISK', 'KECELAKAAN_DIRI', 'DALAM_PROSES',
] as const;
const lbl = (t: PdfT, v: string | null | undefined): string => {
  if (!v) return '—';
  if (!/^[A-Z0-9_]+$/.test(v)) return v;
  if ((ENUM_KEYS as readonly string[]).includes(v)) return t(`vehicle.enum.${v as (typeof ENUM_KEYS)[number]}`);
  return v.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
};

const stateLabel = (t: PdfT, s: ComplianceState): string => (s === 'NONE' ? '—' : t(`vehicle.state.${s}`));
const stateColor = (s: ComplianceState) =>
  s === 'EXPIRED' ? C.red : s === 'EXPIRING' ? C.amber : s === 'OK' ? C.green : C.faint;

type Condition = VehicleReport['condition'];

function describeLastInspection(t: PdfT, ins: Condition['lastInspection']): string {
  if (!ins) return t('vehicle.noInspection');
  const at = ins.odometer != null ? t('vehicle.atKm', { km: num(ins.odometer) }) : '';
  const notes = ins.notes ? `. ${ins.notes}` : '';
  return `${t('vehicle.lastInspectionValue', { date: dt(ins.tanggal), result: lbl(t, ins.overallResult) })}${at}${notes}`;
}

function describeLastOil(t: PdfT, oil: Condition['lastOil']): string {
  if (!oil) return t('vehicle.noOilLog');
  const brand = oil.brand ? ` (${oil.brand})` : '';
  const remaining = oil.remainingKm != null ? t('vehicle.remainingKm', { km: num(oil.remainingKm) }) : '';
  return `${t('vehicle.lastOilValue', { date: dt(oil.tanggal), km: num(oil.odometer) })}${brand}${t('vehicle.nextOil', {
    km: num(oil.nextOdometerDue),
  })}${remaining}${oil.isDue ? t('vehicle.oilDue') : '.'}`;
}

interface Props {
  report: VehicleReport;
  company: { name: string; address: string | null; logoUrl?: string | null };
  generatedAt: Date;
}

export default function VehicleReportPDF({ report, company, generatedAt }: Props) {
  const t = pdfT();
  const { asset, tco, compliance, condition, period } = report;
  const trendRows = report.monthlyTrend.filter((m) => m.total > 0);
  const lastInspectionText = describeLastInspection(t, condition.lastInspection);
  const lastOilText = describeLastOil(t, condition.lastOil);

  return (
    <Document title={t('vehicle.docTitle', { code: asset.code })}>
      <Page size="A4" style={S.page}>
        <PdfHeader
          company={company}
          title={t('vehicle.title')}
          number={asset.noPlat ?? asset.code}
          dateLine={t('vehicle.periodLine', { from: dt(period.from), to: dt(period.to) })}
        />

        {/* Ringkasan */}
        <View style={S.summaryRow}>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('vehicle.totalCost')}</Text>
            <Text style={[S.summaryValue, { color: C.primary }]}>{rp(tco.totalCost)}</Text>
            <Text style={S.summarySub}>{t('vehicle.perMonth', { amount: rp(tco.costPerMonth) })}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('vehicle.costPerKm')}</Text>
            <Text style={S.summaryValue}>{tco.costPerKm != null ? rp(tco.costPerKm) : '—'}</Text>
            <Text style={S.summarySub}>
              {tco.distanceKm != null ? t('vehicle.kmRecorded', { km: num(tco.distanceKm) }) : t('vehicle.notEnoughOdometer')}
            </Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('vehicle.fuelConsumption')}</Text>
            <Text style={S.summaryValue}>{tco.kmPerLiter != null ? `${num(tco.kmPerLiter, 1)} km/L` : '—'}</Text>
            <Text style={S.summarySub}>{t('vehicle.liters', { value: num(tco.totalLiters, 1) })}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('vehicle.complianceIssues')}</Text>
            <Text style={[S.summaryValue, { color: compliance.issueCount > 0 ? C.red : C.green }]}>
              {compliance.issueCount}
            </Text>
            <Text style={S.summarySub}>
              {compliance.issueCount > 0 ? t('vehicle.needsFollowUp') : t('vehicle.allDocsOk')}
            </Text>
          </View>
        </View>

        {/* Identitas */}
        <Text style={S.sectionTitle} minPresenceAhead={70}>{t('vehicle.identity')}</Text>
        <View style={S.idGrid}>
          {[
            [t('vehicle.fields.assetCode'), asset.code],
            [t('vehicle.fields.vehicleName'), asset.name || '—'],
            [t('vehicle.fields.plate'), asset.noPlat ?? '—'],
            [t('vehicle.fields.brandType'), [asset.brand, asset.tipe].filter(Boolean).join(' ') || '—'],
            [t('vehicle.fields.year'), asset.tahunProduksi != null ? String(asset.tahunProduksi) : '—'],
            [t('vehicle.fields.category'), asset.categoryName ?? '—'],
            [t('vehicle.fields.status'), lbl(t, asset.status)],
            [t('vehicle.fields.condition'), lbl(t, asset.condition)],
            [t('vehicle.fields.lastOdometer'), asset.odometerTerakhir != null ? `${num(asset.odometerTerakhir)} km` : '—'],
          ].map(([label, value]) => (
            <View key={label} style={S.idCell}>
              <Text style={S.idLabel}>{label.toUpperCase()}</Text>
              <Text style={S.idValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Rincian biaya */}
        <Text style={S.sectionTitle} minPresenceAhead={70}>{t('vehicle.costBreakdown')}</Text>
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderText, S.colCat]}>{t('vehicle.columns.category')}</Text>
          <Text style={[S.tableHeaderText, S.colCount]}>{t('vehicle.columns.transactions')}</Text>
          <Text style={[S.tableHeaderText, S.colPct]}>{t('vehicle.columns.share')}</Text>
          <Text style={[S.tableHeaderText, S.colAmt]}>{t('vehicle.columns.amount')}</Text>
        </View>
        {CAT_ORDER.map((k, i) => {
          const amount = tco.breakdown[k];
          const pct = tco.totalCost > 0 ? (amount / tco.totalCost) * 100 : 0;
          return (
            <View key={k} style={i % 2 === 1 ? [S.row, S.rowAlt] : S.row}>
              <Text style={[S.cell, S.colCat]}>{t(`vehicle.category.${k}`)}</Text>
              <Text style={[S.cell, S.colCount]}>{tco.counts[k]}</Text>
              <Text style={[S.cell, S.colPct]}>{num(pct, 1)}%</Text>
              <Text style={[S.cell, S.colAmt]}>{rp(amount)}</Text>
            </View>
          );
        })}
        <View style={S.totalRow}>
          <Text style={[S.cellBold, S.colCat]}>{t('vehicle.columns.total')}</Text>
          <Text style={[S.cellBold, S.colCount]} />
          <Text style={[S.cellBold, S.colPct]} />
          <Text style={[S.cellBold, S.colAmt, { color: C.primary }]}>{rp(tco.totalCost)}</Text>
        </View>

        {/* Trend bulanan */}
        <Text style={S.sectionTitle} minPresenceAhead={70}>{t('vehicle.monthlyTrend')}</Text>
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderText, S.colMonth]}>{t('vehicle.columns.month')}</Text>
          <Text style={[S.tableHeaderText, S.colTrendNum]}>{t('vehicle.columns.service')}</Text>
          <Text style={[S.tableHeaderText, S.colTrendNum]}>{t('vehicle.columns.fuel')}</Text>
          <Text style={[S.tableHeaderText, S.colTrendNum]}>{t('vehicle.columns.tax')}</Text>
          <Text style={[S.tableHeaderText, S.colTrendNum]}>{t('vehicle.columns.insurance')}</Text>
          <Text style={[S.tableHeaderText, S.colTrendNum]}>{t('vehicle.columns.incident')}</Text>
          <Text style={[S.tableHeaderText, S.colTrendNum]}>{t('vehicle.columns.total')}</Text>
        </View>
        {trendRows.length === 0 ? (
          <Text style={S.emptyText}>{t('vehicle.noCosts')}</Text>
        ) : (
          trendRows.map((m, i) => (
            <View key={m.month} style={i % 2 === 1 ? [S.row, S.rowAlt] : S.row} wrap={false}>
              <Text style={[S.cell, S.colMonth]}>{pdfMonthShort(m.month)}</Text>
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
        <Text style={S.sectionTitle} minPresenceAhead={70} break={trendRows.length > 14}>{t('vehicle.compliance')}</Text>
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderText, S.colDoc]}>{t('vehicle.columns.document')}</Text>
          <Text style={[S.tableHeaderText, S.colDesc]}>{t('vehicle.columns.description')}</Text>
          <Text style={[S.tableHeaderText, S.colDate]}>{t('vehicle.columns.dueDate')}</Text>
          <Text style={[S.tableHeaderText, S.colDays]}>{t('vehicle.columns.daysLeft')}</Text>
          <Text style={[S.tableHeaderText, S.colState]}>{t('vehicle.columns.status')}</Text>
          <Text style={[S.tableHeaderText, S.colAmt]}>{t('vehicle.columns.value')}</Text>
        </View>
        {compliance.taxes.length === 0 && compliance.insurances.length === 0 ? (
          <Text style={S.emptyText}>{t('vehicle.noDocs')}</Text>
        ) : (
          <>
            {compliance.taxes.map((tax, i) => (
              <View key={`tax-${i}`} style={i % 2 === 1 ? [S.row, S.rowAlt] : S.row} wrap={false}>
                <Text style={[S.cell, S.colDoc]}>{t('vehicle.tax')}</Text>
                <Text style={[S.cell, S.colDesc]}>{t('vehicle.taxYear', { type: lbl(t, tax.type), year: tax.periodYear })}</Text>
                <Text style={[S.cell, S.colDate]}>{dt(tax.dueDate)}</Text>
                <Text style={[S.cell, S.colDays]}>{tax.daysRemaining ?? '—'}</Text>
                <Text style={[S.cell, S.colState, { color: stateColor(tax.state) }]}>{stateLabel(t, tax.state)}</Text>
                <Text style={[S.cell, S.colAmt]}>{rp(tax.amount)}</Text>
              </View>
            ))}
            {compliance.insurances.map((ins, i) => (
              <View key={`ins-${i}`} style={(compliance.taxes.length + i) % 2 === 1 ? [S.row, S.rowAlt] : S.row} wrap={false}>
                <Text style={[S.cell, S.colDoc]}>{t('vehicle.insurance')}</Text>
                <Text style={[S.cell, S.colDesc]}>{lbl(t, ins.type)}{ins.provider ? ` · ${ins.provider}` : ''}</Text>
                <Text style={[S.cell, S.colDate]}>{dt(ins.endDate)}</Text>
                <Text style={[S.cell, S.colDays]}>{ins.daysRemaining ?? '—'}</Text>
                <Text style={[S.cell, S.colState, { color: stateColor(ins.state) }]}>{stateLabel(t, ins.state)}</Text>
                <Text style={[S.cell, S.colAmt]}>{rp(ins.premium)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Insiden terbuka */}
        {compliance.openIncidents.length > 0 && (
          <>
            <Text style={S.sectionTitle} minPresenceAhead={70}>{t('vehicle.openIncidents')}</Text>
            <View style={S.tableHeader}>
              <Text style={[S.tableHeaderText, S.colDate]}>{t('vehicle.columns.date')}</Text>
              <Text style={[S.tableHeaderText, S.colDesc]}>{t('vehicle.columns.details')}</Text>
              <Text style={[S.tableHeaderText, S.colState]}>{t('vehicle.columns.severity')}</Text>
              <Text style={[S.tableHeaderText, S.colState]}>{t('vehicle.columns.status')}</Text>
              <Text style={[S.tableHeaderText, S.colAmt]}>{t('vehicle.columns.cost')}</Text>
            </View>
            {compliance.openIncidents.map((inc, i) => (
              <View key={i} style={i % 2 === 1 ? [S.row, S.rowAlt] : S.row} wrap={false}>
                <Text style={[S.cell, S.colDate]}>{dt(inc.tanggal)}</Text>
                <Text style={[S.cell, S.colDesc]}>{inc.description ?? '—'}</Text>
                <Text style={[S.cell, S.colState]}>{lbl(t, inc.severity)}</Text>
                <Text style={[S.cell, S.colState]}>{lbl(t, inc.status)}</Text>
                <Text style={[S.cell, S.colAmt]}>{rp(inc.cost)}</Text>
              </View>
            ))}
          </>
        )}

        {/* Kondisi fisik */}
        <Text style={S.sectionTitle} minPresenceAhead={70}>{t('vehicle.physicalCondition')}</Text>
        <Text style={S.noteText}>{t('vehicle.lastInspection', { value: lastInspectionText })}</Text>
        <Text style={S.noteText}>{t('vehicle.lastOil', { value: lastOilText })}</Text>

        {condition.activeTires.length > 0 && (
          <>
            <Text style={[S.sectionTitle, { marginTop: 8 }]} minPresenceAhead={70}>{t('vehicle.activeTires', { count: condition.activeTireCount })}</Text>
            <View style={S.tableHeader}>
              <Text style={[S.tableHeaderText, S.colDoc]}>{t('vehicle.columns.position')}</Text>
              <Text style={[S.tableHeaderText, S.colDesc]}>{t('vehicle.columns.brandSerial')}</Text>
              <Text style={[S.tableHeaderText, S.colDate]}>{t('vehicle.columns.installed')}</Text>
              <Text style={[S.tableHeaderText, S.colAmt]}>{t('vehicle.columns.usage')}</Text>
            </View>
            {condition.activeTires.map((tire, i) => (
              <View key={i} style={i % 2 === 1 ? [S.row, S.rowAlt] : S.row} wrap={false}>
                <Text style={[S.cell, S.colDoc]}>{lbl(t, tire.position)}</Text>
                <Text style={[S.cell, S.colDesc]}>
                  {tire.brand ?? '—'}{tire.serialNumber ? ` · ${tire.serialNumber}` : ''}
                </Text>
                <Text style={[S.cell, S.colDate]}>{dt(tire.installedAt)}</Text>
                <Text style={[S.cell, S.colAmt]}>{tire.usageKm != null ? `${num(tire.usageKm)} km` : '—'}</Text>
              </View>
            ))}
          </>
        )}

        <PdfFooter company={company.name} docRef={t('vehicle.docTitle', { code: asset.code })} paddingHorizontal={36} printedAt={pdfDateTime(generatedAt)} />
      </Page>
    </Document>
  );
}
