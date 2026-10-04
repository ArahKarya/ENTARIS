/**
 * Enumerations and Indonesian labels for the fleet module (Kendaraan).
 * Values are the server enums (server/src/routes/ga/vehicle.ts) — do not rename.
 */
import type { StatusTone } from '@/lib/status';

export const FUEL_TYPES = ['BENSIN', 'SOLAR', 'PERTAMAX', 'PERTALITE', 'DEX', 'LPG', 'LISTRIK', 'HYBRID', 'LAINNYA'] as const;
export const FUEL_TYPE_LABELS: Record<string, string> = {
  BENSIN: 'Bensin', SOLAR: 'Solar', PERTAMAX: 'Pertamax', PERTALITE: 'Pertalite', DEX: 'Dex',
  LPG: 'LPG', LISTRIK: 'Listrik', HYBRID: 'Hybrid', LAINNYA: 'Lainnya',
};

export const SERVICE_TYPES = ['OLI', 'TUNE_UP', 'SERVIS_BERKALA', 'PERBAIKAN', 'GANTI_BAN', 'ELEKTRIKAL', 'AC', 'LAINNYA'] as const;
export const SERVICE_TYPE_LABELS: Record<string, string> = {
  OLI: 'Ganti Oli', TUNE_UP: 'Tune Up', SERVIS_BERKALA: 'Servis Berkala', PERBAIKAN: 'Perbaikan',
  GANTI_BAN: 'Ganti Ban', ELEKTRIKAL: 'Elektrikal', AC: 'AC', LAINNYA: 'Lainnya',
};

export const URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const URGENCY_LABELS: Record<string, string> = {
  LOW: 'Rendah', MEDIUM: 'Sedang', HIGH: 'Tinggi', URGENT: 'Mendesak',
};

export const TIRE_POSITIONS = [
  'DEPAN_KIRI', 'DEPAN_KANAN', 'BELAKANG_KIRI', 'BELAKANG_KANAN',
  'BELAKANG_KIRI_DALAM', 'BELAKANG_KIRI_LUAR', 'BELAKANG_KANAN_DALAM', 'BELAKANG_KANAN_LUAR', 'CADANGAN',
] as const;
export const TIRE_POSITION_LABELS: Record<string, string> = {
  DEPAN_KIRI: 'Depan Kiri', DEPAN_KANAN: 'Depan Kanan',
  BELAKANG_KIRI: 'Belakang Kiri', BELAKANG_KANAN: 'Belakang Kanan',
  BELAKANG_KIRI_DALAM: 'Belakang Kiri Dalam', BELAKANG_KIRI_LUAR: 'Belakang Kiri Luar',
  BELAKANG_KANAN_DALAM: 'Belakang Kanan Dalam', BELAKANG_KANAN_LUAR: 'Belakang Kanan Luar',
  CADANGAN: 'Cadangan (Serep)',
};
export const TIRE_STATUSES = ['ACTIVE', 'SPARE', 'ARCHIVED'] as const;
export const TIRE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Terpasang', ARCHIVED: 'Dilepas (Diarsipkan)', SPARE: 'Ban Serep (Stok)',
};

export const TAX_TYPES = ['STNK_TAHUNAN', 'STNK_5_TAHUNAN', 'KIR', 'PAJAK_KENDARAAN'] as const;
export const TAX_TYPE_LABELS: Record<string, string> = {
  STNK_TAHUNAN: 'STNK Tahunan', STNK_5_TAHUNAN: 'STNK 5 Tahunan', KIR: 'KIR', PAJAK_KENDARAAN: 'Pajak Kendaraan',
};
export const TAX_STATUSES = ['ACTIVE', 'EXPIRED', 'IN_PROCESS'] as const;

export const INSURANCE_TYPES = ['ALL_RISK', 'TLO', 'KECELAKAAN_DIRI', 'LAINNYA'] as const;
export const INSURANCE_TYPE_LABELS: Record<string, string> = {
  ALL_RISK: 'All Risk', TLO: 'TLO (Total Loss Only)', KECELAKAAN_DIRI: 'Kecelakaan Diri', LAINNYA: 'Lainnya',
};
export const INSURANCE_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED'] as const;

/** Labels for the generic status values used by the forms (registry labels in lib/status). */
export const RECORD_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif', EXPIRED: 'Kedaluwarsa', IN_PROCESS: 'Diproses', CANCELLED: 'Dibatalkan',
};

export const INSPECTION_RESULTS = ['BAIK', 'PERLU_PERHATIAN', 'TIDAK_LAYAK'] as const;
export const INSPECTION_RESULT_META: Record<string, { label: string; tone: StatusTone }> = {
  BAIK: { label: 'Baik', tone: 'success' },
  PERLU_PERHATIAN: { label: 'Perlu Perhatian', tone: 'warning' },
  TIDAK_LAYAK: { label: 'Tidak Layak', tone: 'danger' },
};

export type CheckState = 'OK' | 'PERLU_PERHATIAN' | 'RUSAK';
export const CHECK_STATES: readonly CheckState[] = ['OK', 'PERLU_PERHATIAN', 'RUSAK'];
export const CHECK_STATE_META: Record<string, { label: string; tone: StatusTone }> = {
  OK: { label: 'OK', tone: 'success' },
  PERLU_PERHATIAN: { label: 'Perhatian', tone: 'warning' },
  RUSAK: { label: 'Rusak', tone: 'danger' },
};

