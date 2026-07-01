// Tipe & konstanta bersama untuk modul GA Material Request (MR).
export type MrStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'FULFILLED' | 'CANCELLED';
export type ProcurementStatus = 'REQUESTED' | 'QUOTED' | 'ORDERED' | 'RECEIVED' | 'CANCELLED';

export const MR_STATUS_LABELS: Record<MrStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Diajukan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  FULFILLED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const MR_STATUS_BADGE: Record<MrStatus, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-teal-100 text-teal-700',
  REJECTED: 'bg-red-100 text-red-700',
  FULFILLED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500 line-through',
};

export const PROC_STATUS_LABELS: Record<ProcurementStatus, string> = {
  REQUESTED: 'Diminta',
  QUOTED: 'Penawaran',
  ORDERED: 'Dipesan',
  RECEIVED: 'Diterima',
  CANCELLED: 'Dibatalkan',
};

export const PROC_STATUS_BADGE: Record<ProcurementStatus, string> = {
  REQUESTED: 'bg-gray-100 text-gray-700',
  QUOTED: 'bg-amber-100 text-amber-700',
  ORDERED: 'bg-blue-100 text-blue-700',
  RECEIVED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500 line-through',
};

export const MR_STATUS_FILTERS: MrStatus[] = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'FULFILLED', 'CANCELLED'];

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
  createdAt: string;
  asset?: { id: string; code: string; name: string } | null;
  workOrder?: { id: string; code: string } | null;
  items: { id: string; itemName: string; quantity: string; uom: string; procurementStatus: ProcurementStatus }[];
  _count?: { items: number };
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
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  asset?: { id: string; code: string; name: string } | null;
  workOrder?: { id: string; code: string; title: string; status: string } | null;
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

export const mrFieldClass =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500';
export const mrLabelClass = 'block text-xs font-medium text-gray-600 mb-1';

/** Ekstrak pesan error dari respons Axios tanpa memakai `any`. */
export function apiErrorMessage(err: unknown, fallback: string): string {
  const resp = (err as { response?: { data?: { error?: string } } })?.response;
  return resp?.data?.error ?? fallback;
}

/** Body request generik untuk mutation (menghindari `any`). */
export type JsonBody = Record<string, unknown>;
