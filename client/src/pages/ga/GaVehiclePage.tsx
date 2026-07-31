// GA Kendaraan — fleet management lengkap: pilih aset, kelola data
// kendaraan (1-1), driver assignment, pajak/STNK/KIR, asuransi, log BBM,
// inspeksi berkala, insiden/kecelakaan, riwayat service, dan pengajuan
// service (approval flow). Dashboard armada (KPI cards) di atas.
import { useState, useMemo, useEffect, Fragment } from 'react';
import type { FormEvent, MouseEvent as ReactMouseEvent } from 'react';
import {
  Search, Car, Loader2, Save, Plus, Trash2, Wrench, ClipboardList,
  Check, X, XCircle, UserCog, FileWarning, ShieldCheck, Fuel,
  ClipboardCheck, TriangleAlert, TrendingUp, Users, QrCode,
  FileCheck2, Pencil, BarChart3, ChevronDown, ChevronRight,
  CalendarClock, Camera, FileDown,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { pdf } from '@react-pdf/renderer';
import api from '../../lib/api';
import { cn } from '../../lib/utils';
import { can, cap, getStoredUser } from '../../lib/permissions';
import { formatRupiah, formatDate } from '../../lib/formatters';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AssetPhotoSection } from '../../components/AssetPhotoSection';
import SearchableSelect from '../../components/SearchableSelect';
import GaAssetQRModal from '../../components/GaAssetQRModal';
import GaVehicleReportTab from '../../components/GaVehicleReportTab';
import InspectionDetailPDF from '../../lib/pdf/InspectionDetailPDF';
import type { InspectionPdfAsset, InspectionPdfPhoto } from '../../lib/pdf/InspectionDetailPDF';
import { useCompanyPDF } from '../../lib/pdf/useCompanyPDF';
import { toast } from 'sonner';

const FUEL_TYPES = ['BENSIN', 'SOLAR', 'PERTAMAX', 'PERTALITE', 'DEX', 'LPG', 'LISTRIK', 'HYBRID', 'LAINNYA'] as const;
const SERVICE_TYPES = ['OLI', 'TUNE_UP', 'SERVIS_BERKALA', 'PERBAIKAN', 'GANTI_BAN', 'ELEKTRIKAL', 'AC', 'LAINNYA'] as const;
const URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const TIRE_POSITIONS = [
  'DEPAN_KIRI', 'DEPAN_KANAN', 'BELAKANG_KIRI', 'BELAKANG_KANAN',
  'BELAKANG_KIRI_DALAM', 'BELAKANG_KIRI_LUAR', 'BELAKANG_KANAN_DALAM', 'BELAKANG_KANAN_LUAR', 'CADANGAN',
] as const;
const TIRE_POSITION_LABELS: Record<string, string> = {
  DEPAN_KIRI: 'Depan Kiri', DEPAN_KANAN: 'Depan Kanan',
  BELAKANG_KIRI: 'Belakang Kiri', BELAKANG_KANAN: 'Belakang Kanan',
  BELAKANG_KIRI_DALAM: 'Belakang Kiri Dalam', BELAKANG_KIRI_LUAR: 'Belakang Kiri Luar',
  BELAKANG_KANAN_DALAM: 'Belakang Kanan Dalam', BELAKANG_KANAN_LUAR: 'Belakang Kanan Luar',
  CADANGAN: 'Cadangan (Serep)',
};
const TIRE_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Aktif', ARCHIVED: 'Dilepas (Diarsipkan)', SPARE: 'Ban Serep (Stok)',
};
const TAX_TYPES = ['STNK_TAHUNAN', 'STNK_5_TAHUNAN', 'KIR', 'PAJAK_KENDARAAN'] as const;
const TAX_TYPE_LABELS: Record<string, string> = {
  STNK_TAHUNAN: 'STNK Tahunan', STNK_5_TAHUNAN: 'STNK 5 Tahunan', KIR: 'KIR', PAJAK_KENDARAAN: 'Pajak Kendaraan',
};
const TAX_STATUSES = ['ACTIVE', 'EXPIRED', 'IN_PROCESS'] as const;

const INSURANCE_TYPES = ['ALL_RISK', 'TLO', 'KECELAKAAN_DIRI', 'LAINNYA'] as const;
const INSURANCE_TYPE_LABELS: Record<string, string> = {
  ALL_RISK: 'All Risk', TLO: 'TLO (Total Loss Only)', KECELAKAAN_DIRI: 'Kecelakaan Diri', LAINNYA: 'Lainnya',
};
const INSURANCE_STATUSES = ['ACTIVE', 'EXPIRED', 'CANCELLED'] as const;

const INSPECTION_RESULT_LABELS: Record<string, string> = {
  BAIK: 'Baik', PERLU_PERHATIAN: 'Perlu Perhatian', TIDAK_LAYAK: 'Tidak Layak',
};
const INSPECTION_RESULT_BADGE: Record<string, string> = {
  BAIK: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  PERLU_PERHATIAN: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  TIDAK_LAYAK: 'bg-red-50 text-red-700 ring-1 ring-red-200',
};
const CHECKPOINT_LABELS: Record<string, string> = {
  // Format LAMA (12 item datar) — dipertahankan agar riwayat inspeksi lama
  // tetap tampil dengan label yang benar, bukan raw key.
  ban: 'Ban', rem: 'Rem', oli: 'Oli', lampu: 'Lampu', klakson: 'Klakson', wiper: 'Wiper',
  kaca_spion: 'Kaca Spion', sabuk_pengaman: 'Sabuk Pengaman', ac: 'AC', aki: 'Aki',
  radiator: 'Radiator', kelengkapan_p3k_apar: 'Kelengkapan P3K/APAR',
  // Format BARU (checklist detail per kategori).
  oli_mesin: 'Oli Mesin', oli_rem: 'Oli Rem', air_radiator: 'Air Radiator / Coolant',
  air_aki: 'Air Aki', air_wiper: 'Air Wiper',
  lampu_depan: 'Lampu Depan', lampu_belakang: 'Lampu Belakang', lampu_sein: 'Lampu Sein',
  lampu_rem: 'Lampu Rem', lampu_mundur: 'Lampu Mundur',
  rem_depan: 'Rem Depan', rem_belakang: 'Rem Belakang', rem_tangan: 'Rem Tangan',
  kemudi_suspensi: 'Kemudi / Suspensi',
  ban_depan: 'Ban Depan', ban_belakang: 'Ban Belakang', ban_serep: 'Ban Serep',
  tekanan_ban: 'Tekanan Ban', velg: 'Velg',
  p3k: 'P3K', apar: 'APAR', segitiga_pengaman: 'Segitiga Pengaman',
  dongkrak: 'Dongkrak', kunci_roda: 'Kunci Roda',
  kaca_depan: 'Kaca Depan', kaca_belakang: 'Kaca Belakang', body_cat: 'Body / Cat',
  dashboard_indikator: 'Dashboard / Indikator',
};

const CHECK_STATE_LABELS: Record<string, string> = {
  OK: 'OK', PERLU_PERHATIAN: 'Perhatian', RUSAK: 'Rusak',
};
const CHECK_STATE_BADGE: Record<string, string> = {
  OK: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  PERLU_PERHATIAN: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  RUSAK: 'bg-red-50 text-red-700 ring-1 ring-red-200',
};

const FUEL_LEVELS = ['KOSONG', 'SEPEREMPAT', 'SETENGAH', 'TIGA_PEREMPAT', 'PENUH'] as const;
const FUEL_LEVEL_LABELS: Record<string, string> = {
  KOSONG: 'Kosong (E)', SEPEREMPAT: 'Seperempat (1/4)', SETENGAH: 'Setengah (1/2)',
  TIGA_PEREMPAT: 'Tiga Perempat (3/4)', PENUH: 'Penuh (F)',
};

interface InspectionCategory { key: string; label: string; items: { key: string; label: string }[] }

/** Fallback struktur kategori kalau endpoint /inspection-categories belum tersedia. */
const INSPECTION_CATEGORY_FALLBACK: InspectionCategory[] = [
  { key: 'mesin', label: 'Mesin & Cairan', items: [
    { key: 'oli_mesin', label: 'Oli Mesin' }, { key: 'oli_rem', label: 'Oli Rem' },
    { key: 'air_radiator', label: 'Air Radiator / Coolant' }, { key: 'air_aki', label: 'Air Aki' },
    { key: 'air_wiper', label: 'Air Wiper' },
  ] },
  { key: 'kelistrikan', label: 'Kelistrikan', items: [
    { key: 'lampu_depan', label: 'Lampu Depan' }, { key: 'lampu_belakang', label: 'Lampu Belakang' },
    { key: 'lampu_sein', label: 'Lampu Sein' }, { key: 'lampu_rem', label: 'Lampu Rem' },
    { key: 'lampu_mundur', label: 'Lampu Mundur' }, { key: 'klakson', label: 'Klakson' },
  ] },
  { key: 'rem_kemudi', label: 'Rem & Kemudi', items: [
    { key: 'rem_depan', label: 'Rem Depan' }, { key: 'rem_belakang', label: 'Rem Belakang' },
    { key: 'rem_tangan', label: 'Rem Tangan' }, { key: 'kemudi_suspensi', label: 'Kemudi / Suspensi' },
  ] },
  { key: 'ban_roda', label: 'Ban & Roda', items: [
    { key: 'ban_depan', label: 'Ban Depan' }, { key: 'ban_belakang', label: 'Ban Belakang' },
    { key: 'ban_serep', label: 'Ban Serep' }, { key: 'tekanan_ban', label: 'Tekanan Ban' },
    { key: 'velg', label: 'Velg' },
  ] },
  { key: 'keselamatan', label: 'Keselamatan', items: [
    { key: 'sabuk_pengaman', label: 'Sabuk Pengaman' }, { key: 'p3k', label: 'P3K' },
    { key: 'apar', label: 'APAR' }, { key: 'segitiga_pengaman', label: 'Segitiga Pengaman' },
    { key: 'dongkrak', label: 'Dongkrak' }, { key: 'kunci_roda', label: 'Kunci Roda' },
  ] },
  { key: 'lain', label: 'Lain-lain', items: [
    { key: 'kaca_spion', label: 'Kaca Spion' }, { key: 'kaca_depan', label: 'Kaca Depan' },
    { key: 'kaca_belakang', label: 'Kaca Belakang' }, { key: 'wiper', label: 'Wiper' },
    { key: 'ac', label: 'AC' }, { key: 'body_cat', label: 'Body / Cat' },
    { key: 'dashboard_indikator', label: 'Dashboard / Indikator' },
  ] },
];

const INCIDENT_SEVERITIES = ['RINGAN', 'SEDANG', 'BERAT'] as const;
const INCIDENT_SEVERITY_BADGE: Record<string, string> = {
  RINGAN: 'bg-gray-100 text-gray-600 ring-1 ring-gray-200',
  SEDANG: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  BERAT: 'bg-red-50 text-red-700 ring-1 ring-red-200',
};
const INCIDENT_STATUSES = ['DILAPORKAN', 'DALAM_PROSES', 'SELESAI', 'KLAIM_ASURANSI'] as const;
const INCIDENT_STATUS_LABELS: Record<string, string> = {
  DILAPORKAN: 'Dilaporkan', DALAM_PROSES: 'Dalam Proses', SELESAI: 'Selesai', KLAIM_ASURANSI: 'Klaim Asuransi',
};
const INCIDENT_STATUS_BADGE: Record<string, string> = {
  DILAPORKAN: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  DALAM_PROSES: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
  SELESAI: 'bg-green-50 text-green-700 ring-1 ring-green-200',
  KLAIM_ASURANSI: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200',
};

const SR_STATUS_BADGE: Record<string, string> = {
  SUBMITTED: 'badge-yellow', APPROVED: 'badge-green', REJECTED: 'badge-red',
  CANCELLED: 'badge-gray', DONE: 'badge-blue',
};

interface Asset { id: string; code: string; name: string; category?: { name?: string } | null }
type Tab = 'data' | 'pajak' | 'asuransi' | 'bbm' | 'inspeksi' | 'ban' | 'oli' | 'insiden' | 'service' | 'report';

const numOrNull = (v: string): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

// Dipakai untuk deteksi jatuh tempo di badge tanggal (pajak/asuransi): merah
// kalau sudah lewat, kuning kalau <=30 hari lagi, abu kalau masih aman.