export const CHECKPOINT_LABELS: Record<string, string> = {
  // Legacy flat checklist (12 items) — kept so old inspections show labels, not raw keys.
  ban: 'Ban', rem: 'Rem', oli: 'Oli', lampu: 'Lampu', klakson: 'Klakson', wiper: 'Wiper',
  kaca_spion: 'Kaca Spion', sabuk_pengaman: 'Sabuk Pengaman', ac: 'AC', aki: 'Aki',
  radiator: 'Radiator', kelengkapan_p3k_apar: 'Kelengkapan P3K/APAR',
  // Detailed checklist per category.
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

export const FUEL_LEVELS = ['KOSONG', 'SEPEREMPAT', 'SETENGAH', 'TIGA_PEREMPAT', 'PENUH'] as const;
export const FUEL_LEVEL_LABELS: Record<string, string> = {
  KOSONG: 'Kosong (E)', SEPEREMPAT: 'Seperempat (1/4)', SETENGAH: 'Setengah (1/2)',
  TIGA_PEREMPAT: 'Tiga Perempat (3/4)', PENUH: 'Penuh (F)',
};

export interface InspectionCategory {
  key: string;
  label: string;
  items: { key: string; label: string }[];
}

/** Fallback category structure when GET /inspection-categories is unavailable. */
export const INSPECTION_CATEGORY_FALLBACK: InspectionCategory[] = [
  { key: 'mesin', label: 'Mesin & Cairan', items: [
    { key: 'oli_mesin', label: 'Oli Mesin' }, { key: 'oli_rem', label: 'Oli Rem' },
    { key: 'air_radiator', label: 'Air Radiator / Coolant' }, { key: 'air_aki', label: 'Air Aki' },
    { key: 'air_wiper', label: 'Air Wiper' },
  ] },
  { key: 'kelistrikan', label: 'Kelistrikan', items: [
    { key: 'lampu_depan', label: 'Lampu Depan' }, { key: 'lampu_belakang', label: 'Lampu Belakang' },
    { key: 'lampu_sein', label: 'Lampu Sein' }, { key: 'lampu_rem', label: 'Lampu Rem' },
    { key: 'lampu_mundur', label: 'Lampu Mundur' }, { key: 'klakson', label: 'Klakson' },
  ] },
  { key: 'rem_kemudi', label: 'Rem & Kemudi', items: [
    { key: 'rem_depan', label: 'Rem Depan' }, { key: 'rem_belakang', label: 'Rem Belakang' },
    { key: 'rem_tangan', label: 'Rem Tangan' }, { key: 'kemudi_suspensi', label: 'Kemudi / Suspensi' },
  ] },
  { key: 'ban_roda', label: 'Ban & Roda', items: [
    { key: 'ban_depan', label: 'Ban Depan' }, { key: 'ban_belakang', label: 'Ban Belakang' },
    { key: 'ban_serep', label: 'Ban Serep' }, { key: 'tekanan_ban', label: 'Tekanan Ban' },
    { key: 'velg', label: 'Velg' },
  ] },
  { key: 'keselamatan', label: 'Keselamatan', items: [
    { key: 'sabuk_pengaman', label: 'Sabuk Pengaman' }, { key: 'p3k', label: 'P3K' },
    { key: 'apar', label: 'APAR' }, { key: 'segitiga_pengaman', label: 'Segitiga Pengaman' },
    { key: 'dongkrak', label: 'Dongkrak' }, { key: 'kunci_roda', label: 'Kunci Roda' },
  ] },
  { key: 'lain', label: 'Lain-lain', items: [
    { key: 'kaca_spion', label: 'Kaca Spion' }, { key: 'kaca_depan', label: 'Kaca Depan' },
    { key: 'kaca_belakang', label: 'Kaca Belakang' }, { key: 'wiper', label: 'Wiper' },
    { key: 'ac', label: 'AC' }, { key: 'body_cat', label: 'Body / Cat' },
    { key: 'dashboard_indikator', label: 'Dashboard / Indikator' },
  ] },
];

export const INCIDENT_SEVERITIES = ['RINGAN', 'SEDANG', 'BERAT'] as const;
export const INCIDENT_SEVERITY_META: Record<string, { label: string; tone: StatusTone }> = {
  RINGAN: { label: 'Ringan', tone: 'neutral' },
  SEDANG: { label: 'Sedang', tone: 'warning' },
  BERAT: { label: 'Berat', tone: 'danger' },
};
export const INCIDENT_STATUSES = ['DILAPORKAN', 'DALAM_PROSES', 'SELESAI', 'KLAIM_ASURANSI'] as const;
export const INCIDENT_STATUS_LABELS: Record<string, string> = {
  DILAPORKAN: 'Dilaporkan', DALAM_PROSES: 'Dalam Proses', SELESAI: 'Selesai', KLAIM_ASURANSI: 'Klaim Asuransi',
};

/** Asset statuses (GaAssetStatus) for the fleet status filter. */
export const ASSET_STATUSES = ['ACTIVE', 'IN_REPAIR', 'RETIRED', 'LOST'] as const;

/** Detail view sections, in tab order; the key is the `section` URL param. */
export const VEHICLE_SECTIONS = [
  { key: 'ringkasan', label: 'Ringkasan' },
  { key: 'servis', label: 'Servis' },
  { key: 'pajak', label: 'Pajak & STNK' },
  { key: 'asuransi', label: 'Asuransi' },
  { key: 'bbm', label: 'BBM' },
  { key: 'ban-oli', label: 'Ban & Oli' },
  { key: 'inspeksi', label: 'Inspeksi' },
  { key: 'insiden', label: 'Insiden' },
  { key: 'dokumen', label: 'Dokumen' },
  { key: 'laporan', label: 'Laporan' },
] as const;
export type VehicleSection = (typeof VEHICLE_SECTIONS)[number]['key'];
export const DEFAULT_SECTION: VehicleSection = 'ringkasan';

/** URL params of the detail view (?vehicle=<id>&section=<key>). */
export const VEHICLE_PARAM = 'vehicle';
export const SECTION_PARAM = 'section';
