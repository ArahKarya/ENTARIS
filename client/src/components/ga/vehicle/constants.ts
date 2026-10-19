/**
 * Enumerations and translated labels for the fleet module (Kendaraan).
 * Values are the server enums (server/src/routes/ga/vehicle.ts) — do not rename.
 */
import type { StatusTone } from '@/lib/status';
import { labelMap, tEam } from '../eam-i18n';

export const FUEL_TYPES = ['BENSIN', 'SOLAR', 'PERTAMAX', 'PERTALITE', 'DEX', 'LPG', 'LISTRIK', 'HYBRID', 'LAINNYA'] as const;
export const FUEL_TYPE_LABELS: Record<string, string> = labelMap(FUEL_TYPES, 'vehicle.fuelType');

export const SERVICE_TYPES = ['OLI', 'TUNE_UP', 'SERVIS_BERKALA', 'PERBAIKAN', 'GANTI_BAN', 'ELEKTRIKAL', 'AC', 'LAINNYA'] as const;
export const SERVICE_TYPE_LABELS: Record<string, string> = labelMap(SERVICE_TYPES, 'vehicle.serviceType');

export const URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
export const URGENCY_LABELS: Record<string, string> = labelMap(URGENCIES, 'vehicle.urgency');

export const TIRE_POSITIONS = [
  'DEPAN_KIRI', 'DEPAN_KANAN', 'BELAKANG_KIRI', 'BELAKANG_KANAN',
  'BELAKANG_KIRI_DALAM', 'BELAKANG_KIRI_LUAR', 'BELAKANG_KANAN_DALAM', 'BELAKANG_KANAN_LUAR', 'CADANGAN',
] as const;
export const TIRE_POSITION_LABELS: Record<string, string> = labelMap(TIRE_POSITIONS, 'vehicle.tirePosition');
export const TIRE_STATUSES = ['ACTIVE', 'SPARE', 'ARCHIVED'] as const;
export const TIRE_STATUS_LABELS: Record<string, string> = labelMap(TIRE_STATUSES, 'vehicle.tireStatus');

export const TAX_TYPES = ['STNK_TAHUNAN', 'STNK_5_TAHUNAN', 'KIR', 'PAJAK_KENDARAAN'] as const;
export const TAX_TYPE_LABELS: Record<string, string> = labelMap(TAX_TYPES, 'vehicle.taxType');
export const TAX_STATUSES = ['ACTIVE', 'EXPIRED', 'IN_PROCESS'] as const;

export const INSURANCE_TYPES = ['ALL_RISK', 'TLO', 'KECELAKAAN_DIRI', 'LAINNYA'] as const;
export const INSURANCE_TYPE_LABELS: Record<string, string> = labelMap(INSURANCE_TYPES, 'vehicle.insuranceType');
export const INSURANCE_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED'] as const;

/** Labels for the generic status values used by the forms (registry labels in lib/status). */
export const RECORD_STATUS_LABELS: Record<string, string> = labelMap(
  ['ACTIVE', 'EXPIRED', 'IN_PROCESS', 'CANCELLED'],
  'vehicle.recordStatus',
);

/** `{ label, tone }` lookup whose labels are translated on every read. */
function toneMap<K extends string>(tones: Record<K, StatusTone>, prefix: string): Record<string, { label: string; tone: StatusTone }> {
  const out: Record<string, { label: string; tone: StatusTone }> = {};
  for (const [value, tone] of Object.entries(tones) as [K, StatusTone][]) {
    out[value] = { tone, get label() { return tEam(`${prefix}.${value}`); } };
  }
  return out;
}

export const INSPECTION_RESULTS = ['BAIK', 'PERLU_PERHATIAN', 'TIDAK_LAYAK'] as const;
export const INSPECTION_RESULT_META = toneMap(
  { BAIK: 'success', PERLU_PERHATIAN: 'warning', TIDAK_LAYAK: 'danger' },
  'vehicle.inspectionResult',
);

export type CheckState = 'OK' | 'PERLU_PERHATIAN' | 'RUSAK';
export const CHECK_STATES: readonly CheckState[] = ['OK', 'PERLU_PERHATIAN', 'RUSAK'];
export const CHECK_STATE_META = toneMap({ OK: 'success', PERLU_PERHATIAN: 'warning', RUSAK: 'danger' }, 'vehicle.checkState');

