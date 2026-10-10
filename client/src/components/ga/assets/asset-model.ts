/**
 * Pure rules for the Aset & Pemeliharaan pages (Daftar Aset, Gedung & Sewa,
 * Peralatan & Kalibrasi): labels, tones, API param mapping and date states.
 */
import { parseDate } from '@/lib/format';
import type { StatusTone } from '@/lib/status';

// Asset register

export type AssetStatus = 'ACTIVE' | 'IN_REPAIR' | 'RETIRED' | 'LOST';
export type AssetCondition = 'GOOD' | 'FAIR' | 'POOR' | 'BROKEN';

export const ASSET_STATUSES: readonly AssetStatus[] = ['ACTIVE', 'IN_REPAIR', 'RETIRED', 'LOST'];

export const CONDITION_OPTIONS: ReadonlyArray<{ value: AssetCondition; label: string; tone: StatusTone }> = [
  { value: 'GOOD', label: 'Baik', tone: 'success' },
  { value: 'FAIR', label: 'Cukup', tone: 'info' },
  { value: 'POOR', label: 'Kurang', tone: 'warning' },
  { value: 'BROKEN', label: 'Rusak', tone: 'danger' },
];

export function conditionMeta(condition: string | null | undefined): { label: string; tone: StatusTone } {
  const found = CONDITION_OPTIONS.find((o) => o.value === condition);
  return found ? { label: found.label, tone: found.tone } : { label: condition || '-', tone: 'neutral' };
}

export interface RefCodeName {
  code: string;
  name: string;
}

export interface AssetPhotoRow {
  id: string;
  filePath: string;
  caption: string | null;
}

export interface AssetRow {
  id: string;
  code: string;
  name: string;
  categoryId: string;
  branchId: string;
  costCenterId: string | null;
  picUserId?: string | null;
  serialNumber: string | null;
  acquisitionDate: string | null;
  acquisitionCost: string | number | null;
  status: string;
  condition: string;
  location: string | null;
  notes: string | null;
  category?: RefCodeName | null;
  branch?: RefCodeName | null;
  costCenter?: RefCodeName | null;
  qr?: { qrCode?: string | null } | null;
  fixedAsset?: {
    id: string;
    assetNumber: string;
    bookValue: string | number;
    /** Only from the detail endpoint (full fixed asset row). */
    acquisitionDate?: string | null;
    acquisitionCost?: string | number | null;
  } | null;
  vehicleData?: { noPlat?: string | null } | null;
  pic?: { id: string; fullName: string | null } | null;
  /** Only with `thumb=1` (first photo) or from the detail endpoint (all). */
  photos?: AssetPhotoRow[];
}

/** Public URL of an uploaded photo (served by the API under /uploads). */
export const photoUrl = (filePath: string) => `/uploads/${filePath}`;

export const ASSET_FILTER_KEYS = ['categoryId', 'status', 'condition', 'branchId'] as const;

/**
 * useListState params → GET /ga/assets params. The endpoint reads the search
 * text from `q` and returns `{ data, total, page, limit }` with `paginated=1`;
 * `thumb=1` adds the first photo of each asset.
 */
export function toAssetListParams(params: Record<string, string | number>): Record<string, string | number> {
  const { search, ...rest } = params;
  return {
    ...rest,
    ...(search ? { q: search } : {}),
    paginated: '1',
    thumb: '1',
  };
}

// Date states (rental expiry, calibration due)

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/**
 * Whole calendar days from `today` to `date` (negative = in the past).
 * Server dates are stored at UTC midnight, so their date part is read as a
 * local calendar date (no shift across time zones).
 */
export function daysUntil(date: string | Date | null | undefined, today: Date = new Date()): number | null {
  if (!date) return null;
  const iso = typeof date === 'string' ? date.slice(0, 10) : date;
  const d = parseDate(iso);
  if (!d) return null;
  return Math.round((startOfDay(d) - startOfDay(today)) / DAY_MS);
}

export type DueState = 'overdue' | 'dueSoon' | 'ok';

export interface DueInfo {
  state: DueState;
  /** Days until the date (negative when past). */
  days: number;
  /** Indonesian text shown next to the icon. */
  label: string;
}

/** Days ahead that count as "segera" for rental expiry and calibration. */
export const RENTAL_SOON_DAYS = 60;
export const CALIBRATION_SOON_DAYS = 30;

function dueInfo(days: number, soonDays: number, words: { overdue: string; today: string; soon: string; ok: string }): DueInfo {
  if (days < 0) return { state: 'overdue', days, label: `${words.overdue} ${-days} hari` };
  if (days === 0) return { state: 'dueSoon', days, label: words.today };
  if (days <= soonDays) return { state: 'dueSoon', days, label: `${words.soon} ${days} hari lagi` };
  return { state: 'ok', days, label: words.ok };
}

