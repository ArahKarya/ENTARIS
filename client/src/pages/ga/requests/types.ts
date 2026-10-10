// Tipe & konstanta bersama untuk panel Pengajuan GA (servis kendaraan + pajak/STNK/KIR).
import type { StatusTone } from '@/lib/status';
import { labelMap } from '@/components/ga/eam-i18n';

/** URL filter keys of the Pengajuan tab. */
export const REQUEST_FILTER_KEYS = ['status', 'kind', 'urgensi'] as const;

export type ReqStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
export type Urgensi = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export const VEHICLE_SERVICE_TYPES = [
  'OLI', 'TUNE_UP', 'SERVIS_BERKALA', 'PERBAIKAN', 'GANTI_BAN', 'ELEKTRIKAL', 'AC', 'LAINNYA',
] as const;
export type ServiceType = (typeof VEHICLE_SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = labelMap(VEHICLE_SERVICE_TYPES, 'vehicle.serviceType');

export const VEHICLE_TAX_TYPES = ['STNK_TAHUNAN', 'STNK_5_TAHUNAN', 'KIR', 'PAJAK_KENDARAAN'] as const;
export type TaxType = (typeof VEHICLE_TAX_TYPES)[number];

export const TAX_TYPE_LABELS: Record<TaxType, string> = labelMap(VEHICLE_TAX_TYPES, 'vehicle.taxType');

/** Filter-chip labels; badges themselves come from lib/status via StatusBadge (same wording). */
export const REQ_STATUS_FILTERS: ReqStatus[] = ['SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'];

export const REQ_STATUS_LABELS: Record<ReqStatus, string> = labelMap(REQ_STATUS_FILTERS, 'gaRequests.status');

export const URGENSI_LABELS: Record<Urgensi, string> = labelMap(['LOW', 'MEDIUM', 'HIGH', 'URGENT'], 'gaRequests.urgency');

export const URGENSI_TONE: Record<Urgensi, StatusTone> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  URGENT: 'danger',
};

export interface AssetOpt {
  id: string;
  code: string;
  name: string;
  vehicleData?: { noPlat?: string | null } | null;
}

export interface ServiceRequestRow {
  id: string;
  status: ReqStatus;
  jenisService: ServiceType;
  deskripsi: string;
  odometer: number | null;
  urgensi: Urgensi;
  rejectedReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  asset?: { id: string; code: string; name: string } | null;
  workOrder?: { id: string; code: string; status: string } | null;
}

export interface TaxRequestRow {
  id: string;
  status: ReqStatus;
  type: TaxType;
  periodYear: number;
  estimatedAmount: string | number | null;
  dueDate: string;
  deskripsi: string | null;
  urgensi: Urgensi;
  rejectedReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  asset?: { id: string; code: string; name: string } | null;
  tax?: { id: string; status: string; periodYear: number } | null;
}

/** Baris tergabung untuk tabel monitoring. */
export interface UnifiedRow {
  kind: 'SERVICE' | 'TAX';
  id: string;
  status: ReqStatus;
  urgensi: Urgensi;
  jenis: string;
  keterangan: string;
  assetLabel: string;
  nominal: number | null;
  createdAt: string;
  tindakLanjut: string | null;
}

export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error || fallback;
}
