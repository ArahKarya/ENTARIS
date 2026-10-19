/**
 * Fleet list, filtered and paged in memory (fleets are small). Due state per obligation:
 * overdue (before today), dueSoon (within DUE_SOON_DAYS), ok, null (no active record).
 * Per tax type the latest ACTIVE record is current; a document group takes its worst state.
 */
import { firstString, parseSort, type ListPaging, type SortSpec } from '../utils/listQuery';
import type { DueBoundaries } from './projectGuaranteeList';

export const FLEET_DUE_STATES = ['overdue', 'dueSoon', 'ok'] as const;
export type FleetDueState = (typeof FLEET_DUE_STATES)[number];

/** Obligations tracked per vehicle. */
export const FLEET_DOCS = ['tax', 'stnk', 'kir', 'insurance', 'inspection'] as const;
export type FleetDoc = (typeof FLEET_DOCS)[number];

/** Tax types per document group (annual tax is filed as either type). */
export const TAX_TYPE_GROUP: Readonly<Record<string, Exclude<FleetDoc, 'insurance' | 'inspection'>>> = {
  STNK_TAHUNAN: 'tax',
  PAJAK_KENDARAAN: 'tax',
  STNK_5_TAHUNAN: 'stnk',
  KIR: 'kir',
};

export const ASSET_STATUSES = ['ACTIVE', 'IN_REPAIR', 'RETIRED', 'LOST'] as const;

/** `due` filter: a specific state, or `attention` = overdue or dueSoon. */
export const FLEET_DUE_FILTERS = ['overdue', 'dueSoon', 'attention'] as const;
export type FleetDueFilter = (typeof FLEET_DUE_FILTERS)[number];

export const FLEET_SORT_FIELDS = ['code', 'noPlat', 'name', 'odometer', 'nextDue', 'status'] as const;
export type FleetSortField = (typeof FLEET_SORT_FIELDS)[number];
export const DEFAULT_FLEET_SORT: SortSpec<FleetSortField> = { field: 'code', dir: 'asc' };

export interface FleetDueInfo {
  dueDate: string | null;
  state: FleetDueState | null;
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
  /** Worst state over all obligations (overdue > dueSoon); null when none needs attention. */
  attention: Exclude<FleetDueState, 'ok'> | null;
  /** Earliest due date among obligations that need attention, else the earliest overall. */
  nextDueDate: string | null;
  openIncidentCount: number;
}

export interface FleetAssetSource {
  id: string;
  code: string;
  name: string;
  status: string;
  condition: string;
  picUserId: string | null;
  category: { name: string } | null;
  vehicleData: {
    noPlat: string | null;
    brand: string | null;
    tipe: string | null;
    tahunProduksi: number | null;
    jenisBBM: string | null;
    odometerTerakhir: number | null;
  } | null;
}

export interface FleetSources {
  assets: readonly FleetAssetSource[];
  /** ACTIVE taxes only. */
  taxes: ReadonlyArray<{ assetId: string; type: string; dueDate: Date }>;
  /** ACTIVE insurances only. */
  insurances: ReadonlyArray<{ assetId: string; endDate: Date }>;
  /** Inspections with a next due date, newest first (only the first per asset counts). */
  inspections: ReadonlyArray<{ assetId: string; nextDueDate: Date | null }>;
  openIncidents: ReadonlyArray<{ assetId: string }>;
  driverNames: ReadonlyMap<string, string | null>;
}

const SEVERITY: Record<FleetDueState, number> = { overdue: 2, dueSoon: 1, ok: 0 };

export function deriveFleetDueState(dueDate: Date | null | undefined, bounds: DueBoundaries): FleetDueState | null {
  if (!dueDate) return null;
  const t = dueDate.getTime();
  if (t < bounds.todayStart.getTime()) return 'overdue';
  if (t < bounds.soonEnd.getTime()) return 'dueSoon';
  return 'ok';
}

function worse(a: FleetDueInfo, b: FleetDueInfo): FleetDueInfo {
  if (!a.state) return b;
  if (!b.state) return a;
  if (SEVERITY[b.state] !== SEVERITY[a.state]) return SEVERITY[b.state] > SEVERITY[a.state] ? b : a;
  // Same state: the earlier date is the more urgent one.
  return (b.dueDate ?? '') < (a.dueDate ?? '') ? b : a;
}

const NONE: FleetDueInfo = { dueDate: null, state: null };
const info = (date: Date | null | undefined, bounds: DueBoundaries): FleetDueInfo =>
  date ? { dueDate: date.toISOString(), state: deriveFleetDueState(date, bounds) } : NONE;

function latestByKey<T>(rows: readonly T[], key: (r: T) => string, date: (r: T) => Date): Map<string, Date> {
  const out = new Map<string, Date>();
  for (const r of rows) {
    const k = key(r);
    const d = date(r);
    const cur = out.get(k);
    if (!cur || d > cur) out.set(k, d);
  }
  return out;
}