/**
 * Expiry state of a building rental. Only an active contract (status AKTIF)
 * can be overdue or expiring; ended contracts have no state.
 */
export function rentalExpiry(
  rental: { status: string; tanggalAkhir: string | null | undefined },
  today: Date = new Date(),
): DueInfo | null {
  if (rental.status !== 'AKTIF') return null;
  const days = daysUntil(rental.tanggalAkhir, today);
  if (days === null) return null;
  return dueInfo(days, RENTAL_SOON_DAYS, {
    overdue: 'Lewat masa sewa',
    today: 'Berakhir hari ini',
    soon: 'Berakhir',
    ok: 'Berlaku',
  });
}

/** Calibration state from the next due date (GaEquipmentData.nextCalibrationDue). */
export function calibrationDue(nextDue: string | null | undefined, today: Date = new Date()): DueInfo | null {
  const days = daysUntil(nextDue, today);
  if (days === null) return null;
  return dueInfo(days, CALIBRATION_SOON_DAYS, {
    overdue: 'Lewat jatuh tempo',
    today: 'Jatuh tempo hari ini',
    soon: 'Jatuh tempo',
    ok: 'Masih berlaku',
  });
}

/** The active rental that ends first (the one to act on), or null. */
export function nearestActiveRental<T extends { status: string; tanggalAkhir: string | null | undefined }>(
  rentals: readonly T[],
): T | null {
  let best: T | null = null;
  for (const r of rentals) {
    if (r.status !== 'AKTIF' || !r.tanggalAkhir) continue;
    if (!best || String(r.tanggalAkhir) < String(best.tanggalAkhir)) best = r;
  }
  return best;
}

// Building & equipment enums

export const BUILDING_TYPE_OPTIONS = [
  { value: 'KANTOR', label: 'Kantor' },
  { value: 'GUDANG', label: 'Gudang' },
  { value: 'PABRIK', label: 'Pabrik' },
  { value: 'RUMAH', label: 'Rumah' },
  { value: 'MESS', label: 'Mess' },
  { value: 'RUKO', label: 'Ruko' },
  { value: 'LAINNYA', label: 'Lainnya' },
] as const;

export const OWNERSHIP_OPTIONS = [
  { value: 'MILIK_SENDIRI', label: 'Milik sendiri' },
  { value: 'SEWA_MASUK', label: 'Disewa (sewa masuk)' },
  { value: 'SEWA_KELUAR', label: 'Disewakan (sewa keluar)' },
  { value: 'PINJAM_PAKAI', label: 'Pinjam pakai' },
] as const;

export const CERTIFICATE_OPTIONS = [
  { value: 'HM', label: 'HM (Hak Milik)' },
  { value: 'HGB', label: 'HGB (Hak Guna Bangunan)' },
  { value: 'HGU', label: 'HGU (Hak Guna Usaha)' },
  { value: 'HP_AKTA', label: 'Hak Pakai / Akta' },
  { value: 'GIRIK', label: 'Girik' },
  { value: 'BELUM_SERTIFIKAT', label: 'Belum bersertifikat' },
] as const;

export const RENTAL_DIRECTION_OPTIONS = [
  { value: 'SEWA_MASUK', label: 'Sewa masuk', hint: 'Kita menyewa dari pemilik' },
  { value: 'SEWA_KELUAR', label: 'Sewa keluar', hint: 'Kita menyewakan ke penyewa' },
] as const;

export const RENTAL_PERIOD_OPTIONS = [
  { value: 'BULANAN', label: 'Bulanan' },
  { value: 'TAHUNAN', label: 'Tahunan' },
] as const;

export const WEIGHING_UNIT_OPTIONS = ['KG', 'GRAM', 'TON', 'LBS'] as const;

export const CALIBRATION_MODE_OPTIONS = [
  { value: 'ON_SITE', label: 'Di lokasi' },
  { value: 'SHIPPED', label: 'Dikirim ke lembaga' },
] as const;

export const CALIBRATION_RESULT_OPTIONS: ReadonlyArray<{ value: 'PASS' | 'FAIL' | 'CONDITIONAL'; label: string; tone: StatusTone }> = [
  { value: 'PASS', label: 'Lulus', tone: 'success' },
  { value: 'CONDITIONAL', label: 'Lulus bersyarat', tone: 'warning' },
  { value: 'FAIL', label: 'Gagal', tone: 'danger' },
];

export function optionLabel(options: ReadonlyArray<{ value: string; label: string }>, value: string | null | undefined): string {
  if (!value) return '-';
  return options.find((o) => o.value === value)?.label ?? value;
}

/** "" → null; otherwise a finite number or NaN-safe null. */
export function numOrNull(v: string | null | undefined): number | null {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Error message from an axios-style error, with a fallback. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } } | null)?.response?.data;
  return typeof data?.error === 'string' && data.error.trim() ? data.error : fallback;
}
