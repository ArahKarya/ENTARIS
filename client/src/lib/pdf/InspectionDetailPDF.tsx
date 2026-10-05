/**
 * PDF hasil inspeksi berkala kendaraan — 1 record inspeksi.
 * Berisi identitas kendaraan, info inspeksi, checklist per kategori,
 * catatan, dan foto bukti. Dipakai dari riwayat inspeksi GaVehiclePage.
 */
import { Document, Page, View, Text, Image, StyleSheet } from '@react-pdf/renderer';
import { C, FOOTER_SPACE } from './theme';
import { pdfDateShort, pdfDateTime, pdfNum } from './pdfFormat';
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

const RESULT_LABELS: Record<string, string> = {
  BAIK: 'Baik', PERLU_PERHATIAN: 'Perlu Perhatian', TIDAK_LAYAK: 'Tidak Layak',
};
const resultColor = (r: string) =>
  r === 'BAIK' ? C.green : r === 'PERLU_PERHATIAN' ? C.amber : r === 'TIDAK_LAYAK' ? C.red : C.mid;

const STATE_LABELS: Record<string, string> = {
  OK: 'OK', PERLU_PERHATIAN: 'Perlu Perhatian', RUSAK: 'Rusak',
};
const stateColor = (s: string) =>
  s === 'OK' ? C.green : s === 'PERLU_PERHATIAN' ? C.amber : s === 'RUSAK' ? C.red : C.faint;

const FUEL_LEVEL_LABELS: Record<string, string> = {
  KOSONG: 'Kosong (E)', SEPEREMPAT: 'Seperempat (1/4)', SETENGAH: 'Setengah (1/2)',
  TIGA_PEREMPAT: 'Tiga Perempat (3/4)', PENUH: 'Penuh (F)',
};

