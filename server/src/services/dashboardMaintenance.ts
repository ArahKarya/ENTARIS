/**
 * Maintenance dashboard. Definitions must match the GA pages:
 *  - Preventive schedule: overdue when nextDueAt < today's start (business TZ); due this week = today..+6 days.
 *  - Work order (OPEN/ASSIGNED/IN_PROGRESS): overdue when dueAt < now.
 *  - Tax/STNK/KIR and insurance (ACTIVE): expired before today's start, expiring within 30 days.
 *  - GA documents: gaDocumentList.deriveExpiryState.
 */
import { prisma } from '../lib/prisma';
import { businessUtcOffset, localDayRange } from '../utils/listQuery';
import { businessDate, deriveExpiryState, expiryWindow, type ExpiryWindow } from './gaDocumentList';
import { WO_ACTIVE_STATUSES } from './gaWorkOrderList';

const DAY_MS = 24 * 60 * 60 * 1000;
export const WEEK_DAYS = 7;
export const UPCOMING_LIMIT = 8;

export type MaintenanceKind = 'schedule' | 'workOrder' | 'vehicleTax' | 'vehicleInsurance' | 'document';
export type DueState = 'overdue' | 'today' | 'soon' | 'scheduled';

export interface MaintenanceAccess {
  maintenance: boolean;
  vehicle: boolean;
  documents: boolean;
}

export interface ScheduleRow { id: string; assetId: string; assetName: string; nextDueAt: Date; isActive: boolean }
export interface WorkOrderRow { id: string; code: string; title: string; assetName: string; status: string; dueAt: Date | null }
export interface VehicleTaxRow { id: string; assetId: string; assetName: string; type: string; dueDate: Date; status: string }
export interface InsuranceRow { id: string; assetId: string; assetName: string; provider: string; endDate: Date; status: string }
export interface DocumentRow { id: string; title: string; assetName: string | null; expiryDate: Date | null; status: string }

export interface MaintenanceInput {
  schedules: ScheduleRow[];
  workOrders: WorkOrderRow[];
  taxes: VehicleTaxRow[];
  insurances: InsuranceRow[];
  documents: DocumentRow[];
}

export interface UpcomingItem {
  key: string;
  kind: MaintenanceKind;
  kindLabel: string;
  title: string;
  assetName: string | null;
  dueAt: string;
  /** Whole days from today (negative = days late). */
  daysLeft: number;
  state: DueState;
  href: string;
}

export interface AttentionItem {
  key: string;
  tone: 'danger' | 'warning';
  title: string;
  detail: string;
  href: string;
}

export interface MaintenanceDashboard {
  access: MaintenanceAccess;
  kpi: { overdue: number; dueThisWeek: number; overdueSchedules: number; overdueWorkOrders: number; expired: number; expiring: number };
  attention: AttentionItem[];
  upcoming: UpcomingItem[];
}

const TAX_LABEL: Record<string, string> = {
  STNK_TAHUNAN: 'Pajak STNK',
  STNK_5_TAHUNAN: 'STNK 5 tahunan',
  KIR: 'KIR',
  PAJAK_KENDARAAN: 'Pajak kendaraan',
};

/** Start of today and the exclusive end of the week/expiry windows, in the business time zone. */
export function maintenanceBoundaries(now: Date, offset: string = businessUtcOffset()) {
  const todayStart = localDayRange(businessDate(now, offset), undefined, offset).gte as Date;
  const expiry: ExpiryWindow = expiryWindow(now, offset);
  return { todayStart, weekEnd: new Date(todayStart.getTime() + WEEK_DAYS * DAY_MS), expiry };
}

function stateOf(due: Date, todayStart: Date, overdue: boolean, weekEnd: Date): DueState {
  if (overdue) return 'overdue';
  if (due.getTime() < todayStart.getTime() + DAY_MS) return 'today';
  return due.getTime() < weekEnd.getTime() ? 'soon' : 'scheduled';
}

const daysFrom = (due: Date, todayStart: Date) => Math.floor((due.getTime() - todayStart.getTime()) / DAY_MS);

