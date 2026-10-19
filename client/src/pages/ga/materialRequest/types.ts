// Types & constants for the GA Material Request (MR) module. Status labels and
// tones come from lib/status (StatusBadge docType 'ga_material_request').
import { labelMap } from '@/components/ga/eam-i18n';

export type MrStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'FULFILLED' | 'PAID' | 'CANCELLED';
export type ProcurementStatus = 'REQUESTED' | 'QUOTED' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';

export const MR_STATUS_FILTERS: MrStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'FULFILLED', 'PAID', 'CANCELLED'];

/** Procurement status options for the per-item editor (RECEIVED is set by "Terima barang"). */
export const PROC_STATUS_LABELS: Record<ProcurementStatus, string> = labelMap(
  ['REQUESTED', 'QUOTED', 'ORDERED', 'RECEIVED', 'CANCELLED'],
  'materialRequest.procurementStatus',
);
export const PROC_STATUS_EDITABLE: ProcurementStatus[] = ['REQUESTED', 'QUOTED', 'ORDERED', 'CANCELLED'];

export interface MrItemDraft {
  inventoryItemId: string | null;
  itemName: string;
  sku: string;
  uom: string;
  quantity: number;
  notes: string;
}

export interface MrListRow {
  id: string;
  code: string;
  status: MrStatus;
  machineTarget: string | null;
  notes?: string | null;
  createdAt: string;
  requestedAt?: string;
  asset?: { id: string; code: string; name: string } | null;
  workOrder?: { id: string; code: string } | null;
  items: { id: string; itemName: string; quantity: string; uom: string; procurementStatus: ProcurementStatus }[];
  _count?: { items: number };
  /** Paged mode only. */
  requester?: { id: string; fullName: string | null } | null;
}

export interface MrSummary {
  total: number;
  byStatus: Record<MrStatus, number>;
}

export interface MrItemDetail {
  id: string;
  inventoryItemId: string | null;
  itemName: string;
  sku: string | null;
  uom: string;
  quantity: string;
  notes: string | null;
  vendorName: string | null;
  unitPrice: string;
  poNumber: string | null;
  procurementStatus: ProcurementStatus;
  receivedQty: string;
  receivedAt: string | null;
  receivedIntoLocationId: string | null;
  inventoryItem?: { id: string; sku: string; name: string; uom: string } | null;
  receivedIntoLocation?: { id: string; code: string; name: string } | null;
}

export interface MrDetail {
  id: string;
  code: string;
  status: MrStatus;
  workOrderId: string | null;
  assetId: string | null;
  machineTarget: string | null;
  notes: string | null;
  requestedById: string;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  paidAt?: string | null;
  paidAmount?: string | number | null;
  journalEntryId?: string | null;
  asset?: { id: string; code: string; name: string } | null;
  workOrder?: { id: string; code: string; title: string; status: string } | null;
  requester?: { id: string; fullName: string | null } | null;
  items: MrItemDetail[];
}

export interface InventoryItemOpt {
  id: string;
  sku: string;
  name: string;
  uom: string;
}
export interface LocationOpt {
  id: string;
  code: string;
  name: string;
}
export interface CategoryOpt {
  id: string;
  code: string;
  name: string;
}

/** Lifecycle actions an MR status allows (server rules in routes/ga/materialRequest.ts). */
export function mrActions(status: MrStatus) {
  return {
    submit: status === 'DRAFT',
    approve: status === 'SUBMITTED',
    reject: status === 'SUBMITTED',
    cancel: status === 'DRAFT' || status === 'SUBMITTED' || status === 'APPROVED',
    receive: status === 'APPROVED',
  };
}

/** Procurement editing is closed for received/cancelled items and for rejected/cancelled MRs (server rule). */
export function isItemLocked(item: Pick<MrItemDetail, 'procurementStatus'>, mrStatus: MrStatus): boolean {
  return (
    item.procurementStatus === 'RECEIVED' ||
    item.procurementStatus === 'CANCELLED' ||
    mrStatus === 'REJECTED' ||
    mrStatus === 'CANCELLED'
  );
}

/** Estimated value: Σ unit price × qty (prices are entered during procurement). */
export function estimatedTotal(items: ReadonlyArray<Pick<MrItemDetail, 'unitPrice' | 'quantity'>>): number {
  return items.reduce((sum, it) => sum + (Number(it.unitPrice) || 0) * (Number(it.quantity) || 0), 0);
}

/** Ekstrak pesan error dari respons Axios tanpa memakai `any`. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const resp = (err as { response?: { data?: { error?: unknown } } })?.response;
  return typeof resp?.data?.error === 'string' ? resp.data.error : fallback;
}

/** Body request generik untuk mutation (menghindari `any`). */
export type JsonBody = Record<string, unknown>;