/** Label item checklist — mencakup format LAMA (12 item datar) & format BARU per kategori. */
const CHECKPOINT_LABELS: Record<string, string> = {
  ban: 'Ban', rem: 'Rem', oli: 'Oli', lampu: 'Lampu', klakson: 'Klakson', wiper: 'Wiper',
  kaca_spion: 'Kaca Spion', sabuk_pengaman: 'Sabuk Pengaman', ac: 'AC', aki: 'Aki',
  radiator: 'Radiator', kelengkapan_p3k_apar: 'Kelengkapan P3K/APAR',
  oli_mesin: 'Oli Mesin', oli_rem: 'Oli Rem', air_radiator: 'Air Radiator / Coolant',
  air_aki: 'Air Aki', air_wiper: 'Air Wiper',
  lampu_depan: 'Lampu Depan', lampu_belakang: 'Lampu Belakang', lampu_sein: 'Lampu Sein',
  lampu_rem: 'Lampu Rem', lampu_mundur: 'Lampu Mundur',
  rem_depan: 'Rem Depan', rem_belakang: 'Rem Belakang', rem_tangan: 'Rem Tangan',
  kemudi_suspensi: 'Kemudi / Suspensi',
  ban_depan: 'Ban Depan', ban_belakang: 'Ban Belakang', ban_serep: 'Ban Serep',
  tekanan_ban: 'Tekanan Ban', velg: 'Velg',
  p3k: 'P3K', apar: 'APAR', segitiga_pengaman: 'Segitiga Pengaman',
  dongkrak: 'Dongkrak', kunci_roda: 'Kunci Roda',
  kaca_depan: 'Kaca Depan', kaca_belakang: 'Kaca Belakang', body_cat: 'Body / Cat',
  dashboard_indikator: 'Dashboard / Indikator',
};

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
  const checklist: Record<string, string> = inspection.checklist ?? {};
  const knownKeys = new Set(categories.flatMap((c) => c.items.map((i) => i.key)));
  const legacyKeys = Object.keys(checklist).filter((k) => !knownKeys.has(k));

  const groups = categories
    .map((cat) => ({
      label: cat.label,
      rows: cat.items
        .filter((i) => checklist[i.key])
        .map((i) => ({ label: i.label ?? CHECKPOINT_LABELS[i.key] ?? i.key, state: checklist[i.key]! })),
    }))
    .filter((g) => g.rows.length > 0);

  if (legacyKeys.length > 0) {
    groups.push({
      label: 'Checklist (format lama)',
      rows: legacyKeys.map((k) => ({ label: CHECKPOINT_LABELS[k] ?? k, state: checklist[k]! })),
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
    <Document title={`Inspeksi ${asset.noPlat ?? asset.code} ${dt(inspection.tanggal)}`}>
      <Page size="A4" style={S.page}>
        <PdfHeader
          company={company}
          title="HASIL INSPEKSI KENDARAAN"
          number={asset.noPlat ?? asset.code}
          dateLine={`Tanggal: ${dt(inspection.tanggal)}`}
        />

        {/* Ringkasan inspeksi */}
        <View style={S.summaryRow}>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>HASIL KESELURUHAN</Text>
            <Text style={[S.summaryValue, { color: resultColor(inspection.overallResult) }]}>
              {RESULT_LABELS[inspection.overallResult] ?? inspection.overallResult}
            </Text>
            <Text style={S.summarySub}>Tanggal {dt(inspection.tanggal)}</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>ODOMETER</Text>
            <Text style={S.summaryValue}>
              {inspection.odometer != null ? `${num(Number(inspection.odometer))} km` : '—'}
            </Text>
            <Text style={S.summarySub}>Saat inspeksi</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>LEVEL BBM</Text>
            <Text style={S.summaryValue}>
              {inspection.fuelLevel ? (FUEL_LEVEL_LABELS[inspection.fuelLevel] ?? inspection.fuelLevel) : '—'}
            </Text>
            <Text style={S.summarySub}>Indikator tangki</Text>
          </View>
          <View style={S.summaryBox}>
            <Text style={S.summaryLabel}>INSPEKSI BERIKUTNYA</Text>
            <Text style={S.summaryValue}>{dt(inspection.nextDueDate)}</Text>
            <Text style={S.summarySub}>Jadwal jatuh tempo</Text>
          </View>
        </View>

        {/* Identitas kendaraan */}
        <Text style={S.sectionTitle}>Identitas Kendaraan</Text>
        <View style={S.idGrid}>
          {[
            ['Kode Aset', asset.code || '—'],
            ['Nama Kendaraan', asset.name || '—'],
            ['Nomor Plat', asset.noPlat || '—'],
            ['Merek / Tipe', [asset.brand, asset.tipe].filter(Boolean).join(' ') || '—'],
            ['Kategori', asset.categoryName || '—'],
            ['Inspektor', inspection.inspectorName || '—'],
            ['Tanggal Inspeksi', dt(inspection.tanggal)],
            ['Inspeksi Berikutnya', dt(inspection.nextDueDate)],
          ].map(([label, value]) => (
            <View key={label} style={S.idCell}>
              <Text style={S.idLabel}>{label.toUpperCase()}</Text>
              <Text style={S.idValue}>{value}</Text>
            </View>
          ))}
        </View>

        {/* Checklist per kategori */}
        <Text style={S.sectionTitle}>Checklist Pemeriksaan</Text>
        <View style={S.tableHeader}>
          <Text style={[S.tableHeaderText, S.colItem]}>ITEM PEMERIKSAAN</Text>
          <Text style={[S.tableHeaderText, S.colStatus]}>STATUS</Text>
        </View>
        {groups.length === 0 ? (
          <Text style={S.emptyText}>Checklist tidak tersedia untuk inspeksi ini.</Text>
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
                      {STATE_LABELS[r.state] ?? r.state}
                    </Text>
                  </View>
                );
              })}
            </View>
          ))
        )}

        {/* Catatan */}
        <Text style={S.sectionTitle}>Catatan</Text>
        <View style={S.noteBox}>
          <Text style={S.noteText}>{inspection.notes || 'Tidak ada catatan tambahan.'}</Text>
        </View>

        {/* Foto bukti */}
        {photoCats.length > 0 && (
          <>
            <Text style={S.sectionTitle} break>Foto Bukti ({photos.length})</Text>
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

        <PdfFooter company={company.name} docRef={`Inspeksi ${asset.noPlat ?? asset.code}`} paddingHorizontal={36} printedAt={`${pdfDateTime(generatedAt)} oleh ${printedBy}`} />
      </Page>
    </Document>
  );
}
