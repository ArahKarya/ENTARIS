// Tipe & konstanta bersama untuk panel Pengajuan GA (servis kendaraan + pajak/STNK/KIR).
import type { StatusTone } from '@/lib/status';

export type ReqStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
export type Urgensi = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

/** GA asset category "Kendaraan" — same id GaVehiclePage filters its fleet list by. */
export const VEHICLE_CATEGORY_ID = 'cmq7ja1dc000001lpil7negq7';

export const VEHICLE_SERVICE_TYPES = [
  'OLI', 'TUNE_UP', 'SERVIS_BERKALA', 'PERBAIKAN', 'GANTI_BAN', 'ELEKTRIKAL', 'AC', 'LAINNYA',
] as const;
export type ServiceType = (typeof VEHICLE_SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Record<ServiceType, string> = {
  OLI: 'Ganti Oli',
  TUNE_UP: 'Tune Up',
  SERVIS_BERKALA: 'Servis Berkala',
  PERBAIKAN: 'Perbaikan',
  GANTI_BAN: 'Ganti Ban',
  ELEKTRIKAL: 'Elektrikal',
  AC: 'AC',
  LAINNYA: 'Lainnya',
};

export const VEHICLE_TAX_TYPES = ['STNK_TAHUNAN', 'STNK_5_TAHUNAN', 'KIR', 'PAJAK_KENDARAAN'] as const;
export type TaxType = (typeof VEHICLE_TAX_TYPES)[number];

export const TAX_TYPE_LABELS: Record<TaxType, string> = {
  STNK_TAHUNAN: 'STNK Tahunan',
  STNK_5_TAHUNAN: 'STNK 5 Tahunan',
  KIR: 'KIR',
  PAJAK_KENDARAAN: 'Pajak Kendaraan',
};

/** Filter-chip labels; badges themselves come from lib/status via StatusBadge (same wording). */
export const REQ_STATUS_LABELS: Record<ReqStatus, string> = {
  SUBMITTED: 'Diajukan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const REQ_STATUS_FILTERS: ReqStatus[] = ['SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'];

export const URGENSI_LABELS: Record<Urgensi, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Normal',
  HIGH: 'Tinggi',
  URGENT: 'Mendesak',
};

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
