// Tipe & konstanta bersama untuk panel Pengajuan GA (servis kendaraan + pajak/STNK/KIR).
export type ReqStatus = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
export type Urgensi = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

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

export const REQ_STATUS_LABELS: Record<ReqStatus, string> = {
  SUBMITTED: 'Diajukan',
  APPROVED: 'Disetujui',
  REJECTED: 'Ditolak',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
};

export const REQ_STATUS_BADGE: Record<ReqStatus, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-teal-100 text-teal-700',
  REJECTED: 'bg-red-100 text-red-700',
  COMPLETED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500 line-through',
};

export const REQ_STATUS_FILTERS: ReqStatus[] = ['SUBMITTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'];

export const URGENSI_LABELS: Record<Urgensi, string> = {
  LOW: 'Rendah',
  MEDIUM: 'Normal',
  HIGH: 'Tinggi',
  URGENT: 'Mendesak',
};

export const URGENSI_BADGE: Record<Urgensi, string> = {
  LOW: 'bg-gray-100 text-gray-600',
  MEDIUM: 'bg-sky-100 text-sky-700',
  HIGH: 'bg-amber-100 text-amber-700',
  URGENT: 'bg-red-100 text-red-700',
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

export const reqFieldClass =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500';
export const reqLabelClass = 'block text-xs font-medium text-gray-600 mb-1';

export function apiErrorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string } } };
  return e?.response?.data?.error || fallback;
}
