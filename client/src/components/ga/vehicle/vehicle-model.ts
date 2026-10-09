/**
 * Pure helpers for the fleet module: due-date state, service cost buckets,
 * oil life, URL section parsing. No React, no API — unit-tested.
 */
import { parseDate } from '@/lib/format';
import { DEFAULT_SECTION, VEHICLE_SECTIONS, type VehicleSection } from './constants';

// Fleet list rows (GET /ga/vehicle/fleet)

export type DueState = 'overdue' | 'dueSoon' | 'ok';
export const FLEET_DOCS = ['tax', 'stnk', 'kir', 'insurance', 'inspection'] as const;
export type FleetDoc = (typeof FLEET_DOCS)[number];

export const FLEET_DOC_LABELS: Record<FleetDoc, string> = {
  tax: 'Pajak tahunan',
  stnk: 'STNK 5 tahunan',
  kir: 'KIR',
  insurance: 'Asuransi',
  inspection: 'Inspeksi',
};

export interface FleetDueInfo {
  dueDate: string | null;
  state: DueState | null;
}

export interface FleetRow {
  id: string;
  code: string;
  name: string;
  status: string;
  condition: string;
  categoryName: string | null;
  noPlat: string | null;
  brand: string | null;
  tipe: string | null;
  tahunProduksi: number | null;
  jenisBBM: string | null;
  odometer: number | null;
  driver: { id: string; fullName: string | null } | null;
  due: Record<FleetDoc, FleetDueInfo>;
  attention: 'overdue' | 'dueSoon' | null;
  nextDueDate: string | null;
  openIncidentCount: number;
}

export interface FleetSummary {
  totalVehicles: number;
  taxExpiringSoon: number;
  taxExpired: number;
  insuranceExpiringSoon: number;
  insuranceExpired: number;
  openIncidents: number;
  inspectionOverdue?: number;
  inspectionDueSoon?: number;
  inspectionNeverDone?: number;
  serviceCostThisMonth: number;
  fuelCostThisMonth: number;
}

