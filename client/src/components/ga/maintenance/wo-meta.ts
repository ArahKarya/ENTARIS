/**
 * Types, labels and pure helpers for the Pemeliharaan page (GA work orders
 * and preventive schedules). Status labels come from lib/status (StatusBadge
 * docType 'ga_work_order'); priority and type labels live here.
 */
import type { StatusTone } from '@/lib/status';

export type WoStatus = 'OPEN' | 'ASSIGNED' | 'IN_PROGRESS' | 'DONE' | 'CLOSED' | 'CANCELLED';
export type WoPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type WoType = 'PREVENTIVE' | 'CORRECTIVE';
export type DueState = 'overdue' | 'dueSoon';

export const WO_STATUSES: readonly WoStatus[] = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'DONE', 'CLOSED', 'CANCELLED'];
export const WO_ACTIVE: ReadonlySet<WoStatus> = new Set<WoStatus>(['OPEN', 'ASSIGNED', 'IN_PROGRESS']);
/** Terminal: no lifecycle action, parts or photos any more. */
export const WO_LOCKED: ReadonlySet<WoStatus> = new Set<WoStatus>(['CLOSED', 'CANCELLED']);
/** Server pseudo status: OPEN + ASSIGNED + IN_PROGRESS. */
export const WO_STATUS_ACTIVE = 'ACTIVE';

export const PRIORITY_ORDER: readonly WoPriority[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];

export const PRIORITY_LABELS: Record<WoPriority, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Sedang',
  HIGH: 'Tinggi',
  URGENT: 'Mendesak',
};

export const PRIORITY_TONE: Record<WoPriority, StatusTone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

export const TYPE_LABELS: Record<WoType, string> = {
  CORRECTIVE: 'Korektif',
  PREVENTIVE: 'Preventif',
};

export const DUE_SOON_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

type Money = string | number | null | undefined;

export interface AssetRef {
  id: string;
  code: string;
  name: string;
}

export interface WorkOrderRow {
  id: string;
  code: string;
  title: string;
  status: WoStatus;
  priority: WoPriority;
  type: WoType;
  component?: string | null;
  reportedAt: string;
  dueAt: string | null;
  completedAt: string | null;
  assignedToId: string | null;
  totalCost: number;
  asset?: AssetRef | null;
  assignee?: { id: string; fullName: string | null } | null;
  _count?: { parts: number; photos: number };
}

export interface WorkOrderSummary {
  count: number;
  active: number;
  overdue: number;
  doneThisMonth: number;
  totalCost: number;
}

export interface ChecklistEntry {
  id: string;
  label: string;
  required?: boolean;
  done?: boolean;
  notes?: string | null;
}

export interface WorkOrderDetail extends Omit<WorkOrderRow, 'assignee' | '_count'> {
  reportedById: string | null;
  description: string | null;
  resolution: string | null;
  startedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  laborHours: Money;
  laborCost: Money;
  externalVendor: string | null;
  externalCost: Money;
  scheduleId: string | null;
  checklist: ChecklistEntry[] | null;
  parts: Array<{
    id: string;
    quantity: Money;
    unitCost: Money;
    inventoryItem?: { sku: string; name: string; uom: string } | null;
    fromLocation?: { code: string; name: string } | null;
  }>;
  photos: Array<{ id: string; filePath: string; type: 'BEFORE' | 'AFTER'; caption: string | null }>;
  materialRequests: Array<{ id: string; code: string; status: string; _count?: { items: number } }>;
}

export interface ScheduleRow {
  id: string;
  intervalDays: number | null;
  intervalHours: number | null;
  intervalKm: number | null;
  nextDueAt: string | null;
  notes: string | null;
  isActive: boolean;
  asset?: { id: string; code?: string; name?: string } | null;
}

/** Prefill for "Buat WO" from a due schedule. */
export interface WoPrefill {
  assetId: string;
  type: WoType;
  scheduleId: string;
  /** yyyy-mm-dd */
  dueAt: string;
}

export const toNum = (v: Money): number => {
  const n = typeof v === 'number' ? v : Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

/** Overdue / due within 7 days, for still-active work only. */
export function woDueState(wo: Pick<WorkOrderRow, 'status' | 'dueAt'>, now: Date = new Date()): DueState | null {
  if (!wo.dueAt || !WO_ACTIVE.has(wo.status)) return null;
  const due = new Date(wo.dueAt).getTime();
  if (Number.isNaN(due)) return null;
  if (due < now.getTime()) return 'overdue';
  if (due - now.getTime() < DUE_SOON_DAYS * DAY_MS) return 'dueSoon';
  return null;
}

/** Same rule for preventive schedules (inactive schedules never flag). */
export function scheduleDueState(s: Pick<ScheduleRow, 'isActive' | 'nextDueAt'>, now: Date = new Date()): DueState | null {
  if (!s.isActive || !s.nextDueAt) return null;
  return woDueState({ status: 'OPEN', dueAt: s.nextDueAt }, now);
}

export function intervalLabel(s: Pick<ScheduleRow, 'intervalDays' | 'intervalHours' | 'intervalKm'>): string {
  if (s.intervalDays) return `Setiap ${s.intervalDays} hari`;
  if (s.intervalHours) return `Setiap ${s.intervalHours} jam operasi`;
  if (s.intervalKm) return `Setiap ${s.intervalKm.toLocaleString('id-ID')} km`;
  return '-';
}

/** ISO/date string → yyyy-mm-dd for date inputs (UTC date part, as before). */
export const toDateInput = (v: string | null | undefined): string => (v ? new Date(v).toISOString().slice(0, 10) : '');

export const assetLabel = (a: { code?: string; name?: string } | null | undefined): string =>
  a ? [a.code, a.name].filter(Boolean).join(' — ') || '-' : '-';

/** Which lifecycle actions a work order allows (server rules in routes/ga/maintenance.ts). */
export function woActions(status: WoStatus) {
  return {
    assign: status === 'OPEN' || status === 'ASSIGNED',
    start: status === 'ASSIGNED',
    complete: status === 'ASSIGNED' || status === 'IN_PROGRESS',
    close: status === 'DONE',
    // Server refuses to cancel DONE as well as CLOSED / CANCELLED.
    cancel: WO_ACTIVE.has(status),
    addParts: !WO_LOCKED.has(status),
    requestMaterial: !WO_LOCKED.has(status),
  };
}

export const MAX_WO_PHOTOS = 6;

/** Photo upload: open WO, under the limit, and only the reporter or the technician (server rule). */
export function canUploadPhoto(
  wo: Pick<WorkOrderDetail, 'status' | 'reportedById' | 'assignedToId' | 'photos'>,
  userId: string | undefined,
): boolean {
  if (WO_LOCKED.has(wo.status) || wo.photos.length >= MAX_WO_PHOTOS || !userId) return false;
  return wo.reportedById === userId || wo.assignedToId === userId;
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: unknown } } };
  return typeof e?.response?.data?.error === 'string' ? e.response.data.error : fallback;
}