export function computeMaintenanceDashboard(
  input: MaintenanceInput,
  access: MaintenanceAccess,
  now: Date,
  offset: string = businessUtcOffset(),
): MaintenanceDashboard {
  const { todayStart, weekEnd, expiry } = maintenanceBoundaries(now, offset);
  const items: Array<UpcomingItem & { overdue: boolean; expiring: boolean }> = [];
  const push = (
    base: Pick<UpcomingItem, 'key' | 'kind' | 'kindLabel' | 'title' | 'assetName' | 'href'>,
    due: Date,
    overdue: boolean,
    expiring = false,
  ) => items.push({
    ...base,
    dueAt: due.toISOString(),
    daysLeft: daysFrom(due, todayStart),
    state: stateOf(due, todayStart, overdue, weekEnd),
    overdue,
    expiring,
  });

  if (access.maintenance) {
    for (const s of input.schedules) {
      if (!s.isActive) continue;
      push({ key: `sch-${s.id}`, kind: 'schedule', kindLabel: 'Jadwal preventif', title: 'Perawatan berkala', assetName: s.assetName, href: '/ga/maintenance?tab=schedules' },
        s.nextDueAt, s.nextDueAt.getTime() < todayStart.getTime());
    }
    for (const w of input.workOrders) {
      if (!w.dueAt || !(WO_ACTIVE_STATUSES as readonly string[]).includes(w.status)) continue;
      push({ key: `wo-${w.id}`, kind: 'workOrder', kindLabel: 'Work order', title: `${w.code} ${w.title}`, assetName: w.assetName, href: `/ga/maintenance?wo=${w.id}` },
        w.dueAt, w.dueAt.getTime() < now.getTime());
    }
  }
  if (access.vehicle) {
    for (const t of input.taxes) {
      if (t.status !== 'ACTIVE') continue;
      push({ key: `tax-${t.id}`, kind: 'vehicleTax', kindLabel: TAX_LABEL[t.type] ?? 'Pajak kendaraan', title: TAX_LABEL[t.type] ?? 'Pajak kendaraan', assetName: t.assetName, href: `/ga/vehicle?vehicle=${t.assetId}` },
        t.dueDate, t.dueDate.getTime() < expiry.gte.getTime(), t.dueDate.getTime() < expiry.lt.getTime());
    }
    for (const i of input.insurances) {
      if (i.status !== 'ACTIVE') continue;
      push({ key: `ins-${i.id}`, kind: 'vehicleInsurance', kindLabel: 'Asuransi kendaraan', title: `Asuransi ${i.provider}`, assetName: i.assetName, href: `/ga/vehicle?vehicle=${i.assetId}` },
        i.endDate, i.endDate.getTime() < expiry.gte.getTime(), i.endDate.getTime() < expiry.lt.getTime());
    }
  }
  if (access.documents) {
    for (const d of input.documents) {
      if (!d.expiryDate) continue;
      const st = deriveExpiryState(d.status, d.expiryDate, expiry);
      if (st !== 'expired' && st !== 'expiring') continue;
      push({ key: `doc-${d.id}`, kind: 'document', kindLabel: 'Dokumen', title: d.title, assetName: d.assetName, href: `/ga/documents?doc=${d.id}` },
        d.expiryDate, st === 'expired', true);
    }
  }

  items.sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const count = (pred: (i: (typeof items)[number]) => boolean) => items.filter(pred).length;
  const overdueSchedules = count((i) => i.kind === 'schedule' && i.overdue);
  const overdueWorkOrders = count((i) => i.kind === 'workOrder' && i.overdue);
  const expired = count((i) => (i.kind === 'vehicleTax' || i.kind === 'vehicleInsurance' || i.kind === 'document') && i.overdue);
  const expiring = count((i) => (i.kind === 'vehicleTax' || i.kind === 'vehicleInsurance' || i.kind === 'document') && !i.overdue && i.expiring);
  const dueThisWeek = count((i) => !i.overdue && i.daysLeft < WEEK_DAYS);

  const attention: AttentionItem[] = [];
  const addAttention = (key: string, tone: AttentionItem['tone'], n: number, title: string, detail: string, href: string) => {
    if (n > 0) attention.push({ key, tone, title, detail, href });
  };
  const oldest = (kinds: MaintenanceKind[]) => {
    const od = items.filter((i) => kinds.includes(i.kind) && i.overdue);
    return od.length ? Math.max(...od.map((i) => -i.daysLeft)) : 0;
  };
  addAttention('mt-schedule', 'danger', overdueSchedules, `${overdueSchedules} jadwal pemeliharaan terlambat`, `Terlama ${oldest(['schedule'])} hari`, '/ga/maintenance?tab=schedules');
  addAttention('mt-wo', 'danger', overdueWorkOrders, `${overdueWorkOrders} work order lewat target`, 'Masih terbuka setelah tanggal target', '/ga/maintenance');
  const vehExpired = count((i) => (i.kind === 'vehicleTax' || i.kind === 'vehicleInsurance') && i.overdue);
  const vehExpiring = count((i) => (i.kind === 'vehicleTax' || i.kind === 'vehicleInsurance') && !i.overdue && i.expiring);
  addAttention('mt-veh-expired', 'danger', vehExpired, `${vehExpired} pajak/asuransi kendaraan lewat masa berlaku`, `Terlama ${oldest(['vehicleTax', 'vehicleInsurance'])} hari`, '/ga/vehicle');
  addAttention('mt-veh-expiring', 'warning', vehExpiring, `${vehExpiring} pajak/asuransi kendaraan habis dalam 30 hari`, 'STNK, KIR, pajak, dan polis', '/ga/vehicle');
  const docExpired = count((i) => i.kind === 'document' && i.overdue);
  const docExpiring = count((i) => i.kind === 'document' && !i.overdue);
  addAttention('mt-doc-expired', 'danger', docExpired, `${docExpired} dokumen legal kedaluwarsa`, `Terlama ${oldest(['document'])} hari`, '/ga/documents');
  addAttention('mt-doc-expiring', 'warning', docExpiring, `${docExpiring} dokumen legal habis dalam 30 hari`, 'Segera perpanjang', '/ga/documents');

  const upcoming = items.slice(0, UPCOMING_LIMIT).map(({ overdue: _o, expiring: _e, ...rest }) => rest);
  return {
    access,
    kpi: { overdue: overdueSchedules + overdueWorkOrders + expired, dueThisWeek, overdueSchedules, overdueWorkOrders, expired, expiring },
    attention,
    upcoming,
  };
}