/** Obligations that are overdue or due soon, worst first (for the list cell). */
export function attentionItems(row: Pick<FleetRow, 'due'>): Array<{ doc: FleetDoc; state: 'overdue' | 'dueSoon'; dueDate: string | null }> {
  const items = FLEET_DOCS.flatMap((doc) => {
    const { state, dueDate } = row.due[doc];
    return state === 'overdue' || state === 'dueSoon' ? [{ doc, state, dueDate }] : [];
  });
  return items.sort((a, b) => {
    if (a.state !== b.state) return a.state === 'overdue' ? -1 : 1;
    return (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
  });
}

/** Display name of a vehicle: plate first, else the asset code. */
export const vehicleTitle = (v: { noPlat?: string | null; code: string }): string => v.noPlat || v.code;

// Due state for per-record tables

export const DUE_SOON_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Calendar-day due state (local time, same window as the server list):
 * before today = overdue, today..today+30 = dueSoon, later = ok.
 * Inactive records (paid off, cancelled) have no due state.
 */
export function dueStateOf(date: string | Date | null | undefined, active = true, today: Date = new Date()): DueState | null {
  if (!active) return null;
  const raw = typeof date === 'string' ? date.slice(0, 10) : date;
  const d = parseDate(raw ?? null);
  if (!d) return null;
  const days = Math.round((startOfDay(d).getTime() - startOfDay(today).getTime()) / DAY_MS);
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'dueSoon';
  return 'ok';
}

/** Whole days from today to `date` (negative when past). */
export function daysUntil(date: string | Date | null | undefined, today: Date = new Date()): number | null {
  const raw = typeof date === 'string' ? date.slice(0, 10) : date;
  const d = parseDate(raw ?? null);
  if (!d) return null;
  return Math.round((startOfDay(d).getTime() - startOfDay(today).getTime()) / DAY_MS);
}

// Service costs

export type ServiceBucket = 'oli' | 'ban' | 'rem' | 'elektrikal' | 'ac' | 'service' | 'lainnya';

export const SERVICE_BUCKET_LABELS: Record<ServiceBucket, string> = {
  oli: 'Oli',
  ban: 'Ban & roda',
  rem: 'Rem',
  elektrikal: 'Elektrikal',
  ac: 'AC',
  service: 'Servis & perbaikan',
  lainnya: 'Lainnya',
};

export interface ServiceLogLike {
  tanggal?: string | null;
  jenisService?: string | null;
  deskripsi?: string | null;
  bengkel?: string | null;
  biaya?: string | number | null;
}

/** Cost bucket of a service log, from its type and free-text description. */
export function classifyServiceCost(log: ServiceLogLike): ServiceBucket {
  const jenis = String(log?.jenisService ?? '').toUpperCase();
  const text = `${log?.deskripsi ?? ''} ${log?.bengkel ?? ''}`.toLowerCase();
  if (jenis === 'OLI' || /\boli\b|filter oli|meditran|shell r4|stempet|gemuk/.test(text)) return 'oli';
  if (jenis === 'GANTI_BAN' || /\bban\b|roda|velg|pelek|shock|shockbreaker|shok|spooring|peredam|drag link|draklink/.test(text)) return 'ban';
  if (/\brem\b|master rem|minyak rem|central rem|setel rem/.test(text)) return 'rem';
  if (jenis === 'ELEKTRIKAL' || /lampu|aki|switch|wiper|spion/.test(text)) return 'elektrikal';
  if (jenis === 'AC' || /\bac\b/.test(text)) return 'ac';
  if (jenis === 'PERBAIKAN' || jenis === 'SERVIS_BERKALA' || jenis === 'TUNE_UP' || /service|servis|ganti|las|dongkrak|kopling/.test(text)) return 'service';
  return 'lainnya';
}

export interface ServiceCostSummary {
  total: number;
  count: number;
  buckets: Record<ServiceBucket, { amount: number; count: number }>;
}

export function buildServiceCostSummary(logs: readonly ServiceLogLike[]): ServiceCostSummary {
  const keys = Object.keys(SERVICE_BUCKET_LABELS) as ServiceBucket[];
  const buckets = Object.fromEntries(keys.map((k) => [k, { amount: 0, count: 0 }])) as ServiceCostSummary['buckets'];
  let total = 0;
  for (const log of logs) {
    const amount = Number(log?.biaya ?? 0) || 0;
    const b = classifyServiceCost(log);
    buckets[b] = { amount: buckets[b].amount + amount, count: buckets[b].count + 1 };
    total += amount;
  }
  return { total, count: logs.length, buckets };
}

export interface ServiceLogFilter {
  startDate?: string;
  endDate?: string;
  bucket?: ServiceBucket | '';
}

/** Date range (inclusive, YYYY-MM-DD) and cost-bucket filter, newest first. */
export function filterServiceLogs<T extends ServiceLogLike>(logs: readonly T[], f: ServiceLogFilter): T[] {
  return logs
    .filter((log) => {
      const date = String(log?.tanggal ?? '').slice(0, 10);
      if (f.startDate && date < f.startDate) return false;
      if (f.endDate && date > f.endDate) return false;
      if (f.bucket && classifyServiceCost(log) !== f.bucket) return false;
      return true;
    })
    .sort((a, b) => String(b?.tanggal ?? '').localeCompare(String(a?.tanggal ?? '')));
}

// Oil life

export interface OilLife {
  remainingKm: number;
  /** 0–100, share of the interval still left. */
  pct: number;
  overdue: boolean;
}

export function oilLife(lastChangeOdo: number, nextDueOdo: number, currentOdo: number): OilLife {
  const interval = nextDueOdo - lastChangeOdo;
  const remainingKm = nextDueOdo - currentOdo;
  const pct = interval > 0 ? Math.max(0, Math.min(100, (remainingKm / interval) * 100)) : 0;
  return { remainingKm, pct, overdue: remainingKm < 0 };
}

// Forms / URL

/** '' → null; non-numeric → null. */
export function numOrNull(v: string | null | undefined): number | null {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}

export function parseSection(raw: string | null | undefined): VehicleSection {
  return (VEHICLE_SECTIONS.find((s) => s.key === raw)?.key ?? DEFAULT_SECTION) as VehicleSection;
}

/** Message of an API error ({ error }) or the fallback. */
export function apiError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  if (typeof data?.error === 'string') return data.error;
  if (err instanceof Error && err.message && !('response' in err)) return err.message;
  return fallback;
}
