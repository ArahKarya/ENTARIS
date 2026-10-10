/**
 * PDF hasil inspeksi berkala kendaraan — 1 record inspeksi.
 * Berisi identitas kendaraan, info inspeksi, checklist per kategori,
 * catatan, dan foto bukti. Dipakai dari riwayat inspeksi GaVehiclePage.
 */
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { C, FOOTER_SPACE } from './theme';
import { pdfDateShort, pdfDateTime, pdfNum, pdfT, type PdfT } from './pdfFormat';
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

  sectionTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.dark, marginBottom: 6, marginTop: 8 },

  summaryRow: { flexDirection: 'row', marginBottom: 12, gap: 8 },
  summaryBox: { flex: 1, padding: 8, borderRadius: 3, borderWidth: 0.5, borderColor: C.border },
  summaryLabel: { fontSize: 7, color: C.muted, marginBottom: 2 },
  summaryValue: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  summarySub: { fontSize: 6.5, color: C.faint, marginTop: 2 },

  idGrid: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 6 },
  idCell: { width: '25%', marginBottom: 6, paddingRight: 8 },
  idLabel: { fontSize: 6.5, color: C.faint, marginBottom: 1 },
  idValue: { fontSize: 8.5, fontFamily: 'Helvetica-Bold', color: C.mid },

  tableHeader: { flexDirection: 'row', borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.primary, paddingVertical: 5, paddingHorizontal: 6 },
  tableHeaderText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.primary, letterSpacing: 0.3 },
  catRow: { flexDirection: 'row', backgroundColor: C.bgLight, paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.border },
  catText: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.primary, letterSpacing: 0.2 },
  row: { flexDirection: 'row', paddingVertical: 4, paddingHorizontal: 6, borderBottomWidth: 0.5, borderBottomColor: C.border },
  rowAlt: { backgroundColor: C.bgLight },
  cell: { fontSize: 8 },
  cellBold: { fontSize: 8, fontFamily: 'Helvetica-Bold' },

  colItem: { flex: 1 },
  colStatus: { width: 90, textAlign: 'right' },

  emptyText: { fontSize: 8, fontStyle: 'italic', color: C.faint, paddingVertical: 6, paddingHorizontal: 6 },
  noteBox: { borderWidth: 0.5, borderColor: C.border, borderRadius: 3, padding: 8, backgroundColor: C.bgLight },
  noteText: { fontSize: 8, color: C.mid, lineHeight: 1.4 },

  photoCatLabel: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: C.muted, marginTop: 6, marginBottom: 3, letterSpacing: 0.3 },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  photoBox: { width: 156, marginBottom: 6 },
  photo: { width: 156, height: 110, objectFit: 'cover', borderRadius: 3, borderWidth: 0.5, borderColor: C.border },
  photoCaption: { fontSize: 6.5, color: C.faint, marginTop: 2 },

  footer: { position: 'absolute', bottom: 24, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: C.border, paddingTop: 6 },
  footerText: { fontSize: 6.5, color: C.faint },
});

const num = (v: number) => pdfNum(v, 3);
const dt = (v: string | Date | null | undefined) => pdfDateShort(v);

const RESULT_KEYS = ['BAIK', 'PERLU_PERHATIAN', 'TIDAK_LAYAK'] as const;
const resultLabel = (t: PdfT, r: string): string =>
  (RESULT_KEYS as readonly string[]).includes(r) ? t(`inspection.result.${r as (typeof RESULT_KEYS)[number]}`) : r;
const resultColor = (r: string) =>
  r === 'BAIK' ? C.green : r === 'PERLU_PERHATIAN' ? C.amber : r === 'TIDAK_LAYAK' ? C.red : C.mid;

const STATE_KEYS = ['OK', 'PERLU_PERHATIAN', 'RUSAK'] as const;
const stateLabel = (t: PdfT, s: string): string =>
  (STATE_KEYS as readonly string[]).includes(s) ? t(`inspection.state.${s as (typeof STATE_KEYS)[number]}`) : s;
const stateColor = (s: string) =>
  s === 'OK' ? C.green : s === 'PERLU_PERHATIAN' ? C.amber : s === 'RUSAK' ? C.red : C.faint;

const FUEL_KEYS = ['KOSONG', 'SEPEREMPAT', 'SETENGAH', 'TIGA_PEREMPAT', 'PENUH'] as const;
const fuelLabel = (t: PdfT, f: string): string =>
  (FUEL_KEYS as readonly string[]).includes(f) ? t(`inspection.fuel.${f as (typeof FUEL_KEYS)[number]}`) : f;