/** Load only the sources the caller may see, then compute. */
export async function loadMaintenanceDashboard(access: MaintenanceAccess, now: Date = new Date()): Promise<MaintenanceDashboard> {
  const horizon = new Date(now.getTime() + 400 * DAY_MS);
  const [schedules, workOrders, taxes, insurances, documents] = await Promise.all([
    access.maintenance
      ? prisma.gaMaintenanceSchedule.findMany({
        where: { isActive: true, nextDueAt: { lt: horizon } },
        select: { id: true, assetId: true, nextDueAt: true, isActive: true, asset: { select: { name: true } } },
        orderBy: { nextDueAt: 'asc' }, take: 500,
      })
      : [],
    access.maintenance
      ? prisma.gaWorkOrder.findMany({
        where: { status: { in: [...WO_ACTIVE_STATUSES] }, dueAt: { not: null } },
        select: { id: true, code: true, title: true, status: true, dueAt: true, asset: { select: { name: true } } },
        orderBy: { dueAt: 'asc' }, take: 500,
      })
      : [],
    access.vehicle
      ? prisma.gaVehicleTax.findMany({
        where: { status: 'ACTIVE', dueDate: { lt: horizon } },
        select: { id: true, assetId: true, type: true, dueDate: true, status: true, asset: { select: { name: true } } },
        orderBy: { dueDate: 'asc' }, take: 500,
      })
      : [],
    access.vehicle
      ? prisma.gaVehicleInsurance.findMany({
        where: { status: 'ACTIVE', endDate: { lt: horizon } },
        select: { id: true, assetId: true, provider: true, endDate: true, status: true, asset: { select: { name: true } } },
        orderBy: { endDate: 'asc' }, take: 500,
      })
      : [],
    access.documents
      ? prisma.gaDocument.findMany({
        where: { OR: [{ status: 'EXPIRED' }, { status: 'ACTIVE', expiryDate: { not: null, lt: horizon } }] },
        select: { id: true, title: true, status: true, expiryDate: true, asset: { select: { name: true } } },
        orderBy: { expiryDate: 'asc' }, take: 500,
      })
      : [],
  ]);
  return computeMaintenanceDashboard(
    {
      schedules: schedules.map((s) => ({ id: s.id, assetId: s.assetId, assetName: s.asset.name, nextDueAt: s.nextDueAt, isActive: s.isActive })),
      workOrders: workOrders.map((w) => ({ id: w.id, code: w.code, title: w.title, assetName: w.asset.name, status: w.status, dueAt: w.dueAt })),
      taxes: taxes.map((t) => ({ id: t.id, assetId: t.assetId, assetName: t.asset.name, type: t.type, dueDate: t.dueDate, status: t.status })),
      insurances: insurances.map((i) => ({ id: i.id, assetId: i.assetId, assetName: i.asset.name, provider: i.provider, endDate: i.endDate, status: i.status })),
      documents: documents.map((d) => ({ id: d.id, title: d.title, assetName: d.asset?.name ?? null, expiryDate: d.expiryDate, status: d.status })),
    },
    access,
    now,
  );
}