/** Builds one row per asset from batch-loaded sources (no per-asset queries). */
export function buildFleetRows(src: FleetSources, bounds: DueBoundaries): FleetRow[] {
  // Latest ACTIVE record per (asset, tax type) = current coverage of that type.
  const latestTax = latestByKey(src.taxes, (t) => `${t.assetId}|${t.type}`, (t) => t.dueDate);
  const taxDue = new Map<string, Partial<Record<FleetDoc, FleetDueInfo>>>();
  for (const [k, date] of latestTax) {
    const [assetId, type] = k.split('|') as [string, string];
    const group = TAX_TYPE_GROUP[type];
    if (!group) continue;
    const perAsset = taxDue.get(assetId) ?? {};
    perAsset[group] = worse(perAsset[group] ?? NONE, info(date, bounds));
    taxDue.set(assetId, perAsset);
  }
  const latestInsurance = latestByKey(src.insurances, (i) => i.assetId, (i) => i.endDate);
  const latestInspection = new Map<string, Date>();
  for (const insp of src.inspections) {
    if (!latestInspection.has(insp.assetId) && insp.nextDueDate) latestInspection.set(insp.assetId, insp.nextDueDate);
  }
  const incidents = new Map<string, number>();
  for (const i of src.openIncidents) incidents.set(i.assetId, (incidents.get(i.assetId) ?? 0) + 1);

  return src.assets.map((a) => {
    const t = taxDue.get(a.id) ?? {};
    const due: Record<FleetDoc, FleetDueInfo> = {
      tax: t.tax ?? NONE,
      stnk: t.stnk ?? NONE,
      kir: t.kir ?? NONE,
      insurance: info(latestInsurance.get(a.id), bounds),
      inspection: info(latestInspection.get(a.id), bounds),
    };
    const worst = FLEET_DOCS.reduce<FleetDueInfo>((acc, d) => worse(acc, due[d]), NONE);
    const attention = worst.state === 'overdue' || worst.state === 'dueSoon' ? worst.state : null;
    const dates = FLEET_DOCS.map((d) => due[d].dueDate).filter((d): d is string => !!d).sort();
    const v = a.vehicleData;
    return {
      id: a.id,
      code: a.code,
      name: a.name,
      status: a.status,
      condition: a.condition,
      categoryName: a.category?.name ?? null,
      noPlat: v?.noPlat ?? null,
      brand: v?.brand ?? null,
      tipe: v?.tipe ?? null,
      tahunProduksi: v?.tahunProduksi ?? null,
      jenisBBM: v?.jenisBBM ?? null,
      odometer: v?.odometerTerakhir ?? null,
      driver: a.picUserId ? { id: a.picUserId, fullName: src.driverNames.get(a.picUserId) ?? null } : null,
      due,
      attention,
      nextDueDate: attention ? worst.dueDate : (dates[0] ?? null),
      openIncidentCount: incidents.get(a.id) ?? 0,
    };
  });
}

export interface FleetFilters {
  /** Single vehicle (detail header). */
  id?: string;
  search?: string;
  status?: string;
  due?: FleetDueFilter;
  doc?: FleetDoc;
}

export type FleetFilterResult = { ok: true; filters: FleetFilters } | { ok: false; error: string };

/** Validates the query params; unknown values are rejected (400), absent ones ignored. */
export function parseFleetFilters(query: Record<string, unknown>): FleetFilterResult {
  const id = firstString(query.id);
  const search = firstString(query.search ?? query.q);
  const status = firstString(query.status);
  const due = firstString(query.due);
  const doc = firstString(query.doc);
  if (status && !(ASSET_STATUSES as readonly string[]).includes(status)) return { ok: false, error: 'Status tidak valid.' };
  if (due && !(FLEET_DUE_FILTERS as readonly string[]).includes(due)) return { ok: false, error: 'Filter jatuh tempo tidak valid.' };
  if (doc && !(FLEET_DOCS as readonly string[]).includes(doc)) return { ok: false, error: 'Jenis dokumen tidak valid.' };
  return {
    ok: true,
    filters: {
      ...(id ? { id } : {}),
      search,
      status,
      due: due as FleetDueFilter | undefined,
      doc: doc as FleetDoc | undefined,
    },
  };
}

function matchesDue(row: FleetRow, due: FleetDueFilter | undefined, doc: FleetDoc | undefined): boolean {
  if (!due && !doc) return true;
  const states = (doc ? [row.due[doc]] : FLEET_DOCS.map((d) => row.due[d])).map((i) => i.state);
  if (!due) return states.some((s) => s !== null); // doc only: has an active record of that kind
  if (due === 'attention') return states.some((s) => s === 'overdue' || s === 'dueSoon');
  return states.some((s) => s === due);
}

export function filterFleetRows(rows: readonly FleetRow[], f: FleetFilters): FleetRow[] {
  const q = f.search?.toLowerCase();
  return rows.filter((r) => {
    if (f.id && r.id !== f.id) return false;
    if (f.status && r.status !== f.status) return false;
    if (q) {
      const hay = [r.code, r.name, r.noPlat, r.brand, r.tipe, r.driver?.fullName]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return matchesDue(r, f.due, f.doc);
  });
}

export function parseFleetSort(value: unknown): SortSpec<FleetSortField> {
  return parseSort(value, FLEET_SORT_FIELDS, DEFAULT_FLEET_SORT);
}

/** Sort with nulls last in both directions; ties fall back to the asset code. */
export function sortFleetRows(rows: readonly FleetRow[], sort: SortSpec<FleetSortField>): FleetRow[] {
  const key = (r: FleetRow): string | number | null => {
    switch (sort.field) {
      case 'noPlat':
        return r.noPlat?.toUpperCase() ?? null;
      case 'name':
        return r.name.toLowerCase();
      case 'odometer':
        return r.odometer;
      case 'nextDue':
        return r.nextDueDate;
      case 'status':
        return r.status;
      default:
        return r.code;
    }
  };
  const dir = sort.dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka === null && kb !== null) return 1;
    if (kb === null && ka !== null) return -1;
    if (ka !== null && kb !== null && ka !== kb) return (ka < kb ? -1 : 1) * dir;
    return a.code.localeCompare(b.code);
  });
}

export function pageFleetRows(rows: readonly FleetRow[], paging: ListPaging): FleetRow[] {
  return rows.slice(paging.skip, paging.skip + paging.limit);
}