/** Checklist item keys: covers the OLD flat format (12 items) and the NEW per-category format. */
const CHECKPOINT_KEYS = [
  'ban', 'rem', 'oli', 'lampu', 'klakson', 'wiper', 'kaca_spion', 'sabuk_pengaman', 'ac', 'aki',
  'radiator', 'kelengkapan_p3k_apar', 'oli_mesin', 'oli_rem', 'air_radiator', 'air_aki', 'air_wiper',
  'lampu_depan', 'lampu_belakang', 'lampu_sein', 'lampu_rem', 'lampu_mundur',
  'rem_depan', 'rem_belakang', 'rem_tangan', 'kemudi_suspensi',
  'ban_depan', 'ban_belakang', 'ban_serep', 'tekanan_ban', 'velg',
  'p3k', 'apar', 'segitiga_pengaman', 'dongkrak', 'kunci_roda',
  'kaca_depan', 'kaca_belakang', 'body_cat', 'dashboard_indikator',
] as const;
const checkpointLabel = (t: PdfT, key: string): string | undefined =>
  (CHECKPOINT_KEYS as readonly string[]).includes(key)
    ? t(`inspection.checkpoints.${key as (typeof CHECKPOINT_KEYS)[number]}`)
    : undefined;

export interface InspectionPdfCategory {
  key: string;
  label: string;
  items: { key: string; label: string }[];
}

export interface InspectionPdfAsset {
  code: string;
  name: string;
  noPlat?: string | null;
  brand?: string | null;
  tipe?: string | null;
  categoryName?: string | null;
}

export interface InspectionPdfPhoto {
  category: string;
  /** data URL hasil pre-fetch (react-pdf butuh sumber yang bisa diambil sinkron/aman). */
  src: string;
  caption?: string | null;
}

export interface InspectionPdfData {
  tanggal: string | Date;
  odometer?: number | null;
  checklist?: Record<string, string> | null;
  overallResult: string;
  notes?: string | null;
  inspectorName?: string | null;
  fuelLevel?: string | null;
  nextDueDate?: string | Date | null;
}

interface Props {
  inspection: InspectionPdfData;
  asset: InspectionPdfAsset;
  categories: InspectionPdfCategory[];
  photos: InspectionPdfPhoto[];
  company: { name: string; address: string | null; logoUrl?: string | null };
  printedBy: string;
  generatedAt: Date;
}