function classifyServiceCost(log: any): 'oli' | 'ban' | 'rem' | 'elektrikal' | 'ac' | 'service' | 'lainnya' {
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

function buildServiceCostSummary(logs: any[]) {
  const init = {
    total: 0, count: 0,
    oli: 0, ban: 0, rem: 0, elektrikal: 0, ac: 0, service: 0, lainnya: 0,
    oliCount: 0, banCount: 0, remCount: 0, elektrikalCount: 0, acCount: 0, serviceCount: 0, lainnyaCount: 0,
  };
  return logs.reduce((acc, log) => {
    const amount = Number(log?.biaya ?? 0) || 0;
    const bucket = classifyServiceCost(log);
    acc.total += amount;
    acc.count += 1;
    acc[bucket] += amount;
    acc[`${bucket}Count` as const] += 1;
    return acc;
  }, init);
}

function dueBadgeClass(dateStr: string | null | undefined, isActive: boolean): string {
  if (!dateStr || !isActive) return 'text-gray-600';
  const due = new Date(dateStr);
  const now = new Date();
  if (due < now) return 'text-red-600 font-semibold';
  if (due.getTime() - now.getTime() < 30 * 24 * 3600 * 1000) return 'text-amber-600 font-medium';
  return 'text-gray-600';
}

export const GaVehiclePage = () => {
  const queryClient = useQueryClient();
  const canEdit = can('ga_vehicle', 'edit');
  const canApprove = cap('approval.decide');

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('data');
  const [form, setForm] = useState<Record<string, string>>({});
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [showTaxModal, setShowTaxModal] = useState<'new' | any>(false);
  const [showInsuranceModal, setShowInsuranceModal] = useState<'new' | any>(false);
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showIncidentModal, setShowIncidentModal] = useState<{ id: string } | null | 'new'>(null);
  const [deleteLog, setDeleteLog] = useState<{ id: string; label: string } | null>(null);
  const [deleteTax, setDeleteTax] = useState<{ id: string; label: string } | null>(null);
  const [deleteInsurance, setDeleteInsurance] = useState<{ id: string; label: string } | null>(null);
  const [deleteFuel, setDeleteFuel] = useState<{ id: string; label: string } | null>(null);
  const [deleteInspection, setDeleteInspection] = useState<{ id: string; label: string } | null>(null);
  const [expandedInspection, setExpandedInspection] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showTireModal, setShowTireModal] = useState<'new' | any>(false);
  const [showOilModal, setShowOilModal] = useState(false);
  const [deleteTire, setDeleteTire] = useState<{ id: string; label: string } | null>(null);
  const [deleteOil, setDeleteOil] = useState<{ id: string; label: string } | null>(null);
  const [serviceStartDate, setServiceStartDate] = useState('');
  const [serviceEndDate, setServiceEndDate] = useState('');
  const [serviceTypeFilter, setServiceTypeFilter] = useState('ALL');
  const [serviceSortDir, setServiceSortDir] = useState<'desc' | 'asc'>('desc');

  // ── Fleet summary (KPI cards di atas, lintas-kendaraan) ─────────────
  const { data: fleetSummary } = useQuery({
    queryKey: ['ga-fleet-summary'],
    queryFn: async () => (await api.get('/ga/vehicle/fleet-summary', { params: { categoryId: 'cmq7ja1dc000001lpil7negq7' } })).data,
  });

  // ── Assets list ───────────────────────────────────────────────────
  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ['ga-assets', 'kendaraan'],
    queryFn: async () => (await api.get('/ga/assets', { params: { limit: 500, categoryId: 'cmq7ja1dc000001lpil7negq7' } })).data,
  });

  const filteredAssets = useMemo(() => {
    if (!search) return assets;
    const q = search.toLowerCase();
    return assets.filter((a) => a.code?.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q));
  }, [assets, search]);

  // Auto-select aset pertama begitu daftar termuat -- klik modul (mis. Kendaraan)
  // langsung tampilkan datanya tanpa perlu klik manual salah satu baris dulu.
  useEffect(() => {
    if (selectedId && filteredAssets.some((a) => a.id === selectedId)) return;
    if (filteredAssets.length > 0) setSelectedId(filteredAssets[0]!.id);
    else if (filteredAssets.length === 0) setSelectedId(null);
  }, [filteredAssets, selectedId]);

  const selectedAsset = assets.find((a) => a.id === selectedId) ?? null;

  // ── Asset detail (untuk driver/PIC + NBV fixed asset) ───────────────
  const { data: assetDetail } = useQuery({
    queryKey: ['ga-asset-detail', selectedId],
    queryFn: async () => (await api.get(`/ga/assets/${selectedId}`)).data,
    enabled: !!selectedId,
  });

  // ── Vehicle data ──────────────────────────────────────────────────
  const { data: vehicleData, isLoading: vdLoading } = useQuery({
    queryKey: ['ga-vehicle', selectedId],
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${selectedId}`)).data,
    enabled: !!selectedId,
  });

  useEffect(() => {
    const d = vehicleData ?? {};
    setForm({
      noPlat: d.noPlat ?? '', brand: d.brand ?? '', tipe: d.tipe ?? '',
      tahunProduksi: d.tahunProduksi != null ? String(d.tahunProduksi) : '',
      noMesin: d.noMesin ?? '', noRangka: d.noRangka ?? '', jenisBBM: d.jenisBBM ?? '',
      kapasitasTangki: d.kapasitasTangki != null ? String(d.kapasitasTangki) : '',
      warna: d.warna ?? '',
      odometerSaatBeli: d.odometerSaatBeli != null ? String(d.odometerSaatBeli) : '',
      odometerTerakhir: d.odometerTerakhir != null ? String(d.odometerTerakhir) : '',
      notes: d.notes ?? '',
    });
  }, [vehicleData, selectedId]);

  const saveData = useMutation({
    mutationFn: () => api.put(`/ga/vehicle/assets/${selectedId}`, {
      noPlat: form.noPlat || null, brand: form.brand || null, tipe: form.tipe || null,
      tahunProduksi: numOrNull(form.tahunProduksi), noMesin: form.noMesin || null,
      noRangka: form.noRangka || null, jenisBBM: form.jenisBBM || null,
      kapasitasTangki: numOrNull(form.kapasitasTangki), warna: form.warna || null,
      odometerSaatBeli: numOrNull(form.odometerSaatBeli),
      odometerTerakhir: numOrNull(form.odometerTerakhir), notes: form.notes || null,
    }),
    onSuccess: () => {
      toast.success('Data kendaraan disimpan.');
      queryClient.invalidateQueries({ queryKey: ['ga-vehicle', selectedId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal simpan data kendaraan.'),
  });

  // ── Driver assignment ────────────────────────────────────────────
  const assignDriver = useMutation({
    mutationFn: (picUserId: string | null) => api.patch(`/ga/vehicle/assets/${selectedId}/driver`, { picUserId }),
    onSuccess: () => {
      toast.success('Driver kendaraan diperbarui.');
      queryClient.invalidateQueries({ queryKey: ['ga-asset-detail', selectedId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal menugaskan driver.'),
  });

  // ── Service logs ──────────────────────────────────────────────────
  const { data: serviceLogs = [] } = useQuery<any[]>({
    queryKey: ['ga-vehicle-services', selectedId],
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${selectedId}/services`)).data,
    enabled: !!selectedId,
  });

  const filteredServiceLogs = useMemo(() => {
    return serviceLogs
      .filter((log) => {
        const date = String(log?.tanggal ?? '').slice(0, 10);
        if (serviceStartDate && date < serviceStartDate) return false;
        if (serviceEndDate && date > serviceEndDate) return false;
        if (serviceTypeFilter !== 'ALL' && classifyServiceCost(log) !== serviceTypeFilter) return false;
        return true;
      })
      .sort((a, b) => {
        const da = new Date(a?.tanggal ?? 0).getTime();
        const db = new Date(b?.tanggal ?? 0).getTime();
        return serviceSortDir === 'desc' ? db - da : da - db;
      });
  }, [serviceLogs, serviceStartDate, serviceEndDate, serviceTypeFilter, serviceSortDir]);

  const serviceCostSummary = useMemo(() => buildServiceCostSummary(filteredServiceLogs), [filteredServiceLogs]);

  const deleteLogMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${selectedId}/services/${id}`),
    onSuccess: () => {
      toast.success('Service log dihapus.');
      queryClient.invalidateQueries({ queryKey: ['ga-vehicle-services', selectedId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal hapus service log.'),
  });

  // ── Service requests ──────────────────────────────────────────────
  const { data: requests = [] } = useQuery<any[]>({
    queryKey: ['ga-vehicle-requests', selectedId],
    queryFn: async () => (await api.get('/ga/vehicle/service-requests', { params: { assetId: selectedId } })).data,
    enabled: !!selectedId,
  });

  const invalidateRequests = () =>
    queryClient.invalidateQueries({ queryKey: ['ga-vehicle-requests', selectedId] });

  const approveReq = useMutation({
    mutationFn: (id: string) => api.patch(`/ga/vehicle/service-requests/${id}/approve`),
    onSuccess: () => { toast.success('Pengajuan disetujui.'); invalidateRequests(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal approve.'),
  });
  const rejectReq = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch(`/ga/vehicle/service-requests/${id}/reject`, { reason }),
    onSuccess: () => { toast.success('Pengajuan ditolak.'); invalidateRequests(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal reject.'),
  });

  // ── Pajak / STNK / KIR ───────────────────────────────────────────
  const { data: taxes = [] } = useQuery<any[]>({
    queryKey: ['ga-vehicle-taxes', selectedId],
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${selectedId}/taxes`)).data,
    enabled: !!selectedId,
  });
  const deleteTaxMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${selectedId}/taxes/${id}`),
    onSuccess: () => { toast.success('Data pajak dihapus.'); queryClient.invalidateQueries({ queryKey: ['ga-vehicle-taxes', selectedId] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal hapus data pajak.'),
  });

  // ── Asuransi ──────────────────────────────────────────────────────
  const { data: insurances = [] } = useQuery<any[]>({
    queryKey: ['ga-vehicle-insurances', selectedId],
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${selectedId}/insurances`)).data,
    enabled: !!selectedId,
  });
  const deleteInsuranceMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${selectedId}/insurances/${id}`),
    onSuccess: () => { toast.success('Data asuransi dihapus.'); queryClient.invalidateQueries({ queryKey: ['ga-vehicle-insurances', selectedId] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal hapus data asuransi.'),
  });

  // ── Log BBM ───────────────────────────────────────────────────────
  const { data: fuelLogs = [] } = useQuery<any[]>({
    queryKey: ['ga-vehicle-fuel', selectedId],
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${selectedId}/fuel-logs`)).data,
    enabled: !!selectedId,
  });
  const deleteFuelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${selectedId}/fuel-logs/${id}`),
    onSuccess: () => { toast.success('Log BBM dihapus.'); queryClient.invalidateQueries({ queryKey: ['ga-vehicle-fuel', selectedId] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal hapus log BBM.'),
  });

  // ── Inspeksi ──────────────────────────────────────────────────────
  const { data: inspections = [] } = useQuery<any[]>({
    queryKey: ['ga-vehicle-inspections', selectedId],
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${selectedId}/inspections`)).data,
    enabled: !!selectedId,
  });
  const deleteInspectionMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${selectedId}/inspections/${id}`),
    onSuccess: () => { toast.success('Data inspeksi dihapus.'); queryClient.invalidateQueries({ queryKey: ['ga-vehicle-inspections', selectedId] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal hapus data inspeksi.'),
  });

  // Jadwal inspeksi berikutnya = nextDueDate dari inspeksi TERBARU kendaraan ini.
  // Pola status sama dgn pajak/asuransi: TERLAMBAT / <=30 hari lagi / aman.
  const nextInspection = useMemo(() => {
    const latest = inspections[0];
    if (!latest?.nextDueDate) return null;
    const due = new Date(latest.nextDueDate);
    if (Number.isNaN(due.getTime())) return null;
    const diffMs = due.getTime() - Date.now();
    const days = Math.abs(Math.round(diffMs / (24 * 3600 * 1000)));
    return {
      due: latest.nextDueDate as string,
      days,
      overdue: diffMs < 0,
      dueSoon: diffMs >= 0 && diffMs <= 30 * 24 * 3600 * 1000,
    };
  }, [inspections]);
  const deleteTireMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${selectedId}/tires/${id}`),
    onSuccess: () => { toast.success('Data ban dihapus.'); queryClient.invalidateQueries({ queryKey: ['ga-vehicle-tires', selectedId] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal hapus data ban.'),
  });
  const deleteOilMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${selectedId}/oil-logs/${id}`),
    onSuccess: () => { toast.success('Log oli dihapus.'); queryClient.invalidateQueries({ queryKey: ['ga-vehicle-oil', selectedId] }); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal hapus log oli.'),
  });

  // ── Insiden ───────────────────────────────────────────────────────
  const { data: incidents = [] } = useQuery<any[]>({
    queryKey: ['ga-vehicle-incidents', selectedId],
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${selectedId}/incidents`)).data,
    enabled: !!selectedId,
  });

  const TABS: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'data', label: 'Data & Driver', icon: <Car size={14} /> },
    { key: 'pajak', label: 'Pajak & STNK', icon: <FileWarning size={14} /> },
    { key: 'asuransi', label: 'Asuransi', icon: <ShieldCheck size={14} /> },
    { key: 'bbm', label: 'BBM', icon: <Fuel size={14} /> },
    { key: 'inspeksi', label: 'Inspeksi', icon: <ClipboardCheck size={14} /> },
    { key: 'ban', label: 'Ban', icon: <Wrench size={14} /> },
    { key: 'oli', label: 'Oli', icon: <Fuel size={14} /> },
    { key: 'insiden', label: 'Insiden', icon: <TriangleAlert size={14} /> },
    { key: 'service', label: 'Service Lain', icon: <Wrench size={14} /> },
    { key: 'report', label: 'Report', icon: <BarChart3 size={14} /> },
  ];

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Kendaraan</h1>
        <p className="text-sm text-gray-500 mt-0.5">Manajemen armada: data kendaraan, driver, pajak, asuransi, BBM, inspeksi, insiden, dan service.</p>
      </div>

      {/* Dashboard armada -- KPI cards lintas-kendaraan */}
      {fleetSummary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <FleetKpi icon={<Car size={16} className="text-blue-600" />} iconBg="bg-blue-50" label="Total Armada" value={fleetSummary.totalVehicles} />
          <FleetKpi icon={<FileWarning size={16} className="text-red-600" />} iconBg="bg-red-50" label="Pajak Jatuh Tempo" value={fleetSummary.taxExpired + fleetSummary.taxExpiringSoon} sub={`${fleetSummary.taxExpired} lewat, ${fleetSummary.taxExpiringSoon} <30 hari`} />
          <FleetKpi icon={<ShieldCheck size={16} className="text-amber-600" />} iconBg="bg-amber-50" label="Asuransi Jatuh Tempo" value={fleetSummary.insuranceExpired + fleetSummary.insuranceExpiringSoon} sub={`${fleetSummary.insuranceExpired} lewat, ${fleetSummary.insuranceExpiringSoon} <30 hari`} />
          <FleetKpi icon={<TriangleAlert size={16} className="text-orange-600" />} iconBg="bg-orange-50" label="Insiden Terbuka" value={fleetSummary.openIncidents} />
          <FleetKpi
            icon={<ClipboardCheck size={16} className="text-emerald-600" />} iconBg="bg-emerald-50"
            label="Inspeksi Jatuh Tempo"
            value={(fleetSummary.inspectionOverdue ?? 0) + (fleetSummary.inspectionDueSoon ?? 0)}
            sub={`${fleetSummary.inspectionOverdue ?? 0} lewat, ${fleetSummary.inspectionDueSoon ?? 0} <30 hari, ${fleetSummary.inspectionNeverDone ?? 0} belum pernah`}
          />
          <FleetKpi icon={<Wrench size={16} className="text-teal-600" />} iconBg="bg-teal-50" label="Biaya Service Bln Ini" value={formatRupiah(fleetSummary.serviceCostThisMonth)} isText />
          <FleetKpi icon={<Fuel size={16} className="text-purple-600" />} iconBg="bg-purple-50" label="Biaya BBM Bln Ini" value={formatRupiah(fleetSummary.fuelCostThisMonth)} isText />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-5">
        {/* Asset list */}
        <div className="card p-0 overflow-hidden h-fit">
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text" placeholder="Cari aset..." value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {assetsLoading ? (
              <div className="py-10 text-center text-gray-400">
                <Loader2 className="w-5 h-5 animate-spin mx-auto" />
              </div>
            ) : filteredAssets.length === 0 ? (
              <p className="py-10 text-center text-sm text-gray-400">Tidak ada aset.</p>
            ) : (
              filteredAssets.map((a) => (
                <button
                  key={a.id} onClick={() => setSelectedId(a.id)}
                  className={`w-full text-left px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                    selectedId === a.id ? 'bg-teal-50' : ''
                  }`}
                >
                  <span className="block font-mono text-xs text-gray-500">{a.code}</span>
                  <span className="block text-sm font-medium text-gray-800 truncate">{a.name}</span>
                  {a.category?.name && <span className="block text-[11px] text-gray-400">{a.category.name}</span>}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {!selectedAsset ? (
            <div className="card py-20 text-center text-gray-400">
              <Car className="w-10 h-10 mx-auto mb-2 text-gray-200" />
              <p className="text-sm">Pilih aset di kiri untuk melihat data kendaraan.</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex items-center gap-1 border-b border-gray-200 overflow-x-auto">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTab(t.key)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors',
                      tab === t.key ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-500 hover:text-gray-700',
                    )}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>

              <ServiceCostSummaryCards summary={serviceCostSummary} />

              {/* ── TAB: Data & Driver ── */}
              {tab === 'data' && (
                <>
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Car size={16} className="text-teal-600" /> Data Kendaraan — {selectedAsset.name}
                      </h2>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setShowQrModal(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-700" title="QR aset">
                          <QrCode size={14} /> QR Aset
                        </button>
                        {canEdit && (
                          <button onClick={() => saveData.mutate()} disabled={saveData.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700">
                            {saveData.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
                          </button>
                        )}
                      </div>
                    </div>
                    {vdLoading ? (
                      <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" /></div>
                    ) : (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <Field label="No. Plat" value={form.noPlat} onChange={(v) => setForm({ ...form, noPlat: v })} disabled={!canEdit} />
                        <Field label="Merek" value={form.brand} onChange={(v) => setForm({ ...form, brand: v })} disabled={!canEdit} />
                        <Field label="Tipe" value={form.tipe} onChange={(v) => setForm({ ...form, tipe: v })} disabled={!canEdit} />
                        <Field label="Tahun Produksi" type="number" value={form.tahunProduksi} onChange={(v) => setForm({ ...form, tahunProduksi: v })} disabled={!canEdit} />
                        <Field label="No. Mesin" value={form.noMesin} onChange={(v) => setForm({ ...form, noMesin: v })} disabled={!canEdit} />
                        <Field label="No. Rangka" value={form.noRangka} onChange={(v) => setForm({ ...form, noRangka: v })} disabled={!canEdit} />
                        <SelectField label="Jenis BBM" value={form.jenisBBM} onChange={(v) => setForm({ ...form, jenisBBM: v })} disabled={!canEdit} options={FUEL_TYPES} />
                        <Field label="Kapasitas Tangki (L)" type="number" value={form.kapasitasTangki} onChange={(v) => setForm({ ...form, kapasitasTangki: v })} disabled={!canEdit} />
                        <Field label="Warna" value={form.warna} onChange={(v) => setForm({ ...form, warna: v })} disabled={!canEdit} />
                        <Field label="Odometer Saat Beli" type="number" value={form.odometerSaatBeli} onChange={(v) => setForm({ ...form, odometerSaatBeli: v })} disabled={!canEdit} />
                        <Field label="Odometer Terakhir" type="number" value={form.odometerTerakhir} onChange={(v) => setForm({ ...form, odometerTerakhir: v })} disabled={!canEdit} />
                        <div className="col-span-2 md:col-span-3">
                          <Field label="Catatan" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} disabled={!canEdit} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Driver / PIC assignment */}
                  <div className="card p-5">
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                      <UserCog size={16} className="text-teal-600" /> Driver / Penanggung Jawab
                    </h2>
                    <DriverPicker
                      currentPic={assetDetail?.pic ?? null}
                      canEdit={canEdit}
                      onAssign={(userId) => assignDriver.mutate(userId)}
                      isPending={assignDriver.isPending}
                    />
                  </div>

                  {/* Nilai buku (NBV) -- kalau linked ke FixedAsset penyusutan */}
                  {assetDetail?.fixedAsset && (
                    <div className="card p-5">
                      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2 mb-3">
                        <TrendingUp size={16} className="text-teal-600" /> Nilai Buku (Penyusutan)
                      </h2>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div><p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Harga Perolehan</p><p className="font-semibold text-gray-800">{formatRupiah(Number(assetDetail.fixedAsset.acquisitionCost))}</p></div>
                        <div><p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Akumulasi Penyusutan</p><p className="font-semibold text-gray-800">{formatRupiah(Number(assetDetail.fixedAsset.accumulatedDepreciation))}</p></div>
                        <div><p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Nilai Buku (NBV)</p><p className="font-semibold text-teal-700">{formatRupiah(Number(assetDetail.fixedAsset.bookValue))}</p></div>
                        <div><p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Masa Manfaat</p><p className="font-semibold text-gray-800">{assetDetail.fixedAsset.usefulLifeMonths} bulan</p></div>
                      </div>
                    </div>
                  )}

                  <AssetPhotoSection assetId={selectedAsset.id} canEdit={canEdit} />
                </>
              )}

              {/* ── TAB: Pajak & STNK ── */}
              {tab === 'pajak' && (
                <div className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <FileWarning size={16} className="text-teal-600" /> Pajak & STNK/KIR
                    </h2>
                    {canEdit && (
                      <button onClick={() => setShowTaxModal('new')} className="btn-primary bg-teal-600 hover:bg-teal-700">
                        <Plus size={14} /> Tambah
                      </button>
                    )}
                  </div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Jenis</th><th className="text-center">Tahun</th><th>Jatuh Tempo</th>
                          <th className="text-right">Biaya</th><th className="text-center">Status</th>
                          <th className="text-center">Dokumen</th><th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {taxes.length === 0 ? (
                          <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">Belum ada data pajak/STNK.</td></tr>
                        ) : taxes.map((t: any) => (
                          <tr key={t.id}>
                            <td><span className="badge badge-blue">{TAX_TYPE_LABELS[t.type] ?? t.type}</span></td>
                            <td className="text-center text-gray-600">{t.periodYear}</td>
                            <td className={cn('whitespace-nowrap text-sm', dueBadgeClass(t.dueDate, t.status === 'ACTIVE'))}>{formatDate(t.dueDate)}</td>
                            <td className="text-right font-mono tabular-nums text-gray-900">{t.amount != null ? formatRupiah(Number(t.amount)) : '—'}</td>
                            <td className="text-center"><span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', t.status === 'ACTIVE' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : t.status === 'EXPIRED' ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200')}>{t.status}</span></td>
                            <td className="text-center">
                              {t.document ? (
                                <DocumentLink documentId={t.document.id} />
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            <td>
                              {canEdit && (
                                <div className="inline-flex items-center gap-0.5">
                                  <button onClick={() => setShowTaxModal(t)}
                                    className="p-1.5 hover:bg-teal-50 rounded text-gray-400 hover:text-teal-600 transition-colors" title="Edit">
                                    <Pencil size={15} />
                                  </button>
                                  <button onClick={() => setDeleteTax({ id: t.id, label: `${TAX_TYPE_LABELS[t.type]} ${t.periodYear}` })}
                                    className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors" title="Hapus">
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── TAB: Asuransi ── */}
              {tab === 'asuransi' && (
                <div className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <ShieldCheck size={16} className="text-teal-600" /> Asuransi Kendaraan
                    </h2>
                    {canEdit && (
                      <button onClick={() => setShowInsuranceModal('new')} className="btn-primary bg-teal-600 hover:bg-teal-700">
                        <Plus size={14} /> Tambah
                      </button>
                    )}
                  </div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Jenis</th><th>Penyedia</th><th>No. Polis</th><th>Berlaku Hingga</th>
                          <th className="text-right">Premi</th><th className="text-center">Status</th>
                          <th className="text-center">Dokumen</th><th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {insurances.length === 0 ? (
                          <tr><td colSpan={8} className="py-10 text-center text-sm text-gray-400">Belum ada data asuransi.</td></tr>
                        ) : insurances.map((ins: any) => (
                          <tr key={ins.id}>
                            <td><span className="badge badge-blue">{INSURANCE_TYPE_LABELS[ins.type] ?? ins.type}</span></td>
                            <td className="text-gray-700">{ins.provider}</td>
                            <td className="text-gray-600 font-mono text-xs">{ins.policyNumber ?? '—'}</td>
                            <td className={cn('whitespace-nowrap text-sm', dueBadgeClass(ins.endDate, ins.status === 'ACTIVE'))}>{formatDate(ins.endDate)}</td>
                            <td className="text-right font-mono tabular-nums text-gray-900">{ins.premium != null ? formatRupiah(Number(ins.premium)) : '—'}</td>
                            <td className="text-center"><span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', ins.status === 'ACTIVE' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200')}>{ins.status}</span></td>
                            <td className="text-center">
                              {ins.document ? (
                                <DocumentLink documentId={ins.document.id} />
                              ) : (
                                <span className="text-gray-300 text-xs">—</span>
                              )}
                            </td>
                            <td>
                              {canEdit && (
                                <div className="inline-flex items-center gap-0.5">
                                  <button onClick={() => setShowInsuranceModal(ins)}
                                    className="p-1.5 hover:bg-teal-50 rounded text-gray-400 hover:text-teal-600 transition-colors" title="Edit">
                                    <Pencil size={15} />
                                  </button>
                                  <button onClick={() => setDeleteInsurance({ id: ins.id, label: `${ins.provider} — ${ins.policyNumber ?? ''}` })}
                                    className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors" title="Hapus">
                                    <Trash2 size={15} />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── TAB: BBM ── */}
              {tab === 'bbm' && (
                <div className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <Fuel size={16} className="text-teal-600" /> Log Pengisian BBM
                    </h2>
                    {canEdit && (
                      <button onClick={() => setShowFuelModal(true)} className="btn-primary bg-teal-600 hover:bg-teal-700">
                        <Plus size={14} /> Tambah
                      </button>
                    )}
                  </div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Tanggal</th><th className="text-right">Odometer</th><th className="text-right">Liter</th>
                          <th className="text-right">Total Biaya</th><th>SPBU</th><th>Driver</th><th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {fuelLogs.length === 0 ? (
                          <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">Belum ada log BBM.</td></tr>
                        ) : fuelLogs.map((f: any) => (
                          <tr key={f.id}>
                            <td className="text-gray-500 whitespace-nowrap">{formatDate(f.tanggal)}</td>
                            <td className="text-right font-mono tabular-nums text-gray-600">{f.odometer != null ? f.odometer.toLocaleString('id-ID') : '—'}</td>
                            <td className="text-right font-mono tabular-nums text-gray-700">{Number(f.liters).toLocaleString('id-ID')} L</td>
                            <td className="text-right font-mono tabular-nums text-gray-900">{formatRupiah(Number(f.totalCost))}</td>
                            <td className="text-gray-600">{f.spbu ?? '—'}</td>
                            <td className="text-gray-600">{f.driverName ?? '—'}</td>
                            <td>
                              {canEdit && (
                                <button onClick={() => setDeleteFuel({ id: f.id, label: `${formatDate(f.tanggal)} — ${Number(f.liters)} L` })}
                                  className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors" title="Hapus">
                                  <Trash2 size={15} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── TAB: Ban ── */}
              {tab === 'ban' && (
                <TireMonitoringPanel
                  assetId={selectedId!}
                  canEdit={canEdit}
                  onAddClick={() => setShowTireModal('new')}
                  onEditClick={(tire) => setShowTireModal(tire)}
                  onDeleteClick={(tire) => setDeleteTire({ id: tire.id, label: `${tire.position} (SN: ${tire.serialNumber})` })}
                />
              )}

              {/* ── TAB: Oli ── */}
              {tab === 'oli' && (
                <OilMonitoringPanel
                  assetId={selectedId!}
                  canEdit={canEdit}
                  odometerTerakhir={vehicleData?.odometerTerakhir ?? 0}
                  onAddClick={() => setShowOilModal(true)}
                  onDeleteClick={(log) => setDeleteOil({ id: log.id, label: `${formatDate(log.tanggal)} — Odo ${log.odometer.toLocaleString('id-ID')}` })}
                />
              )}

              {/* ── TAB: Inspeksi ── */}
              {tab === 'inspeksi' && (
                <div className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <ClipboardCheck size={16} className="text-teal-600" /> Inspeksi Berkala
                    </h2>
                    {canEdit && (
                      <button onClick={() => setShowInspectionModal(true)} className="btn-primary bg-teal-600 hover:bg-teal-700">
                        <Plus size={14} /> Inspeksi Baru
                      </button>
                    )}
                  </div>

                  {/* Reminder jadwal inspeksi berikutnya (dari inspeksi terakhir) */}
                  {nextInspection && (
                    <div className={cn(
                      'flex items-center gap-2 px-4 py-2.5 text-xs border-b border-gray-100',
                      nextInspection.overdue ? 'bg-red-50 text-red-700'
                        : nextInspection.dueSoon ? 'bg-amber-50 text-amber-700' : 'bg-teal-50 text-teal-800',
                    )}>
                      <CalendarClock size={14} />
                      Jadwal inspeksi berikutnya: <strong>{formatDate(nextInspection.due)}</strong>
                      <span className="ml-1">
                        {nextInspection.overdue ? `— TERLAMBAT ${nextInspection.days} hari`
                          : nextInspection.dueSoon ? `— ${nextInspection.days} hari lagi` : `— ${nextInspection.days} hari lagi`}
                      </span>
                    </div>
                  )}

                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th className="w-8"></th>
                          <th>Tanggal</th><th className="text-right">Odometer</th><th className="text-center">Hasil</th>
                          <th>Inspektor</th><th className="text-center">BBM</th><th>Inspeksi Berikutnya</th>
                          <th className="text-center">Foto</th><th>Catatan</th><th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {inspections.length === 0 ? (
                          <tr><td colSpan={10} className="py-10 text-center text-sm text-gray-400">Belum ada data inspeksi.</td></tr>
                        ) : inspections.map((insp: any) => (
                          <Fragment key={insp.id}>
                            <tr className="cursor-pointer hover:bg-gray-50" onClick={() => setExpandedInspection(expandedInspection === insp.id ? null : insp.id)}>
                              <td className="text-gray-400">
                                {expandedInspection === insp.id ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                              </td>
                              <td className="text-gray-500 whitespace-nowrap">{formatDate(insp.tanggal)}</td>
                              <td className="text-right font-mono tabular-nums text-gray-600">{insp.odometer != null ? insp.odometer.toLocaleString('id-ID') : '—'}</td>
                              <td className="text-center"><span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', INSPECTION_RESULT_BADGE[insp.overallResult])}>{INSPECTION_RESULT_LABELS[insp.overallResult] ?? insp.overallResult}</span></td>
                              <td className="text-gray-600 text-sm">{insp.inspectorName || '—'}</td>
                              <td className="text-center text-gray-600 text-xs">{insp.fuelLevel ? (FUEL_LEVEL_LABELS[insp.fuelLevel] ?? insp.fuelLevel) : '—'}</td>
                              <td className={cn('whitespace-nowrap text-sm', dueBadgeClass(insp.nextDueDate, true))}>{insp.nextDueDate ? formatDate(insp.nextDueDate) : '—'}</td>
                              <td className="text-center text-xs text-gray-500">
                                {insp.photos?.length ? (
                                  <span className="inline-flex items-center gap-1 text-teal-600"><Camera size={13} /> {insp.photos.length}</span>
                                ) : '—'}
                              </td>
                              <td className="text-gray-600 text-sm max-w-xs truncate">{insp.notes || '—'}</td>
                              <td>
                                <div className="flex items-center justify-end gap-1">
                                  <InspectionPdfButton
                                    assetId={selectedId!}
                                    inspection={insp}
                                    asset={{
                                      code: selectedAsset.code,
                                      name: selectedAsset.name,
                                      noPlat: vehicleData?.noPlat ?? null,
                                      brand: vehicleData?.brand ?? null,
                                      tipe: vehicleData?.tipe ?? null,
                                      categoryName: selectedAsset.category?.name ?? null,
                                    }}
                                  />
                                  {canEdit && (
                                    <button onClick={(e) => { e.stopPropagation(); setDeleteInspection({ id: insp.id, label: formatDate(insp.tanggal) }); }}
                                      className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors" title="Hapus">
                                      <Trash2 size={15} />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                            {expandedInspection === insp.id && (
                              <tr>
                                <td colSpan={10} className="p-0">
                                  <InspectionDetail
                                    assetId={selectedId!}
                                    inspection={insp}
                                    canEdit={canEdit}
                                    onPhotoDeleted={() => queryClient.invalidateQueries({ queryKey: ['ga-vehicle-inspections', selectedId] })}
                                  />
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── TAB: Insiden ── */}
              {tab === 'insiden' && (
                <div className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <TriangleAlert size={16} className="text-teal-600" /> Insiden / Kecelakaan
                    </h2>
                    {canEdit && (
                      <button onClick={() => setShowIncidentModal('new')} className="btn-primary bg-teal-600 hover:bg-teal-700">
                        <Plus size={14} /> Laporkan
                      </button>
                    )}
                  </div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Tanggal</th><th>Deskripsi</th><th className="text-center">Tingkat</th>
                          <th className="text-center">Status</th><th className="text-right">Est. Biaya</th>
                        </tr>
                      </thead>
                      <tbody>
                        {incidents.length === 0 ? (
                          <tr><td colSpan={5} className="py-10 text-center text-sm text-gray-400">Belum ada insiden dilaporkan.</td></tr>
                        ) : incidents.map((inc: any) => (
                          <tr key={inc.id} className={canEdit ? 'cursor-pointer hover:bg-gray-50' : ''} onClick={() => canEdit && setShowIncidentModal({ id: inc.id })}>
                            <td className="text-gray-500 whitespace-nowrap">{formatDate(inc.tanggal)}</td>
                            <td className="text-gray-700 max-w-xs truncate">{inc.description}</td>
                            <td className="text-center"><span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', INCIDENT_SEVERITY_BADGE[inc.severity])}>{inc.severity}</span></td>
                            <td className="text-center"><span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', INCIDENT_STATUS_BADGE[inc.status])}>{INCIDENT_STATUS_LABELS[inc.status] ?? inc.status}</span></td>
                            <td className="text-right font-mono tabular-nums text-gray-900">{inc.estimatedCost != null ? formatRupiah(Number(inc.estimatedCost)) : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── TAB: Service (Riwayat + Pengajuan, gabungan seperti sebelumnya) ── */}
              {tab === 'service' && (
                <>
                  <div className="card p-0 overflow-hidden">
                    <div className="flex flex-col gap-3 p-4 border-b border-gray-100 lg:flex-row lg:items-center lg:justify-between">
                      <div>
                        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                          <Wrench size={16} className="text-teal-600" /> Riwayat Service
                        </h2>
                        <p className="text-xs text-gray-500 mt-1">
                          Filter periode + jenis service. Ringkasan biaya di atas ikut berubah sesuai filter ini.
                        </p>
                      </div>
                      {canEdit && (
                        <button onClick={() => setShowServiceModal(true)} className="btn-primary bg-teal-600 hover:bg-teal-700 w-fit">
                          <Plus size={14} /> Tambah
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 border-b border-gray-100 bg-gray-50/60">
                      <Field label="Dari Tanggal" type="date" value={serviceStartDate} onChange={setServiceStartDate} />
                      <Field label="Sampai Tanggal" type="date" value={serviceEndDate} onChange={setServiceEndDate} />
                      <SelectField label="Jenis Biaya" value={serviceTypeFilter} onChange={setServiceTypeFilter} options={['ALL', 'oli', 'ban', 'rem', 'elektrikal', 'ac', 'service', 'lainnya']} />
                      <SelectField label="Urut Tanggal" value={serviceSortDir} onChange={(v) => setServiceSortDir(v as 'desc' | 'asc')} options={['desc', 'asc']} />
                      <div className="flex items-end">
                        <button
                          type="button"
                          onClick={() => { setServiceStartDate(''); setServiceEndDate(''); setServiceTypeFilter('ALL'); setServiceSortDir('desc'); }}
                          className="w-full px-3 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50"
                        >
                          Reset Filter
                        </button>
                      </div>
                    </div>
                    <div className="px-4 py-2 text-xs text-gray-500 border-b border-gray-100">
                      Tampil {filteredServiceLogs.length} dari {serviceLogs.length} catatan · Total periode {formatRupiah(serviceCostSummary.total)}
                    </div>
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Tanggal</th><th>Jenis</th><th>Deskripsi</th>
                            <th className="text-right">Odometer</th><th>Bengkel</th>
                            <th className="text-right">Biaya</th><th className="w-10"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredServiceLogs.length === 0 ? (
                            <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">Belum ada riwayat service untuk filter ini.</td></tr>
                          ) : filteredServiceLogs.map((l) => (
                            <tr key={l.id}>
                              <td className="text-gray-500 whitespace-nowrap">{formatDate(l.tanggal)}</td>
                              <td><span className="badge badge-blue">{l.jenisService}</span></td>
                              <td className="text-gray-700">{l.deskripsi}</td>
                              <td className="text-right font-mono tabular-nums text-gray-600">{l.odometer != null ? l.odometer.toLocaleString('id-ID') : '—'}</td>
                              <td className="text-gray-600">{l.bengkel ?? '—'}</td>
                              <td className="text-right font-mono tabular-nums text-gray-900">{l.biaya != null ? formatRupiah(Number(l.biaya)) : '—'}</td>
                              <td>
                                {canEdit && (
                                  <button onClick={() => setDeleteLog({ id: l.id, label: `${formatDate(l.tanggal)} — ${l.deskripsi}` })}
                                    className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors" title="Hapus">
                                    <Trash2 size={15} />
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="card p-0 overflow-hidden">
                    <div className="flex items-center justify-between p-4 border-b border-gray-100">
                      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <ClipboardList size={16} className="text-teal-600" /> Pengajuan Service
                      </h2>
                      <button onClick={() => setShowRequestModal(true)} className="btn-primary bg-teal-600 hover:bg-teal-700">
                        <Plus size={14} /> Ajukan
                      </button>
                    </div>
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Jenis</th><th>Deskripsi</th><th className="text-center">Urgensi</th>
                            <th className="text-center">Status</th><th className="w-20"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {requests.length === 0 ? (
                            <tr><td colSpan={5} className="py-10 text-center text-sm text-gray-400">Belum ada pengajuan.</td></tr>
                          ) : requests.map((r) => (
                            <tr key={r.id}>
                              <td><span className="badge badge-blue">{r.jenisService}</span></td>
                              <td className="text-gray-700">{r.deskripsi}</td>
                              <td className="text-center"><span className="badge badge-gray">{r.urgensi}</span></td>
                              <td className="text-center"><span className={`badge ${SR_STATUS_BADGE[r.status] ?? 'badge-gray'}`}>{r.status}</span></td>
                              <td>
                                {canApprove && r.status === 'SUBMITTED' && (
                                  <div className="flex items-center gap-0.5">
                                    <button onClick={() => approveReq.mutate(r.id)} className="p-1.5 hover:bg-green-50 rounded text-gray-400 hover:text-green-600" title="Setujui"><Check size={15} /></button>
                                    <button onClick={() => setRejectTarget(r.id)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500" title="Tolak"><X size={15} /></button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* ── TAB: Report (analisis TCO, kepatuhan, kondisi) ── */}
              {tab === 'report' && selectedId && (
                <GaVehicleReportTab assetId={selectedId} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Service log modal */}
      {showServiceModal && selectedId && (
        <ServiceLogModal
          assetId={selectedId}
          onClose={() => setShowServiceModal(false)}
          onSaved={() => {
            setShowServiceModal(false);
            queryClient.invalidateQueries({ queryKey: ['ga-vehicle-services', selectedId] });
            queryClient.invalidateQueries({ queryKey: ['ga-vehicle', selectedId] });
          }}
        />
      )}

      {/* Service request modal */}
      {showRequestModal && selectedId && (
        <ServiceRequestModal
          assetId={selectedId}
          onClose={() => setShowRequestModal(false)}
          onSaved={() => { setShowRequestModal(false); invalidateRequests(); }}
        />
      )}

      {/* Tax modal */}
      {showTaxModal && selectedId && (
        <TaxModal
          assetId={selectedId}
          editRecord={showTaxModal === 'new' ? null : showTaxModal}
          onClose={() => setShowTaxModal(false)}
          onSaved={() => { setShowTaxModal(false); queryClient.invalidateQueries({ queryKey: ['ga-vehicle-taxes', selectedId] }); queryClient.invalidateQueries({ queryKey: ['ga-fleet-summary'] }); }}
        />
      )}

      {/* Insurance modal */}
      {showInsuranceModal && selectedId && (
        <InsuranceModal
          assetId={selectedId}
          editRecord={showInsuranceModal === 'new' ? null : showInsuranceModal}
          onClose={() => setShowInsuranceModal(false)}
          onSaved={() => { setShowInsuranceModal(false); queryClient.invalidateQueries({ queryKey: ['ga-vehicle-insurances', selectedId] }); queryClient.invalidateQueries({ queryKey: ['ga-fleet-summary'] }); }}
        />
      )}

      {/* Fuel modal */}
      {showFuelModal && selectedId && (
        <FuelModal
          assetId={selectedId}
          onClose={() => setShowFuelModal(false)}
          onSaved={() => {
            setShowFuelModal(false);
            queryClient.invalidateQueries({ queryKey: ['ga-vehicle-fuel', selectedId] });
            queryClient.invalidateQueries({ queryKey: ['ga-vehicle', selectedId] });
            queryClient.invalidateQueries({ queryKey: ['ga-fleet-summary'] });
          }}
        />
      )}

      {/* Inspection modal */}
      {showInspectionModal && selectedId && (
        <InspectionModal
          assetId={selectedId}
          onClose={() => setShowInspectionModal(false)}
          onSaved={() => { setShowInspectionModal(false); queryClient.invalidateQueries({ queryKey: ['ga-vehicle-inspections', selectedId] }); }}
        />
      )}

      {/* Incident modal */}
      {showIncidentModal && selectedId && (
        <IncidentModal
          assetId={selectedId}
          incidentId={showIncidentModal === 'new' ? undefined : showIncidentModal.id}
          onClose={() => setShowIncidentModal(null)}
          onSaved={() => {
            setShowIncidentModal(null);
            queryClient.invalidateQueries({ queryKey: ['ga-vehicle-incidents', selectedId] });
            queryClient.invalidateQueries({ queryKey: ['ga-fleet-summary'] });
          }}
        />
      )}

      {/* Reject modal */}
      {rejectTarget && (
        <RejectModal
          onClose={() => setRejectTarget(null)}
          onSubmit={(reason) => { rejectReq.mutate({ id: rejectTarget, reason }); setRejectTarget(null); }}
        />
      )}

      <ConfirmDialog
        open={deleteLog !== null}
        onCancel={() => setDeleteLog(null)}
        onConfirm={() => { if (deleteLog) { deleteLogMutation.mutate(deleteLog.id); setDeleteLog(null); } }}
        title="Hapus Service Log"
        message={`Hapus service log "${deleteLog?.label}"?`}
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
      <ConfirmDialog
        open={deleteTax !== null}
        onCancel={() => setDeleteTax(null)}
        onConfirm={() => { if (deleteTax) { deleteTaxMutation.mutate(deleteTax.id); setDeleteTax(null); } }}
        title="Hapus Data Pajak"
        message={`Hapus data pajak "${deleteTax?.label}"?`}
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
      <ConfirmDialog
        open={deleteInsurance !== null}
        onCancel={() => setDeleteInsurance(null)}
        onConfirm={() => { if (deleteInsurance) { deleteInsuranceMutation.mutate(deleteInsurance.id); setDeleteInsurance(null); } }}
        title="Hapus Data Asuransi"
        message={`Hapus data asuransi "${deleteInsurance?.label}"?`}
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
      <ConfirmDialog
        open={deleteFuel !== null}
        onCancel={() => setDeleteFuel(null)}
        onConfirm={() => { if (deleteFuel) { deleteFuelMutation.mutate(deleteFuel.id); setDeleteFuel(null); } }}
        title="Hapus Log BBM"
        message={`Hapus log BBM "${deleteFuel?.label}"?`}
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
      <ConfirmDialog
        open={deleteInspection !== null}
        onCancel={() => setDeleteInspection(null)}
        onConfirm={() => { if (deleteInspection) { deleteInspectionMutation.mutate(deleteInspection.id); setDeleteInspection(null); } }}
        title="Hapus Data Inspeksi"
        message={`Hapus data inspeksi "${deleteInspection?.label}"?`}
        confirmLabel="Ya, Hapus"
        variant="danger"
      />

      {/* Tire modal */}
      {showTireModal && selectedId && (
        <TireModal
          assetId={selectedId}
          editRecord={showTireModal === 'new' ? null : showTireModal}
          onClose={() => setShowTireModal(false)}
          onSaved={() => { setShowTireModal(false); queryClient.invalidateQueries({ queryKey: ['ga-vehicle-tires', selectedId] }); }}
        />
      )}

      {/* Oil modal */}
      {showOilModal && selectedId && (
        <OilModal
          assetId={selectedId}
          onClose={() => setShowOilModal(false)}
          onSaved={() => {
            setShowOilModal(false);
            queryClient.invalidateQueries({ queryKey: ['ga-vehicle-oil', selectedId] });
            queryClient.invalidateQueries({ queryKey: ['ga-vehicle', selectedId] }); // update odometerTerakhir
          }}
        />
      )}

      <GaAssetQRModal isOpen={showQrModal} onClose={() => setShowQrModal(false)} asset={assetDetail ?? null} />

      <ConfirmDialog
        open={deleteTire !== null}
        onCancel={() => setDeleteTire(null)}
        onConfirm={() => { if (deleteTire) { deleteTireMutation.mutate(deleteTire.id); setDeleteTire(null); } }}
        title="Hapus Data Ban"
        message={`Hapus data ban "${deleteTire?.label}"?`}
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
      <ConfirmDialog
        open={deleteOil !== null}
        onCancel={() => setDeleteOil(null)}
        onConfirm={() => { if (deleteOil) { deleteOilMutation.mutate(deleteOil.id); setDeleteOil(null); } }}
        title="Hapus Log Oli"
        message={`Hapus log ganti oli "${deleteOil?.label}"?`}
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
    </div>
  );
};

// ── Fleet KPI card ──────────────────────────────────────────────────

function ServiceCostSummaryCards({ summary }: { summary: ReturnType<typeof buildServiceCostSummary> }) {
  const cards = [
    { label: 'Total Service', value: summary.total, count: summary.count, icon: <Wrench size={16} className="text-teal-600" />, bg: 'bg-teal-50' },
    { label: 'Oli', value: summary.oli, count: summary.oliCount, icon: <Fuel size={16} className="text-amber-600" />, bg: 'bg-amber-50' },
    { label: 'Ban & Roda', value: summary.ban, count: summary.banCount, icon: <Car size={16} className="text-blue-600" />, bg: 'bg-blue-50' },
    { label: 'Rem', value: summary.rem, count: summary.remCount, icon: <TriangleAlert size={16} className="text-red-600" />, bg: 'bg-red-50' },
    { label: 'Elektrikal/AC', value: summary.elektrikal + summary.ac, count: summary.elektrikalCount + summary.acCount, icon: <ShieldCheck size={16} className="text-purple-600" />, bg: 'bg-purple-50' },
    { label: 'Service Lain', value: summary.service + summary.lainnya, count: summary.serviceCount + summary.lainnyaCount, icon: <ClipboardList size={16} className="text-gray-600" />, bg: 'bg-gray-50' },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      {cards.map((card) => (
        <div key={card.label} className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={`w-8 h-8 rounded-lg ${card.bg} flex items-center justify-center`}>{card.icon}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{card.label}</span>
          </div>
          <p className="text-sm font-semibold text-gray-900 tabular-nums">{formatRupiah(card.value)}</p>
          <p className="text-[11px] text-gray-400 mt-0.5">{card.count} catatan</p>
        </div>
      ))}
    </div>
  );
}

function FleetKpi({ icon, iconBg, label, value, sub, isText }: { icon: React.ReactNode; iconBg: string; label: string; value: string | number; sub?: string; isText?: boolean }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="flex items-center gap-3">
        <div className={cn('p-2 rounded-lg', iconBg)}>{icon}</div>
        <div className="min-w-0">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</p>
          <p className={cn('font-bold text-gray-900', isText ? 'text-sm' : 'text-lg')}>{value}</p>
          {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

// ── Driver picker ────────────────────────────────────────────────────
function DriverPicker({ currentPic, canEdit, onAssign, isPending }: {
  currentPic: { id: string; fullName: string | null } | null;
  canEdit: boolean;
  onAssign: (userId: string | null) => void;
  isPending: boolean;
}) {
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['ga-users-driver-picker'],
    queryFn: async () => (await api.get('/users', { params: { limit: 200 } })).data?.data ?? [],
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedId, setPickedId] = useState(currentPic?.id ?? '');

  useEffect(() => { setPickedId(currentPic?.id ?? ''); }, [currentPic]);

  if (!canEdit) {
    return currentPic ? (
      <div className="flex items-center gap-2 text-sm text-gray-800">
        <Users size={15} className="text-gray-400" /> {currentPic.fullName ?? currentPic.id}
      </div>
    ) : (
      <p className="text-sm text-gray-400">Belum ada driver ditugaskan.</p>
    );
  }

  if (!pickerOpen) {
    return (
      <div className="flex items-center justify-between">
        {currentPic ? (
          <div className="flex items-center gap-2 text-sm text-gray-800">
            <Users size={15} className="text-gray-400" /> {currentPic.fullName ?? currentPic.id}
          </div>
        ) : (
          <p className="text-sm text-gray-400">Belum ada driver ditugaskan.</p>
        )}
        <button onClick={() => setPickerOpen(true)} className="text-xs font-medium text-teal-600 hover:text-teal-700">
          {currentPic ? 'Ganti' : 'Tugaskan'} Driver
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <div className="flex-1">
        <SearchableSelect
          value={pickedId}
          onChange={(v: string) => setPickedId(v)}
          options={users.map((u: any) => ({ value: u.id, label: u.fullName }))}
          placeholder="Pilih driver..."
        />
      </div>
      <button
        onClick={() => { onAssign(pickedId || null); setPickerOpen(false); }}
        disabled={isPending}
        className="btn-primary bg-teal-600 hover:bg-teal-700"
      >
        {isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
      </button>
      <button onClick={() => setPickerOpen(false)} className="p-2 hover:bg-gray-100 rounded text-gray-400"><X size={16} /></button>
    </div>
  );
}

// ── Small field helpers ──────────────────────────────────────────────
interface FieldProps { label: string; value: string; onChange: (v: string) => void; type?: string; step?: string; disabled?: boolean }
function Field({ label, value, onChange, type = 'text', step, disabled }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      <input
        type={type} step={step} value={value} disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-500"
      />
    </label>
  );
}

interface SelectFieldProps { label: string; value: string; onChange: (v: string) => void; options: readonly string[]; disabled?: boolean }
function SelectField({ label, value, onChange, options, disabled }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      <select
        value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-500"
      >
        <option value="">—</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

// ── Modals ───────────────────────────────────────────────────────────
function ModalShell({ title, icon, onClose, children, wide }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={cn('bg-white rounded-xl shadow-xl w-full max-h-[90vh] overflow-y-auto', wide ? 'max-w-2xl' : 'max-w-lg')}>
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">{icon} {title}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ServiceLogModal({ assetId, onClose, onSaved }: { assetId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ tanggal: '', odometer: '', jenisService: 'SERVIS_BERKALA', deskripsi: '', bengkel: '', biaya: '' });
  const mut = useMutation({
    mutationFn: () => api.post(`/ga/vehicle/assets/${assetId}/services`, {
      tanggal: f.tanggal, odometer: numOrNull(f.odometer), jenisService: f.jenisService,
      deskripsi: f.deskripsi, bengkel: f.bengkel || null, biaya: numOrNull(f.biaya),
    }),
    onSuccess: () => { toast.success('Service log ditambahkan.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal simpan service log.'),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };
  return (
    <ModalShell title="Tambah Service Log" icon={<Wrench size={16} className="text-teal-600" />} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-3">
        <Field label="Tanggal" type="date" value={f.tanggal} onChange={(v) => setF({ ...f, tanggal: v })} />
        <SelectField label="Jenis Service" value={f.jenisService} onChange={(v) => setF({ ...f, jenisService: v })} options={SERVICE_TYPES} />
        <Field label="Deskripsi" value={f.deskripsi} onChange={(v) => setF({ ...f, deskripsi: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Odometer" type="number" value={f.odometer} onChange={(v) => setF({ ...f, odometer: v })} />
          <Field label="Biaya" type="number" value={f.biaya} onChange={(v) => setF({ ...f, biaya: v })} />
        </div>
        <Field label="Bengkel" value={f.bengkel} onChange={(v) => setF({ ...f, bengkel: v })} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="submit" disabled={mut.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function ServiceRequestModal({ assetId, onClose, onSaved }: { assetId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ jenisService: 'PERBAIKAN', odometer: '', deskripsi: '', urgensi: 'MEDIUM' });
  const mut = useMutation({
    mutationFn: () => api.post(`/ga/vehicle/assets/${assetId}/service-requests`, {
      jenisService: f.jenisService, odometer: numOrNull(f.odometer), deskripsi: f.deskripsi, urgensi: f.urgensi,
    }),
    onSuccess: () => { toast.success('Pengajuan dikirim.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal mengirim pengajuan.'),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };
  return (
    <ModalShell title="Ajukan Service" icon={<ClipboardList size={16} className="text-teal-600" />} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-3">
        <SelectField label="Jenis Service" value={f.jenisService} onChange={(v) => setF({ ...f, jenisService: v })} options={SERVICE_TYPES} />
        <Field label="Deskripsi" value={f.deskripsi} onChange={(v) => setF({ ...f, deskripsi: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Odometer" type="number" value={f.odometer} onChange={(v) => setF({ ...f, odometer: v })} />
          <SelectField label="Urgensi" value={f.urgensi} onChange={(v) => setF({ ...f, urgensi: v })} options={URGENCIES} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="submit" disabled={mut.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Kirim
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function RejectModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (reason: string) => void }) {
  const [reason, setReason] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); if (reason.trim()) onSubmit(reason.trim()); };
  return (
    <ModalShell title="Tolak Pengajuan" icon={<XCircle size={16} className="text-red-500" />} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-3">
        <Field label="Alasan Penolakan" value={reason} onChange={setReason} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="submit" disabled={!reason.trim()} className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg disabled:opacity-50">Tolak</button>
        </div>
      </form>
    </ModalShell>
  );
}

// Ambil file foto inspeksi lewat endpoint ber-RBAC lalu ubah jadi data URL.
// @react-pdf/renderer butuh sumber gambar yang bisa diambil tanpa kredensial
// cookie saat render, jadi byte-nya di-inline dulu di sini.
async function fetchInspectionPhotoDataUrl(
  assetId: string, inspectionId: string, photoId: string,
): Promise<string> {
  const res = await api.get(
    `/ga/vehicle/assets/${assetId}/inspections/${inspectionId}/photos/${photoId}/file`,
    { responseType: 'blob' },
  );
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.readAsDataURL(res.data as Blob);
  });
}

// Upload dokumen pendukung (scan STNK/KIR/dsb) untuk record pajak/asuransi.
// Alur: (1) buat GaDocument baru (auto-generate code dari document type),
// (2) upload file jadi versi 1, (3) PATCH record pajak/asuransi dengan
// documentId hasil (1). 3 request berurutan -- tidak ideal tapi reuse
// endpoint /ga/documents yang sudah ada persis, tanpa endpoint baru.
async function uploadSupportingDocument(opts: {
  file: File; title: string; typeCode: string; assetId: string;
}): Promise<string> {
  const typesRes = await api.get('/ga/master/document-types');
  const docType = (typesRes.data as any[]).find((t) => t.code === opts.typeCode);
  if (!docType) throw new Error(`Tipe dokumen "${opts.typeCode}" tidak ditemukan di Master Data.`);

  const createRes = await api.post('/ga/documents', {
    title: opts.title, typeId: docType.id, assetId: opts.assetId, status: 'ACTIVE',
  });
  const documentId = createRes.data.id as string;

  const fd = new FormData();
  fd.append('file', opts.file);
  await api.post(`/ga/documents/${documentId}/versions`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

  return documentId;
}

function DocumentUploadField({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">Scan Dokumen (PDF, opsional)</span>
      <input
        type="file"
        accept="application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
        className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
      />
      {file && <span className="block text-[11px] text-gray-400 mt-1">{file.name}</span>}
    </label>
  );
}

// Tampilkan link "Lihat" untuk dokumen yang sudah terlampir di record
// pajak/asuransi -- fetch detail dokumen (versi terbaru) baru saat diklik,
// bukan di list awal (hindari N+1 request per baris tabel).
function DocumentLink({ documentId }: { documentId: string }) {
  const handleView = async () => {
    try {
      const doc = await api.get(`/ga/documents/${documentId}`);
      const latest = doc.data.versions?.[0];
      if (!latest) return toast.error('Dokumen belum punya file terupload.');
      const fileRes = await api.get(`/ga/documents/${documentId}/versions/${latest.id}/file`, { responseType: 'blob' });
      const url = URL.createObjectURL(fileRes.data as Blob);
      window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      toast.error('Gagal membuka dokumen.');
    }
  };
  return (
    <button onClick={handleView} className="inline-flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-700" title="Lihat dokumen">
      <FileCheck2 size={13} /> Lihat
    </button>
  );
}

function TaxModal({ assetId, editRecord, onClose, onSaved }: { assetId: string; editRecord?: any | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!editRecord;
  const currentYear = new Date().getFullYear();
  const [f, setF] = useState(() => editRecord ? {
    type: editRecord.type, periodYear: String(editRecord.periodYear),
    amount: editRecord.amount != null ? String(editRecord.amount) : '',
    paidAt: editRecord.paidAt ? editRecord.paidAt.slice(0, 10) : '',
    dueDate: editRecord.dueDate ? editRecord.dueDate.slice(0, 10) : '',
    status: editRecord.status, notes: editRecord.notes ?? '',
  } : { type: 'STNK_TAHUNAN', periodYear: String(currentYear), amount: '', paidAt: '', dueDate: '', status: 'ACTIVE', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        type: f.type, periodYear: Number(f.periodYear), amount: numOrNull(f.amount),
        paidAt: f.paidAt || null, dueDate: f.dueDate, status: f.status, notes: f.notes || null,
      };
      const res = isEdit
        ? await api.patch(`/ga/vehicle/assets/${assetId}/taxes/${editRecord.id}`, payload)
        : await api.post(`/ga/vehicle/assets/${assetId}/taxes`, payload);
      const recordId = isEdit ? editRecord.id : res.data.id;
      if (file) {
        setUploading(true);
        const typeCodeMap: Record<string, string> = { STNK_TAHUNAN: 'STNK', STNK_5_TAHUNAN: 'STNK', KIR: 'KIR', PAJAK_KENDARAAN: 'STNK' };
        try {
          const documentId = await uploadSupportingDocument({
            file, title: `${TAX_TYPE_LABELS[f.type]} ${f.periodYear}`, typeCode: typeCodeMap[f.type] ?? 'STNK', assetId,
          });
          await api.patch(`/ga/vehicle/assets/${assetId}/taxes/${recordId}`, { documentId });
        } finally {
          setUploading(false);
        }
      }
      return res;
    },
    onSuccess: () => { toast.success(file ? 'Data pajak + dokumen disimpan.' : isEdit ? 'Data pajak diperbarui.' : 'Data pajak ditambahkan.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || e.message || 'Gagal simpan data pajak.'),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };
  const pending = mut.isPending || uploading;
  return (
    <ModalShell title={isEdit ? 'Edit Data Pajak/STNK' : 'Tambah Data Pajak/STNK'} icon={isEdit ? <Pencil size={16} className="text-teal-600" /> : <FileWarning size={16} className="text-teal-600" />} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-3">
        <SelectField label="Jenis" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={TAX_TYPES} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tahun" type="number" value={f.periodYear} onChange={(v) => setF({ ...f, periodYear: v })} />
          <Field label="Biaya" type="number" value={f.amount} onChange={(v) => setF({ ...f, amount: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal Bayar" type="date" value={f.paidAt} onChange={(v) => setF({ ...f, paidAt: v })} />
          <Field label="Jatuh Tempo" type="date" value={f.dueDate} onChange={(v) => setF({ ...f, dueDate: v })} />
        </div>
        <SelectField label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={TAX_STATUSES} />
        <Field label="Catatan" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
        <DocumentUploadField file={file} onChange={setFile} />
        {isEdit && editRecord.document && (
          <p className="text-xs text-gray-400">Sudah ada dokumen terlampir. Upload file baru di atas untuk menggantinya.</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="submit" disabled={pending || !f.dueDate} className="btn-primary bg-teal-600 hover:bg-teal-700">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {uploading ? 'Mengunggah...' : 'Simpan'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function InsuranceModal({ assetId, editRecord, onClose, onSaved }: { assetId: string; editRecord?: any | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!editRecord;
  const [f, setF] = useState(() => editRecord ? {
    type: editRecord.type, provider: editRecord.provider, policyNumber: editRecord.policyNumber ?? '',
    premium: editRecord.premium != null ? String(editRecord.premium) : '',
    coverageValue: editRecord.coverageValue != null ? String(editRecord.coverageValue) : '',
    startDate: editRecord.startDate ? editRecord.startDate.slice(0, 10) : '',
    endDate: editRecord.endDate ? editRecord.endDate.slice(0, 10) : '',
    status: editRecord.status, notes: editRecord.notes ?? '',
  } : { type: 'ALL_RISK', provider: '', policyNumber: '', premium: '', coverageValue: '', startDate: '', endDate: '', status: 'ACTIVE', notes: '' });
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        type: f.type, provider: f.provider, policyNumber: f.policyNumber || null,
        premium: numOrNull(f.premium), coverageValue: numOrNull(f.coverageValue),
        startDate: f.startDate, endDate: f.endDate, status: f.status, notes: f.notes || null,
      };
      const res = isEdit
        ? await api.patch(`/ga/vehicle/assets/${assetId}/insurances/${editRecord.id}`, payload)
        : await api.post(`/ga/vehicle/assets/${assetId}/insurances`, payload);
      const recordId = isEdit ? editRecord.id : res.data.id;
      if (file) {
        setUploading(true);
        try {
          const documentId = await uploadSupportingDocument({
            file, title: `Polis ${f.provider} — ${f.policyNumber || INSURANCE_TYPE_LABELS[f.type]}`,
            typeCode: 'ASURANSI_KENDARAAN', assetId,
          });
          await api.patch(`/ga/vehicle/assets/${assetId}/insurances/${recordId}`, { documentId });
        } finally {
          setUploading(false);
        }
      }
      return res;
    },
    onSuccess: () => { toast.success(file ? 'Data asuransi + dokumen disimpan.' : isEdit ? 'Data asuransi diperbarui.' : 'Data asuransi ditambahkan.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || e.message || 'Gagal simpan data asuransi.'),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };
  const pending = mut.isPending || uploading;
  return (
    <ModalShell title={isEdit ? 'Edit Data Asuransi' : 'Tambah Data Asuransi'} icon={isEdit ? <Pencil size={16} className="text-teal-600" /> : <ShieldCheck size={16} className="text-teal-600" />} onClose={onClose} wide>
      <form onSubmit={submit} className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Jenis" value={f.type} onChange={(v) => setF({ ...f, type: v })} options={INSURANCE_TYPES} />
          <Field label="Penyedia Asuransi" value={f.provider} onChange={(v) => setF({ ...f, provider: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="No. Polis" value={f.policyNumber} onChange={(v) => setF({ ...f, policyNumber: v })} />
          <Field label="Premi" type="number" value={f.premium} onChange={(v) => setF({ ...f, premium: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nilai Pertanggungan" type="number" value={f.coverageValue} onChange={(v) => setF({ ...f, coverageValue: v })} />
          <SelectField label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={INSURANCE_STATUSES} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal Mulai" type="date" value={f.startDate} onChange={(v) => setF({ ...f, startDate: v })} />
          <Field label="Tanggal Berakhir" type="date" value={f.endDate} onChange={(v) => setF({ ...f, endDate: v })} />
        </div>
        <Field label="Catatan" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
        <DocumentUploadField file={file} onChange={setFile} />
        {isEdit && editRecord.document && (
          <p className="text-xs text-gray-400">Sudah ada dokumen terlampir. Upload file baru di atas untuk menggantinya.</p>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="submit" disabled={pending || !f.provider || !f.startDate || !f.endDate} className="btn-primary bg-teal-600 hover:bg-teal-700">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {uploading ? 'Mengunggah...' : 'Simpan'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function FuelModal({ assetId, onClose, onSaved }: { assetId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ tanggal: '', odometer: '', liters: '', pricePerLiter: '', totalCost: '', spbu: '', driverName: '', notes: '' });

  // Auto-hitung totalCost dari liters × pricePerLiter kalau keduanya diisi
  // dan totalCost belum di-override manual.
  const [totalManual, setTotalManual] = useState(false);
  useEffect(() => {
    if (totalManual) return;
    const l = Number(f.liters), p = Number(f.pricePerLiter);
    if (l > 0 && p > 0) setF((prev) => ({ ...prev, totalCost: String(Math.round(l * p)) }));
  }, [f.liters, f.pricePerLiter, totalManual]);

  const mut = useMutation({
    mutationFn: () => api.post(`/ga/vehicle/assets/${assetId}/fuel-logs`, {
      tanggal: f.tanggal, odometer: numOrNull(f.odometer), liters: Number(f.liters),
      pricePerLiter: numOrNull(f.pricePerLiter), totalCost: Number(f.totalCost),
      spbu: f.spbu || null, driverName: f.driverName || null, notes: f.notes || null,
    }),
    onSuccess: () => { toast.success('Log BBM ditambahkan.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal simpan log BBM.'),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };
  return (
    <ModalShell title="Tambah Log BBM" icon={<Fuel size={16} className="text-teal-600" />} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal" type="date" value={f.tanggal} onChange={(v) => setF({ ...f, tanggal: v })} />
          <Field label="Odometer" type="number" value={f.odometer} onChange={(v) => setF({ ...f, odometer: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Liter" type="number" value={f.liters} onChange={(v) => setF({ ...f, liters: v })} />
          <Field label="Harga/Liter" type="number" value={f.pricePerLiter} onChange={(v) => setF({ ...f, pricePerLiter: v })} />
        </div>
        <Field label="Total Biaya" type="number" value={f.totalCost} onChange={(v) => { setTotalManual(true); setF({ ...f, totalCost: v }); }} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="SPBU" value={f.spbu} onChange={(v) => setF({ ...f, spbu: v })} />
          <Field label="Driver" value={f.driverName} onChange={(v) => setF({ ...f, driverName: v })} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="submit" disabled={mut.isPending || !f.tanggal || !f.liters || !f.totalCost} className="btn-primary bg-teal-600 hover:bg-teal-700">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function InspectionModal({ assetId, onClose, onSaved }: { assetId: string; onClose: () => void; onSaved: () => void }) {
  const { data: categories = INSPECTION_CATEGORY_FALLBACK } = useQuery<InspectionCategory[]>({
    queryKey: ['ga-inspection-categories'],
    queryFn: async () => {
      const data = (await api.get('/ga/vehicle/inspection-categories')).data;
      return Array.isArray(data) && data.length > 0 ? data : INSPECTION_CATEGORY_FALLBACK;
    },
  });
  const { data: users = [] } = useQuery<any[]>({
    queryKey: ['ga-users-inspector-picker'],
    queryFn: async () => (await api.get('/users', { params: { limit: 200 } })).data?.data ?? [],
  });

  const [tanggal, setTanggal] = useState(() => new Date().toISOString().slice(0, 10));
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [inspectorUserId, setInspectorUserId] = useState('');
  const [inspectorName, setInspectorName] = useState('');
  const [fuelLevel, setFuelLevel] = useState<string>('');
  const [intervalDays, setIntervalDays] = useState('30');
  const [checklist, setChecklist] = useState<Record<string, 'OK' | 'PERLU_PERHATIAN' | 'RUSAK'>>({});
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [photos, setPhotos] = useState<Record<string, { file: File; preview: string }>>({});

  // Kategori pertama terbuka otomatis supaya user langsung lihat isinya.
  useEffect(() => {
    if (categories.length > 0 && Object.keys(openCats).length === 0) {
      setOpenCats({ [categories[0]!.key]: true });
    }
  }, [categories, openCats]);

  const allItems = useMemo(() => categories.flatMap((c) => c.items), [categories]);

  const overallResult = useMemo(() => {
    const values = Object.values(checklist);
    if (values.some((v) => v === 'RUSAK')) return 'TIDAK_LAYAK';
    if (values.some((v) => v === 'PERLU_PERHATIAN')) return 'PERLU_PERHATIAN';
    return 'BAIK';
  }, [checklist]);

  const nextDueDate = useMemo(() => {
    if (!tanggal) return '';
    const days = Number(intervalDays);
    if (!Number.isFinite(days) || days <= 0) return '';
    const d = new Date(tanggal);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + days);
    return d.toISOString().slice(0, 10);
  }, [tanggal, intervalDays]);

  const filledCount = Object.keys(checklist).length;

  const mut = useMutation({
    mutationFn: async () => {
      const created = await api.post(`/ga/vehicle/assets/${assetId}/inspections`, {
        tanggal,
        odometer: numOrNull(odometer),
        checklist,
        overallResult,
        notes: notes || null,
        inspectorUserId: inspectorUserId || null,
        inspectorName: inspectorName || (users.find((u: any) => u.id === inspectorUserId)?.fullName ?? null),
        fuelLevel: fuelLevel || null,
        intervalDays: numOrNull(intervalDays),
        nextDueDate: nextDueDate || null,
      });
      // Upload foto per kategori SETELAH inspeksi tersimpan (butuh id).
      const inspectionId = created.data?.id;
      const entries = Object.entries(photos);
      if (inspectionId && entries.length > 0) {
        let failed = 0;
        for (const [category, { file }] of entries) {
          try {
            const fd = new FormData();
            fd.append('photo', file);
            fd.append('category', category);
            // Jangan set Content-Type manual — axios yang atur boundary multipart.
            await api.post(`/ga/vehicle/assets/${assetId}/inspections/${inspectionId}/photos`, fd);
          } catch {
            failed += 1;
          }
        }
        if (failed > 0) toast.warning(`${failed} foto gagal diunggah. Inspeksi tetap tersimpan.`);
      }
      return created;
    },
    onSuccess: () => { toast.success('Inspeksi disimpan.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal simpan inspeksi.'),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };
  const setPoint = (key: string, value: 'OK' | 'PERLU_PERHATIAN' | 'RUSAK') => setChecklist((prev) => ({ ...prev, [key]: value }));
  const setCategoryAll = (cat: InspectionCategory, value: 'OK' | 'PERLU_PERHATIAN' | 'RUSAK') => {
    setChecklist((prev) => {
      const next = { ...prev };
      cat.items.forEach((it) => { next[it.key] = value; });
      return next;
    });
  };
  const pickPhoto = (category: string, f: File | null) => {
    if (!f) {
      setPhotos((prev) => { const next = { ...prev }; delete next[category]; return next; });
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      toast.error('Format foto harus JPG, PNG, atau WEBP.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Ukuran foto maksimal 5 MB.');
      return;
    }
    setPhotos((prev) => ({ ...prev, [category]: { file: f, preview: URL.createObjectURL(f) } }));
  };

  return (
    <ModalShell title="Inspeksi Berkala" icon={<ClipboardCheck size={16} className="text-teal-600" />} onClose={onClose} wide>
      <form onSubmit={submit} className="p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Field label="Tanggal" type="date" value={tanggal} onChange={setTanggal} />
          <Field label="Odometer" type="number" value={odometer} onChange={setOdometer} />
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">Level BBM</span>
            <select
              value={fuelLevel} onChange={(e) => setFuelLevel(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="">— Pilih —</option>
              {FUEL_LEVELS.map((lv) => <option key={lv} value={lv}>{FUEL_LEVEL_LABELS[lv]}</option>)}
            </select>
          </label>
          <Field label="Interval Inspeksi (hari)" type="number" value={intervalDays} onChange={setIntervalDays} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="block text-xs font-medium text-gray-500 mb-1">Inspektor</span>
            <SearchableSelect
              value={inspectorUserId}
              onChange={(v: string) => {
                setInspectorUserId(v);
                setInspectorName(users.find((u: any) => u.id === v)?.fullName ?? '');
              }}
              options={users.map((u: any) => ({ value: u.id, label: u.fullName }))}
              placeholder="Pilih inspektor..."
            />
          </label>
          <Field label="Nama Inspektor (bila di luar daftar user)" value={inspectorName} onChange={setInspectorName} />
        </div>

        <div className="rounded-lg bg-teal-50 ring-1 ring-teal-100 px-3 py-2 text-xs text-teal-800 flex items-center gap-2">
          <CalendarClock size={14} />
          Jadwal inspeksi berikutnya: <strong>{nextDueDate ? formatDate(nextDueDate) : '—'}</strong>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="block text-xs font-medium text-gray-500">Checklist Komponen (per kategori)</span>
            <span className="text-[11px] text-gray-400">{filledCount}/{allItems.length} terisi</span>
          </div>
          <div className="space-y-2">
            {categories.map((cat) => {
              const isOpen = !!openCats[cat.key];
              const catFilled = cat.items.filter((it) => checklist[it.key]).length;
              const catWorst = cat.items.some((it) => checklist[it.key] === 'RUSAK') ? 'RUSAK'
                : cat.items.some((it) => checklist[it.key] === 'PERLU_PERHATIAN') ? 'PERLU_PERHATIAN'
                  : catFilled > 0 ? 'OK' : null;
              return (
                <div key={cat.key} className="border border-gray-200 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenCats((prev) => ({ ...prev, [cat.key]: !prev[cat.key] }))}
                    className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium text-gray-800">
                      {isOpen ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                      {cat.label}
                    </span>
                    <span className="flex items-center gap-2">
                      {catWorst && (
                        <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', CHECK_STATE_BADGE[catWorst])}>
                          {CHECK_STATE_LABELS[catWorst]}
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400">{catFilled}/{cat.items.length}</span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="p-3 space-y-2">
                      <div className="flex items-center gap-2 pb-1">
                        <span className="text-[11px] text-gray-400">Tandai semua:</span>
                        {(['OK', 'PERLU_PERHATIAN', 'RUSAK'] as const).map((v) => (
                          <button
                            key={v} type="button" onClick={() => setCategoryAll(cat, v)}
                            className="text-[10px] font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200"
                          >
                            {CHECK_STATE_LABELS[v]}
                          </button>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {cat.items.map((it) => (
                          <div key={it.key} className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg">
                            <span className="text-sm text-gray-700">{it.label}</span>
                            <div className="flex items-center gap-1">
                              {(['OK', 'PERLU_PERHATIAN', 'RUSAK'] as const).map((v) => (
                                <button
                                  key={v} type="button" onClick={() => setPoint(it.key, v)}
                                  className={cn(
                                    'text-[10px] font-medium px-2 py-1 rounded-full',
                                    checklist[it.key] === v
                                      ? v === 'OK' ? 'bg-green-600 text-white' : v === 'PERLU_PERHATIAN' ? 'bg-amber-500 text-white' : 'bg-red-600 text-white'
                                      : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                                  )}
                                >
                                  {CHECK_STATE_LABELS[v]}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Foto bukti visual — 1 per kategori */}
                      <div className="pt-1">
                        {photos[cat.key] ? (
                          <div className="flex items-center gap-3">
                            <div className="relative inline-block">
                              <img src={photos[cat.key]!.preview} alt={`Foto ${cat.label}`} className="h-20 rounded-lg border border-gray-200 object-cover" />
                              <button
                                type="button" onClick={() => pickPhoto(cat.key, null)} title="Batalkan foto"
                                className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-gray-700 text-white hover:bg-red-600"
                              >
                                <X size={12} />
                              </button>
                            </div>
                            <span className="text-[11px] text-gray-400">Foto diunggah setelah inspeksi disimpan.</span>
                          </div>
                        ) : (
                          <label className="flex items-center gap-2 w-fit px-3 py-2 text-xs border border-dashed border-gray-300 rounded-lg cursor-pointer text-gray-500 hover:bg-gray-50 hover:border-teal-400">
                            <Camera size={14} className="text-gray-400" />
                            Foto bukti {cat.label} (opsional, maks 5 MB)
                            <input
                              type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                              onChange={(e) => pickPhoto(cat.key, e.target.files?.[0] ?? null)}
                            />
                          </label>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Hasil keseluruhan:</span>
          <span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', INSPECTION_RESULT_BADGE[overallResult])}>
            {INSPECTION_RESULT_LABELS[overallResult]}
          </span>
        </div>

        <Field label="Catatan" value={notes} onChange={setNotes} />

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="submit" disabled={mut.isPending || !tanggal || filledCount === 0} className="btn-primary bg-teal-600 hover:bg-teal-700">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

/** Tombol export PDF hasil satu inspeksi (per baris riwayat). */
function InspectionPdfButton({ assetId, inspection, asset }: {
  assetId: string;
  inspection: any;
  asset: InspectionPdfAsset;
}) {
  const [busy, setBusy] = useState(false);
  const company = useCompanyPDF();
  const queryClient = useQueryClient();

  const handleClick = async (e: ReactMouseEvent) => {
    e.stopPropagation();
    setBusy(true);
    try {
      // Kategori dipakai untuk urutan & label; ambil dari cache kalau sudah ada.
      let categories = queryClient.getQueryData<InspectionCategory[]>(['ga-inspection-categories']);
      if (!categories || categories.length === 0) {
        const data = (await api.get('/ga/vehicle/inspection-categories')).data;
        categories = Array.isArray(data) && data.length > 0 ? data : INSPECTION_CATEGORY_FALLBACK;
        queryClient.setQueryData(['ga-inspection-categories'], categories);
      }

      const rawPhotos: any[] = inspection.photos ?? [];
      const photos: InspectionPdfPhoto[] = [];
      let failedPhotos = 0;
      for (const ph of rawPhotos) {
        try {
          const src = await fetchInspectionPhotoDataUrl(assetId, inspection.id, ph.id);
          photos.push({ category: ph.category, src, caption: ph.caption ?? null });
        } catch {
          failedPhotos += 1;
        }
      }
      if (failedPhotos > 0) toast.warning(`${failedPhotos} foto gagal dimuat, PDF tetap dibuat.`);

      const blob = await pdf(
        <InspectionDetailPDF
          inspection={inspection}
          asset={asset}
          categories={categories!}
          photos={photos}
          company={{ name: company.name, address: company.address, logoUrl: company.logoUrl }}
          printedBy={getStoredUser()?.fullName ?? 'Pengguna'}
          generatedAt={new Date()}
        />,
      ).toBlob();

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const tgl = String(inspection.tanggal ?? '').slice(0, 10);
      a.download = `Inspeksi_${asset.noPlat || asset.code}_${tgl}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast.error(err?.response?.data?.error ?? 'Gagal membuat PDF inspeksi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button" onClick={handleClick} disabled={busy} title="Download PDF hasil inspeksi"
      className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded border border-teal-200 text-teal-700 bg-teal-50 hover:bg-teal-100 disabled:opacity-50 transition-colors"
    >
      {busy ? <Loader2 size={12} className="animate-spin" /> : <FileDown size={12} />} PDF
    </button>
  );
}

/** Detail satu inspeksi (checklist per kategori + foto) di baris riwayat. */
function InspectionDetail({ assetId, inspection, canEdit, onPhotoDeleted }: {
  assetId: string;
  inspection: any;
  canEdit: boolean;
  onPhotoDeleted: () => void;
}) {
  const { data: categories = INSPECTION_CATEGORY_FALLBACK } = useQuery<InspectionCategory[]>({
    queryKey: ['ga-inspection-categories'],
    queryFn: async () => {
      const data = (await api.get('/ga/vehicle/inspection-categories')).data;
      return Array.isArray(data) && data.length > 0 ? data : INSPECTION_CATEGORY_FALLBACK;
    },
  });

  const deletePhoto = useMutation({
    mutationFn: (photoId: string) => api.delete(`/ga/vehicle/assets/${assetId}/inspections/${inspection.id}/photos/${photoId}`),
    onSuccess: () => { toast.success('Foto dihapus.'); onPhotoDeleted(); },
    onError: () => toast.error('Gagal menghapus foto.'),
  });

  const checklist: Record<string, string> = inspection.checklist ?? {};
  const photos: any[] = inspection.photos ?? [];

  // Kelompokkan checklist ke kategori yang dikenal. Item yang tak masuk kategori
  // mana pun (format LAMA 12-item) ditampilkan di grup "Checklist (format lama)"
  // supaya data historis tetap terbaca, tidak hilang/blank.
  const knownKeys = new Set(categories.flatMap((c) => c.items.map((i) => i.key)));
  const legacyKeys = Object.keys(checklist).filter((k) => !knownKeys.has(k));

  const photosByCategory = photos.reduce<Record<string, any[]>>((acc, p) => {
    (acc[p.category] ||= []).push(p);
    return acc;
  }, {});

  const renderItems = (keys: string[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
      {keys.map((k) => (
        <div key={k} className="flex items-center justify-between px-2.5 py-1.5 bg-white border border-gray-200 rounded-lg">
          <span className="text-xs text-gray-600">{CHECKPOINT_LABELS[k] ?? k}</span>
          <span className={cn('text-[10px] font-medium px-2 py-0.5 rounded-full', CHECK_STATE_BADGE[checklist[k]!] ?? 'bg-gray-100 text-gray-500')}>
            {CHECK_STATE_LABELS[checklist[k]!] ?? checklist[k]}
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-4 bg-gray-50 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <div><span className="text-gray-400 block">Inspektor</span><span className="text-gray-800">{inspection.inspectorName || '—'}</span></div>
        <div><span className="text-gray-400 block">Level BBM</span><span className="text-gray-800">{inspection.fuelLevel ? (FUEL_LEVEL_LABELS[inspection.fuelLevel] ?? inspection.fuelLevel) : '—'}</span></div>
        <div><span className="text-gray-400 block">Inspeksi Berikutnya</span><span className={cn(dueBadgeClass(inspection.nextDueDate, true))}>{inspection.nextDueDate ? formatDate(inspection.nextDueDate) : '—'}</span></div>
        <div><span className="text-gray-400 block">Odometer</span><span className="text-gray-800 font-mono tabular-nums">{inspection.odometer != null ? Number(inspection.odometer).toLocaleString('id-ID') : '—'}</span></div>
      </div>

      {categories.map((cat) => {
        const keys = cat.items.map((i) => i.key).filter((k) => checklist[k]);
        const catPhotos = photosByCategory[cat.key] ?? [];
        if (keys.length === 0 && catPhotos.length === 0) return null;
        return (
          <div key={cat.key}>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{cat.label}</p>
            {keys.length > 0 && renderItems(keys)}
            {catPhotos.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {catPhotos.map((ph) => (
                  <div key={ph.id} className="relative group">
                    <img
                      src={`${api.defaults.baseURL ?? '/api'}/ga/vehicle/assets/${assetId}/inspections/${inspection.id}/photos/${ph.id}/file`}
                      alt={`Foto ${cat.label}`}
                      className="h-24 w-32 object-cover rounded-lg border border-gray-200"
                    />
                    {canEdit && (
                      <button
                        type="button" onClick={() => deletePhoto.mutate(ph.id)} title="Hapus foto"
                        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      >
                        <Trash2 size={11} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {legacyKeys.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Checklist (format lama)</p>
          {renderItems(legacyKeys)}
        </div>
      )}

      {Object.keys(checklist).length === 0 && (
        <p className="text-xs text-gray-400">Checklist tidak tersedia untuk inspeksi ini.</p>
      )}

      {inspection.notes && (
        <div>
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Catatan</p>
          <p className="text-xs text-gray-700">{inspection.notes}</p>
        </div>
      )}
    </div>
  );
}

function IncidentModal({ assetId, incidentId, onClose, onSaved }: { assetId: string; incidentId?: string; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!incidentId;
  const { data: existing } = useQuery<any>({
    queryKey: ['ga-vehicle-incident-detail', incidentId],
    queryFn: async () => {
      const list = await api.get(`/ga/vehicle/assets/${assetId}/incidents`);
      return (list.data as any[]).find((i) => i.id === incidentId) ?? null;
    },
    enabled: isEdit,
  });

  const [f, setF] = useState({
    tanggal: '', location: '', driverName: '', description: '', severity: 'RINGAN',
    status: 'DILAPORKAN', estimatedCost: '', actualCost: '', insuranceClaimNo: '',
  });

  useEffect(() => {
    if (!existing) return;
    setF({
      tanggal: existing.tanggal?.slice(0, 10) ?? '',
      location: existing.location ?? '', driverName: existing.driverName ?? '',
      description: existing.description ?? '', severity: existing.severity ?? 'RINGAN',
      status: existing.status ?? 'DILAPORKAN',
      estimatedCost: existing.estimatedCost != null ? String(existing.estimatedCost) : '',
      actualCost: existing.actualCost != null ? String(existing.actualCost) : '',
      insuranceClaimNo: existing.insuranceClaimNo ?? '',
    });
  }, [existing]);

  const payload = () => ({
    tanggal: f.tanggal, location: f.location || null, driverName: f.driverName || null,
    description: f.description, severity: f.severity, status: f.status,
    estimatedCost: numOrNull(f.estimatedCost), actualCost: numOrNull(f.actualCost),
    insuranceClaimNo: f.insuranceClaimNo || null,
  });

  const createMut = useMutation({
    mutationFn: () => api.post(`/ga/vehicle/assets/${assetId}/incidents`, payload()),
    onSuccess: () => { toast.success('Insiden dilaporkan.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal melaporkan insiden.'),
  });
  const updateMut = useMutation({
    mutationFn: () => api.patch(`/ga/vehicle/assets/${assetId}/incidents/${incidentId}`, payload()),
    onSuccess: () => { toast.success('Insiden diperbarui.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal update insiden.'),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); isEdit ? updateMut.mutate() : createMut.mutate(); };
  const pending = createMut.isPending || updateMut.isPending;

  return (
    <ModalShell title={isEdit ? 'Detail Insiden' : 'Laporkan Insiden/Kecelakaan'} icon={<TriangleAlert size={16} className="text-red-500" />} onClose={onClose} wide>
      <form onSubmit={submit} className="p-5 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal" type="date" value={f.tanggal} onChange={(v) => setF({ ...f, tanggal: v })} />
          <Field label="Lokasi" value={f.location} onChange={(v) => setF({ ...f, location: v })} />
        </div>
        <Field label="Driver Saat Kejadian" value={f.driverName} onChange={(v) => setF({ ...f, driverName: v })} />
        <Field label="Deskripsi Kejadian" value={f.description} onChange={(v) => setF({ ...f, description: v })} />
        <div className="grid grid-cols-2 gap-3">
          <SelectField label="Tingkat Keparahan" value={f.severity} onChange={(v) => setF({ ...f, severity: v })} options={INCIDENT_SEVERITIES} />
          <SelectField label="Status" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={INCIDENT_STATUSES} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Estimasi Biaya" type="number" value={f.estimatedCost} onChange={(v) => setF({ ...f, estimatedCost: v })} />
          <Field label="Biaya Aktual" type="number" value={f.actualCost} onChange={(v) => setF({ ...f, actualCost: v })} />
        </div>
        <Field label="No. Klaim Asuransi" value={f.insuranceClaimNo} onChange={(v) => setF({ ...f, insuranceClaimNo: v })} />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="submit" disabled={pending || !f.tanggal || !f.description} className="btn-primary bg-teal-600 hover:bg-teal-700">
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MONITORING BAN (Tire Panel & Modal)
// ═══════════════════════════════════════════════════════════════════

function TireMonitoringPanel({ assetId, canEdit, onAddClick, onEditClick, onDeleteClick }: {
  assetId: string; canEdit: boolean; onAddClick: () => void;
  onEditClick: (t: any) => void; onDeleteClick: (t: any) => void;
}) {
  const { data: tires = [], isLoading } = useQuery<any[]>({
    queryKey: ['ga-vehicle-tires', assetId],
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}/tires`)).data,
  });

  const activeTiresMap = useMemo(() => {
    const map = new Map<string, any>();
    tires.filter((t) => t.status === 'ACTIVE').forEach((t) => map.set(t.position, t));
    return map;
  }, [tires]);

  // Layout visual kendaraan standar (grid)
  const renderTireVisual = (position: string, label: string) => {
    const tire = activeTiresMap.get(position);
    return (
      <div className={cn(
        'border rounded-lg p-3 flex flex-col items-center justify-between text-center transition-colors min-h-[110px]',
        tire ? 'border-teal-200 bg-teal-50/50' : 'border-dashed border-gray-200 bg-gray-50/20'
      )}>
        <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
        {tire ? (
          <div className="my-1.5 min-w-0 w-full">
            <span className="block font-bold text-gray-800 text-sm truncate">{tire.brand}</span>
            <span className="block font-mono text-xs text-teal-700 font-semibold truncate bg-white border border-teal-100 rounded px-1 py-0.5 mt-0.5" title="Nomor Seri Ban (DOT/Pabrik)">
              SN: {tire.serialNumber}
            </span>
            {tire.installedOdometer != null && (
              <span className="block text-[10px] text-gray-500 mt-1">Mulai: {tire.installedOdometer.toLocaleString('id-ID')} km</span>
            )}
          </div>
        ) : (
          <span className="text-xs text-gray-300 my-auto">— Kosong —</span>
        )}
        {canEdit && tire && (
          <button onClick={() => onEditClick(tire)} className="text-[10px] font-medium text-teal-600 hover:text-teal-700 mt-1">
            Ubah / Lepas
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Visual Layout Ban */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Car size={16} className="text-teal-600" /> Posisi Ban Aktif (Penangkal Tukar Ban)
          </h2>
          {canEdit && (
            <button onClick={onAddClick} className="btn-primary bg-teal-600 hover:bg-teal-700">
              <Plus size={14} /> Pasang Ban Baru
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="py-12 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" /></div>
        ) : (
          <div className="space-y-4">
            {/* Grid layout ban (Depan & Belakang) */}
            <div className="max-w-md mx-auto border border-gray-100 bg-gray-50/50 rounded-2xl p-6">
              {/* As Roda Depan */}
              <div className="grid grid-cols-2 gap-16 mb-8">
                {renderTireVisual('DEPAN_KIRI', 'Depan Kiri')}
                {renderTireVisual('DEPAN_KANAN', 'Depan Kanan')}
              </div>
              
              {/* Batang Chasis Penghubung */}
              <div className="w-1.5 h-16 bg-gray-200 mx-auto -my-8 mb-4 rounded-full"></div>

              {/* As Roda Belakang Truk (Support tipe engkel atau double luar/dalam) */}
              <div className="grid grid-cols-2 gap-16">
                {/* Belakang Kiri (Double atau Engkel) */}
                <div className="space-y-2">
                  {activeTiresMap.has('BELAKANG_KIRI_LUAR') || activeTiresMap.has('BELAKANG_KIRI_DALAM') ? (
                    <>
                      {renderTireVisual('BELAKANG_KIRI_LUAR', 'Belakang Kiri Luar')}
                      {renderTireVisual('BELAKANG_KIRI_DALAM', 'Belakang Kiri Dalam')}
                    </>
                  ) : (
                    renderTireVisual('BELAKANG_KIRI', 'Belakang Kiri')
                  )}
                </div>
                {/* Belakang Kanan (Double atau Engkel) */}
                <div className="space-y-2">
                  {activeTiresMap.has('BELAKANG_KANAN_LUAR') || activeTiresMap.has('BELAKANG_KANAN_DALAM') ? (
                    <>
                      {renderTireVisual('BELAKANG_KANAN_LUAR', 'Belakang Kanan Luar')}
                      {renderTireVisual('BELAKANG_KANAN_DALAM', 'Belakang Kanan Dalam')}
                    </>
                  ) : (
                    renderTireVisual('BELAKANG_KANAN', 'Belakang Kanan')
                  )}
                </div>
              </div>

              {/* Ban Cadangan */}
              <div className="mt-8 pt-6 border-t border-gray-200/60 max-w-[180px] mx-auto">
                {renderTireVisual('CADANGAN', 'Ban Cadangan')}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Histori Ban */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Histori Seluruh Ban</h2>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Posisi</th><th>Nomor Seri</th><th>Merek</th><th>Tanggal Pasang</th>
                <th className="text-right">Odometer Pasang</th><th className="text-center">Status</th><th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {tires.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">Belum ada data histori ban.</td></tr>
              ) : tires.map((t) => (
                <tr key={t.id}>
                  <td><span className="font-medium text-gray-800">{TIRE_POSITION_LABELS[t.position] ?? t.position}</span></td>
                  <td><span className="font-mono text-xs text-teal-700 bg-teal-50 border border-teal-100 px-1.5 py-0.5 rounded font-semibold">{t.serialNumber}</span></td>
                  <td className="text-gray-700">{t.brand} {t.model}</td>
                  <td className="text-gray-500 whitespace-nowrap">{formatDate(t.installedAt)}</td>
                  <td className="text-right font-mono text-gray-600">{t.installedOdometer != null ? t.installedOdometer.toLocaleString('id-ID') : '—'}</td>
                  <td className="text-center">
                    <span className={cn(
                      'inline-block text-xs font-medium px-2 py-0.5 rounded-full',
                      t.status === 'ACTIVE' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200'
                    )}>
                      {TIRE_STATUS_LABELS[t.status] ?? t.status}
                    </span>
                  </td>
                  <td>
                    {canEdit && (
                      <button onClick={() => onDeleteClick(t)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors" title="Hapus">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TireModal({ assetId, editRecord, onClose, onSaved }: { assetId: string; editRecord?: any | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = !!editRecord;
  const [f, setF] = useState(() => editRecord ? {
    serialNumber: editRecord.serialNumber, brand: editRecord.brand, model: editRecord.model ?? '',
    size: editRecord.size ?? '', position: editRecord.position,
    installedAt: editRecord.installedAt ? editRecord.installedAt.slice(0, 10) : '',
    installedOdometer: editRecord.installedOdometer != null ? String(editRecord.installedOdometer) : '',
    notes: editRecord.notes ?? '', status: editRecord.status,
  } : { serialNumber: '', brand: '', model: '', size: '', position: 'DEPAN_KIRI', installedAt: '', installedOdometer: '', notes: '', status: 'ACTIVE' });

  const mut = useMutation({
    mutationFn: () => isEdit
      ? api.patch(`/ga/vehicle/assets/${assetId}/tires/${editRecord.id}`, {
          serialNumber: f.serialNumber, brand: f.brand, model: f.model || null,
          size: f.size || null, position: f.position, installedAt: f.installedAt,
          installedOdometer: numOrNull(f.installedOdometer), notes: f.notes || null, status: f.status,
        })
      : api.post(`/ga/vehicle/assets/${assetId}/tires`, {
          serialNumber: f.serialNumber, brand: f.brand, model: f.model || null,
          size: f.size || null, position: f.position, installedAt: f.installedAt,
          installedOdometer: numOrNull(f.installedOdometer), notes: f.notes || null, status: f.status,
        }),
    onSuccess: () => { toast.success(isEdit ? 'Data ban diperbarui.' : 'Ban baru dipasang.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal simpan data ban.'),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };

  return (
    <ModalShell title={isEdit ? 'Ubah Status / Posisi Ban' : 'Pasang Ban Baru'} icon={<Wrench size={16} className="text-teal-600" />} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-3">
        <Field label="Nomor Seri Ban *" value={f.serialNumber} onChange={(v) => setF({ ...f, serialNumber: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Merek *" value={f.brand} onChange={(v) => setF({ ...f, brand: v })} />
          <Field label="Model / Tipe" value={f.model} onChange={(v) => setF({ ...f, model: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Ukuran (Ring/Lebar)" value={f.size} onChange={(v) => setF({ ...f, size: v })} />
          <SelectField label="Posisi Roda *" value={f.position} onChange={(v) => setF({ ...f, position: v })} options={TIRE_POSITIONS} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal Pasang *" type="date" value={f.installedAt} onChange={(v) => setF({ ...f, installedAt: v })} />
          <Field label="Odometer Pasang" type="number" value={f.installedOdometer} onChange={(v) => setF({ ...f, installedOdometer: v })} />
        </div>
        <SelectField label="Status Ban" value={f.status} onChange={(v) => setF({ ...f, status: v })} options={['ACTIVE', 'SPARE', 'ARCHIVED']} />
        <Field label="Catatan" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="submit" disabled={mut.isPending || !f.serialNumber || !f.brand || !f.installedAt} className="btn-primary bg-teal-600 hover:bg-teal-700">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ═══════════════════════════════════════════════════════════════════
// MONITORING OLI (Oil Panel & Modal)
// ═══════════════════════════════════════════════════════════════════

function OilMonitoringPanel({ assetId, canEdit, odometerTerakhir, onAddClick, onDeleteClick }: {
  assetId: string; canEdit: boolean; odometerTerakhir: number;
  onAddClick: () => void; onDeleteClick: (log: any) => void;
}) {
  const { data: logs = [], isLoading } = useQuery<any[]>({
    queryKey: ['ga-vehicle-oil', assetId],
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}/oil-logs`)).data,
  });

  const latestLog = logs[0] ?? null;

  // Kalkulasi sisa umur oli (meter & visual progress bar)
  const oilAge = useMemo(() => {
    if (!latestLog) return null;
    const totalDuration = latestLog.nextOdometerDue - latestLog.odometer;
    
    const remaining = latestLog.nextOdometerDue - odometerTerakhir;
    const pct = totalDuration > 0 ? Math.max(0, Math.min(100, (remaining / totalDuration) * 100)) : 0;
    return { remaining, pct, isOverdue: remaining < 0 };
  }, [latestLog, odometerTerakhir]);

  return (
    <div className="space-y-4">
      {/* Visual Status Oli */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <Fuel size={16} className="text-teal-600" /> Status Umur Oli
          </h2>
          {canEdit && (
            <button onClick={onAddClick} className="btn-primary bg-teal-600 hover:bg-teal-700">
              <Plus size={14} /> Ganti Oli Baru
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" /></div>
        ) : !latestLog ? (
          <div className="py-8 text-center text-gray-400 text-sm">
            <Fuel size={24} className="mx-auto mb-2 text-gray-200" />
            Belum ada histori penggantian oli.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm bg-gray-50 border border-gray-100 rounded-xl p-4">
              <div><p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Merek Oli</p><p className="font-bold text-gray-800">{latestLog.brand}</p></div>
              <div><p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Volume</p><p className="font-bold text-gray-800">{Number(latestLog.volume)} Liter</p></div>
              <div><p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Odo Ganti</p><p className="font-mono text-gray-700">{latestLog.odometer.toLocaleString('id-ID')} km</p></div>
              <div><p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Target Odo Berikutnya</p><p className="font-mono text-teal-700 font-semibold">{latestLog.nextOdometerDue.toLocaleString('id-ID')} km</p></div>
            </div>

            {oilAge && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500">Odometer Terakhir: <strong className="font-mono">{odometerTerakhir.toLocaleString('id-ID')} km</strong></span>
                  <span className={cn('font-semibold', oilAge.isOverdue ? 'text-red-600' : 'text-teal-600')}>
                    {oilAge.isOverdue
                      ? `Lewat target ${Math.abs(oilAge.remaining).toLocaleString('id-ID')} km! 🔴`
                      : `Sisa ${oilAge.remaining.toLocaleString('id-ID')} km lagi`
                    }
                  </span>
                </div>
                <div className="w-full bg-gray-200 h-2 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full transition-all duration-500', oilAge.isOverdue ? 'bg-red-500' : oilAge.pct < 20 ? 'bg-amber-500' : 'bg-green-500')}
                    style={{ width: `${oilAge.pct}%` }}
                  ></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Histori Ganti Oli */}
      <div className="card p-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Riwayat Penggantian Oli</h2>
        </div>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tanggal</th><th>Merek Oli</th><th className="text-right">Volume</th>
                <th className="text-right">Odometer Ganti</th><th className="text-right">Target Berikutnya</th>
                <th>Catatan</th><th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {logs.length === 0 ? (
                <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">Belum ada riwayat ganti oli.</td></tr>
              ) : logs.map((l) => (
                <tr key={l.id}>
                  <td className="text-gray-500 whitespace-nowrap">{formatDate(l.tanggal)}</td>
                  <td className="font-semibold text-gray-800">{l.brand}</td>
                  <td className="text-right text-gray-600">{Number(l.volume)} L</td>
                  <td className="text-right font-mono text-gray-600">{l.odometer.toLocaleString('id-ID')} km</td>
                  <td className="text-right font-mono text-teal-700 font-medium">{l.nextOdometerDue.toLocaleString('id-ID')} km</td>
                  <td className="text-gray-600 text-sm">{l.notes || '—'}</td>
                  <td>
                    {canEdit && (
                      <button onClick={() => onDeleteClick(l)} className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors" title="Hapus">
                        <Trash2 size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OilModal({ assetId, onClose, onSaved }: { assetId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ tanggal: '', odometer: '', nextOdometerDue: '', brand: '', volume: '', notes: '' });

  // Auto-hitung target berikutnya (+5.000 km sebagai standard interval oli)
  useEffect(() => {
    const o = Number(f.odometer);
    if (o > 0 && !f.nextOdometerDue) {
      setF((prev) => ({ ...prev, nextOdometerDue: String(o + 5000) }));
    }
  }, [f.odometer]);

  const mut = useMutation({
    mutationFn: () => api.post(`/ga/vehicle/assets/${assetId}/oil-logs`, {
      tanggal: f.tanggal, odometer: Number(f.odometer), nextOdometerDue: Number(f.nextOdometerDue),
      brand: f.brand, volume: Number(f.volume), notes: f.notes || null,
    }),
    onSuccess: () => { toast.success('Log ganti oli disimpan.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal simpan log oli.'),
  });

  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };

  return (
    <ModalShell title="Ganti Oli Baru" icon={<Fuel size={16} className="text-teal-600" />} onClose={onClose}>
      <form onSubmit={submit} className="p-5 space-y-3">
        <Field label="Tanggal *" type="date" value={f.tanggal} onChange={(v) => setF({ ...f, tanggal: v })} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Odometer Saat Ini *" type="number" value={f.odometer} onChange={(v) => setF({ ...f, odometer: v })} />
          <Field label="Target Odo Berikutnya *" type="number" value={f.nextOdometerDue} onChange={(v) => setF({ ...f, nextOdometerDue: v })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Merek Oli *" value={f.brand} onChange={(v) => setF({ ...f, brand: v })} />
          <Field label="Volume (Liter) *" type="number" step="0.01" value={f.volume} onChange={(v) => setF({ ...f, volume: v })} />
        </div>
        <Field label="Catatan" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="submit" disabled={mut.isPending || !f.tanggal || !f.odometer || !f.nextOdometerDue || !f.brand || !f.volume} className="btn-primary bg-teal-600 hover:bg-teal-700">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