const CHECKPOINT_KEYS = [
  // Legacy flat checklist (12 items) — kept so old inspections show labels, not raw keys.
  'ban', 'rem', 'oli', 'lampu', 'klakson', 'wiper', 'kaca_spion', 'sabuk_pengaman', 'ac', 'aki',
  'radiator', 'kelengkapan_p3k_apar',
  // Detailed checklist per category.
  'oli_mesin', 'oli_rem', 'air_radiator', 'air_aki', 'air_wiper',
  'lampu_depan', 'lampu_belakang', 'lampu_sein', 'lampu_rem', 'lampu_mundur',
  'rem_depan', 'rem_belakang', 'rem_tangan', 'kemudi_suspensi',
  'ban_depan', 'ban_belakang', 'ban_serep', 'tekanan_ban', 'velg',
  'p3k', 'apar', 'segitiga_pengaman', 'dongkrak', 'kunci_roda',
  'kaca_depan', 'kaca_belakang', 'body_cat', 'dashboard_indikator',
] as const;
export const CHECKPOINT_LABELS: Record<string, string> = labelMap(CHECKPOINT_KEYS, 'vehicle.checkpoint');

export const FUEL_LEVELS = ['KOSONG', 'SEPEREMPAT', 'SETENGAH', 'TIGA_PEREMPAT', 'PENUH'] as const;
export const FUEL_LEVEL_LABELS: Record<string, string> = labelMap(FUEL_LEVELS, 'vehicle.fuelLevel');

export interface InspectionCategory {
  key: string;
  label: string;
  items: { key: string; label: string }[];
}

function fallbackCategory(key: string, items: readonly string[]): InspectionCategory {
  return {
    key,
    get label() { return tEam(`vehicle.inspectionCategory.${key}`); },
    items: items.map((item) => ({ key: item, get label() { return CHECKPOINT_LABELS[item] ?? item; } })),
  };
}

/** Fallback category structure when GET /inspection-categories is unavailable. */
export const INSPECTION_CATEGORY_FALLBACK: InspectionCategory[] = [
  fallbackCategory('mesin', ['oli_mesin', 'oli_rem', 'air_radiator', 'air_aki', 'air_wiper']),
  fallbackCategory('kelistrikan', ['lampu_depan', 'lampu_belakang', 'lampu_sein', 'lampu_rem', 'lampu_mundur', 'klakson']),
  fallbackCategory('rem_kemudi', ['rem_depan', 'rem_belakang', 'rem_tangan', 'kemudi_suspensi']),
  fallbackCategory('ban_roda', ['ban_depan', 'ban_belakang', 'ban_serep', 'tekanan_ban', 'velg']),
  fallbackCategory('keselamatan', ['sabuk_pengaman', 'p3k', 'apar', 'segitiga_pengaman', 'dongkrak', 'kunci_roda']),
  fallbackCategory('lain', ['kaca_spion', 'kaca_depan', 'kaca_belakang', 'wiper', 'ac', 'body_cat', 'dashboard_indikator']),
];

export const INCIDENT_SEVERITIES = ['RINGAN', 'SEDANG', 'BERAT'] as const;
export const INCIDENT_SEVERITY_META = toneMap({ RINGAN: 'neutral', SEDANG: 'warning', BERAT: 'danger' }, 'vehicle.incidentSeverity');
export const INCIDENT_STATUSES = ['DILAPORKAN', 'DALAM_PROSES', 'SELESAI', 'KLAIM_ASURANSI'] as const;
export const INCIDENT_STATUS_LABELS: Record<string, string> = labelMap(INCIDENT_STATUSES, 'vehicle.incidentStatus');

/** Asset statuses (GaAssetStatus) for the fleet status filter. */
export const ASSET_STATUSES = ['ACTIVE', 'IN_REPAIR', 'RETIRED', 'LOST'] as const;

/** Detail view sections, in tab order; the key is the `section` URL param. */
export const VEHICLE_SECTIONS = [
  { key: 'ringkasan', get label() { return tEam('vehicle.section.ringkasan'); } },
  { key: 'servis', get label() { return tEam('vehicle.section.servis'); } },
  { key: 'pajak', get label() { return tEam('vehicle.section.pajak'); } },
  { key: 'asuransi', get label() { return tEam('vehicle.section.asuransi'); } },
  { key: 'bbm', get label() { return tEam('vehicle.section.bbm'); } },
  { key: 'ban-oli', get label() { return tEam('vehicle.section.ban_oli'); } },
  { key: 'inspeksi', get label() { return tEam('vehicle.section.inspeksi'); } },
  { key: 'insiden', get label() { return tEam('vehicle.section.insiden'); } },
  { key: 'dokumen', get label() { return tEam('vehicle.section.dokumen'); } },
  { key: 'laporan', get label() { return tEam('vehicle.section.laporan'); } },
] as const;
export type VehicleSection = (typeof VEHICLE_SECTIONS)[number]['key'];
export const DEFAULT_SECTION: VehicleSection = 'ringkasan';

/** URL params of the detail view (?vehicle=<id>&section=<key>). */
export const VEHICLE_PARAM = 'vehicle';
export const SECTION_PARAM = 'section';