export default function InspectionDetailPDF({
  inspection, asset, categories, photos, company, printedBy, generatedAt,
}: Props) {
  const t = pdfT();
  const checklist: Record<string, string> = inspection.checklist ?? {};
  const knownKeys = new Set(categories.flatMap((c) => c.items.map((i) => i.key)));
  const legacyKeys = Object.keys(checklist).filter((k) => !knownKeys.has(k));

  const groups = categories
    .map((cat) => ({
      label: cat.label,
      rows: cat.items
        .filter((i) => checklist[i.key])
        .map((i) => ({ label: i.label ?? checkpointLabel(t, i.key) ?? i.key, state: checklist[i.key]! })),
    }))
    .filter((g) => g.rows.length > 0);

  if (legacyKeys.length > 0) {
    groups.push({
      label: t('inspection.legacyChecklist'),
      rows: legacyKeys.map((k) => ({ label: checkpointLabel(t, k) ?? k, state: checklist[k]! })),
    });
  }

  const catLabel = (key: string) => categories.find((c) => c.key === key)?.label ?? key;
  const photosByCategory = photos.reduce<Record<string, InspectionPdfPhoto[]>>((acc, p) => {
    (acc[p.category] ||= []).push(p);
    return acc;
  }, {});
  const photoCats = Object.keys(photosByCategory);

  let rowIndex = 0;

  return (
    <Document title={t('inspection.docTitle', { vehicle: asset.noPlat ?? asset.code, date: dt(inspection.tanggal) })}>
      <Page size="A4" style={S.page}>
        <PdfHeader
          company={company}
          title={t('inspection.title')}
          number={asset.noPlat ?? asset.code}
          dateLine={t('common.dateLine', { date: dt(inspection.tanggal) })}
        />

        {/* Ringkasan inspeksi */}
        <View style={S.summaryRow}>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('inspection.overallResult')}</Text>
            <Text style={[S.summaryValue, { color: resultColor(inspection.overallResult) }]}>
              {resultLabel(t, inspection.overallResult)}
            </Text>
            <Text style={S.summarySub}>{t('inspection.dateLine', { date: dt(inspection.tanggal) })}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('inspection.odometer')}</Text>
            <Text style={S.summaryValue}>
              {inspection.odometer != null ? `${num(Number(inspection.odometer))} km` : '—'}
            </Text>
            <Text style={S.summarySub}>{t('inspection.atInspection')}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('inspection.fuelLevel')}</Text>
            <Text style={S.summaryValue}>
              {inspection.fuelLevel ? fuelLabel(t, inspection.fuelLevel) : '—'}
            </Text>
            <Text style={S.summarySub}>{t('inspection.tankGauge')}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>{t('inspection.nextInspection')}</Text>
            <Text style={S.summaryValue}>{dt(inspection.nextDueDate)}</Text>
            <Text style={S.summarySub}>{t('inspection.dueSchedule')}</Text>
          </View>
        </View>

        {/* Identitas kendaraan */}
        <Text style={S.sectionTitle}>{t('inspection.identity')}</Text>
        <View style={S.idGrid}>
          {[
            [t('inspection.fields.assetCode'), asset.code || '—'],
            [t('inspection.fields.vehicleName'), asset.name || '—'],
            [t('inspection.fields.plate'), asset.noPlat || '—'],
            [t('inspection.fields.brandType'), [asset.brand, asset.tipe].filter(Boolean).join(' ') || '—'],
            [t('inspection.fields.category'), asset.categoryName || '—'],
            [t('inspection.fields.inspector'), inspection.inspectorName || '—'],
            [t('inspection.fields.inspectionDate'), dt(inspection.tanggal)],
            [t('inspection.fields.nextInspection'), dt(inspection.nextDueDate)],
          ].map(([label, value]) => (
            <View key={label} style={S.idCell}>
              <Text style={S.idLabel}>{label.toUpperCase()}</Text>
              <Text style={S.idValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Checklist per kategori */}
        <Text style={S.sectionTitle}>{t('inspection.checklist')}</Text>
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderText, S.colItem]}>{t('inspection.checkItem')}</Text>
          <Text style={[S.tableHeaderText, S.colStatus]}>{t('inspection.statusUpper')}</Text>
        </View>
        {groups.length === 0 ? (
          <Text style={S.emptyText}>{t('inspection.noChecklist')}</Text>
        ) : (
          groups.map((g) => (
            <View key={g.label} wrap={false}>
              <View style={S.catRow}>
                <Text style={[S.catText, S.colItem]}>{g.label.toUpperCase()}</Text>
                <Text style={[S.catText, S.colStatus]} />
              </View>
              {g.rows.map((r) => {
                rowIndex += 1;
                return (
                  <View key={`${g.label}-${r.label}`} style={rowIndex % 2 === 0 ? [S.row, S.rowAlt] : S.row}>
                    <Text style={[S.cell, S.colItem]}>{r.label}</Text>
                    <Text style={[S.cellBold, S.colStatus, { color: stateColor(r.state) }]}>
                      {stateLabel(t, r.state)}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))
        )}

        {/* Catatan */}
        <Text style={S.sectionTitle}>{t('common.notes')}</Text>
        <View style={S.noteBox}>
          <Text style={S.noteText}>{inspection.notes || t('inspection.noNotes')}</Text>
        </View>

        {/* Foto bukti */}
        {photoCats.length > 0 && (
          <>
            <Text style={S.sectionTitle} break>{t('inspection.photos', { count: photos.length })}</Text>
            {photoCats.map((catKey) => (
              <View key={catKey}>
                <Text style={S.photoCatLabel}>{catLabel(catKey).toUpperCase()}</Text>
                <View style={S.photoGrid}>
                  {photosByCategory[catKey]!.map((p, i) => (
                    <View key={`${catKey}-${i}`} style={S.photoBox} wrap={false}>
                      <Image style={S.photo} src={p.src} />
                      {p.caption ? <Text style={S.photoCaption}>{p.caption}</Text> : null}
                    </View>
                  ))}
                </View>
              </View>
            ))}
          </>
        )}

        <PdfFooter company={company.name} docRef={t('inspection.docRef', { vehicle: asset.noPlat ?? asset.code })} paddingHorizontal={36} printedAt={t('common.printedBy', { date: pdfDateTime(generatedAt), name: printedBy })} />
      </Page>
    </Document>
  );
}
