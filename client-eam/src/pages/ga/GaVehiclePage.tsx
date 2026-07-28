// GA Kendaraan — fleet management lengkap: pilih aset, kelola data
// kendaraan (1-1), driver assignment, pajak/STNK/KIR, asuransi, log BBM,
// inspeksi berkala, insiden/kecelakaan, riwayat service, dan pengajuan
// service (approval flow). Dashboard armada (KPI cards) di atas.
import { useState, useMemo, useEffect } from 'react';
import type { FormEvent } from 'react';
import {
  Search, Car, Loader2, Save, Plus, Trash2, Wrench, ClipboardList,
  Check, X, XCircle, UserCog, FileWarning, ShieldCheck, Fuel,
  ClipboardCheck, TriangleAlert, TrendingUp, Users,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { cn } from '../../lib/utils';
import { can, cap } from '../../lib/permissions';
import { formatRupiah, formatDate } from '../../lib/formatters';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { AssetPhotoSection } from '../../components/AssetPhotoSection';
import SearchableSelect from '../../components/SearchableSelect';
import { toast } from 'sonner';

const FUEL_TYPES = ['BENSIN', 'SOLAR', 'PERTAMAX', 'PERTALITE', 'DEX', 'LPG', 'LISTRIK', 'HYBRID', 'LAINNYA'] as const;
const SERVICE_TYPES = ['OLI', 'TUNE_UP', 'SERVIS_BERKALA', 'PERBAIKAN', 'GANTI_BAN', 'ELEKTRIKAL', 'AC', 'LAINNYA'] as const;
const URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

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
  ban: 'Ban', rem: 'Rem', oli: 'Oli', lampu: 'Lampu', klakson: 'Klakson', wiper: 'Wiper',
  kaca_spion: 'Kaca Spion', sabuk_pengaman: 'Sabuk Pengaman', ac: 'AC', aki: 'Aki',
  radiator: 'Radiator', kelengkapan_p3k_apar: 'Kelengkapan P3K/APAR',
};

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
type Tab = 'data' | 'pajak' | 'asuransi' | 'bbm' | 'inspeksi' | 'insiden' | 'service';

const numOrNull = (v: string): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

// Dipakai untuk deteksi jatuh tempo di badge tanggal (pajak/asuransi): merah
// kalau sudah lewat, kuning kalau <=30 hari lagi, abu kalau masih aman.
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
  const [showTaxModal, setShowTaxModal] = useState(false);
  const [showInsuranceModal, setShowInsuranceModal] = useState(false);
  const [showFuelModal, setShowFuelModal] = useState(false);
  const [showInspectionModal, setShowInspectionModal] = useState(false);
  const [showIncidentModal, setShowIncidentModal] = useState<{ id: string } | null | 'new'>(null);
  const [deleteLog, setDeleteLog] = useState<{ id: string; label: string } | null>(null);
  const [deleteTax, setDeleteTax] = useState<{ id: string; label: string } | null>(null);
  const [deleteInsurance, setDeleteInsurance] = useState<{ id: string; label: string } | null>(null);
  const [deleteFuel, setDeleteFuel] = useState<{ id: string; label: string } | null>(null);
  const [deleteInspection, setDeleteInspection] = useState<{ id: string; label: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

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
    { key: 'insiden', label: 'Insiden', icon: <TriangleAlert size={14} /> },
    { key: 'service', label: 'Service', icon: <Wrench size={14} /> },
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

              {/* ── TAB: Data & Driver ── */}
              {tab === 'data' && (
                <>
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-4">
                      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Car size={16} className="text-teal-600" /> Data Kendaraan — {selectedAsset.name}
                      </h2>
                      {canEdit && (
                        <button onClick={() => saveData.mutate()} disabled={saveData.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700">
                          {saveData.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
                        </button>
                      )}
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
                      <button onClick={() => setShowTaxModal(true)} className="btn-primary bg-teal-600 hover:bg-teal-700">
                        <Plus size={14} /> Tambah
                      </button>
                    )}
                  </div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Jenis</th><th className="text-center">Tahun</th><th>Jatuh Tempo</th>
                          <th className="text-right">Biaya</th><th className="text-center">Status</th><th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {taxes.length === 0 ? (
                          <tr><td colSpan={6} className="py-10 text-center text-sm text-gray-400">Belum ada data pajak/STNK.</td></tr>
                        ) : taxes.map((t: any) => (
                          <tr key={t.id}>
                            <td><span className="badge badge-blue">{TAX_TYPE_LABELS[t.type] ?? t.type}</span></td>
                            <td className="text-center text-gray-600">{t.periodYear}</td>
                            <td className={cn('whitespace-nowrap text-sm', dueBadgeClass(t.dueDate, t.status === 'ACTIVE'))}>{formatDate(t.dueDate)}</td>
                            <td className="text-right font-mono tabular-nums text-gray-900">{t.amount != null ? formatRupiah(Number(t.amount)) : '—'}</td>
                            <td className="text-center"><span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', t.status === 'ACTIVE' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : t.status === 'EXPIRED' ? 'bg-red-50 text-red-700 ring-1 ring-red-200' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200')}>{t.status}</span></td>
                            <td>
                              {canEdit && (
                                <button onClick={() => setDeleteTax({ id: t.id, label: `${TAX_TYPE_LABELS[t.type]} ${t.periodYear}` })}
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

              {/* ── TAB: Asuransi ── */}
              {tab === 'asuransi' && (
                <div className="card p-0 overflow-hidden">
                  <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                      <ShieldCheck size={16} className="text-teal-600" /> Asuransi Kendaraan
                    </h2>
                    {canEdit && (
                      <button onClick={() => setShowInsuranceModal(true)} className="btn-primary bg-teal-600 hover:bg-teal-700">
                        <Plus size={14} /> Tambah
                      </button>
                    )}
                  </div>
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Jenis</th><th>Penyedia</th><th>No. Polis</th><th>Berlaku Hingga</th>
                          <th className="text-right">Premi</th><th className="text-center">Status</th><th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {insurances.length === 0 ? (
                          <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">Belum ada data asuransi.</td></tr>
                        ) : insurances.map((ins: any) => (
                          <tr key={ins.id}>
                            <td><span className="badge badge-blue">{INSURANCE_TYPE_LABELS[ins.type] ?? ins.type}</span></td>
                            <td className="text-gray-700">{ins.provider}</td>
                            <td className="text-gray-600 font-mono text-xs">{ins.policyNumber ?? '—'}</td>
                            <td className={cn('whitespace-nowrap text-sm', dueBadgeClass(ins.endDate, ins.status === 'ACTIVE'))}>{formatDate(ins.endDate)}</td>
                            <td className="text-right font-mono tabular-nums text-gray-900">{ins.premium != null ? formatRupiah(Number(ins.premium)) : '—'}</td>
                            <td className="text-center"><span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', ins.status === 'ACTIVE' ? 'bg-green-50 text-green-700 ring-1 ring-green-200' : 'bg-gray-100 text-gray-500 ring-1 ring-gray-200')}>{ins.status}</span></td>
                            <td>
                              {canEdit && (
                                <button onClick={() => setDeleteInsurance({ id: ins.id, label: `${ins.provider} — ${ins.policyNumber ?? ''}` })}
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
                  <div className="table-responsive">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Tanggal</th><th className="text-right">Odometer</th><th className="text-center">Hasil</th>
                          <th>Catatan</th><th className="w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {inspections.length === 0 ? (
                          <tr><td colSpan={5} className="py-10 text-center text-sm text-gray-400">Belum ada data inspeksi.</td></tr>
                        ) : inspections.map((insp: any) => (
                          <tr key={insp.id}>
                            <td className="text-gray-500 whitespace-nowrap">{formatDate(insp.tanggal)}</td>
                            <td className="text-right font-mono tabular-nums text-gray-600">{insp.odometer != null ? insp.odometer.toLocaleString('id-ID') : '—'}</td>
                            <td className="text-center"><span className={cn('inline-block text-xs font-medium px-2 py-0.5 rounded-full', INSPECTION_RESULT_BADGE[insp.overallResult])}>{INSPECTION_RESULT_LABELS[insp.overallResult] ?? insp.overallResult}</span></td>
                            <td className="text-gray-600 text-sm">{insp.notes || '—'}</td>
                            <td>
                              {canEdit && (
                                <button onClick={() => setDeleteInspection({ id: insp.id, label: formatDate(insp.tanggal) })}
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
                    <div className="flex items-center justify-between p-4 border-b border-gray-100">
                      <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                        <Wrench size={16} className="text-teal-600" /> Riwayat Service
                      </h2>
                      {canEdit && (
                        <button onClick={() => setShowServiceModal(true)} className="btn-primary bg-teal-600 hover:bg-teal-700">
                          <Plus size={14} /> Tambah
                        </button>
                      )}
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
                          {serviceLogs.length === 0 ? (
                            <tr><td colSpan={7} className="py-10 text-center text-sm text-gray-400">Belum ada riwayat service.</td></tr>
                          ) : serviceLogs.map((l) => (
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
          onClose={() => setShowTaxModal(false)}
          onSaved={() => { setShowTaxModal(false); queryClient.invalidateQueries({ queryKey: ['ga-vehicle-taxes', selectedId] }); queryClient.invalidateQueries({ queryKey: ['ga-fleet-summary'] }); }}
        />
      )}

      {/* Insurance modal */}
      {showInsuranceModal && selectedId && (
        <InsuranceModal
          assetId={selectedId}
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
    </div>
  );
};

// ── Fleet KPI card ──────────────────────────────────────────────────
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
interface FieldProps { label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean }
function Field({ label, value, onChange, type = 'text', disabled }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      <input
        type={type} value={value} disabled={disabled}
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

function TaxModal({ assetId, onClose, onSaved }: { assetId: string; onClose: () => void; onSaved: () => void }) {
  const currentYear = new Date().getFullYear();
  const [f, setF] = useState({ type: 'STNK_TAHUNAN', periodYear: String(currentYear), amount: '', paidAt: '', dueDate: '', status: 'ACTIVE', notes: '' });
  const mut = useMutation({
    mutationFn: () => api.post(`/ga/vehicle/assets/${assetId}/taxes`, {
      type: f.type, periodYear: Number(f.periodYear), amount: numOrNull(f.amount),
      paidAt: f.paidAt || null, dueDate: f.dueDate, status: f.status, notes: f.notes || null,
    }),
    onSuccess: () => { toast.success('Data pajak ditambahkan.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal simpan data pajak.'),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };
  return (
    <ModalShell title="Tambah Data Pajak/STNK" icon={<FileWarning size={16} className="text-teal-600" />} onClose={onClose}>
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
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="submit" disabled={mut.isPending || !f.dueDate} className="btn-primary bg-teal-600 hover:bg-teal-700">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function InsuranceModal({ assetId, onClose, onSaved }: { assetId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ type: 'ALL_RISK', provider: '', policyNumber: '', premium: '', coverageValue: '', startDate: '', endDate: '', status: 'ACTIVE', notes: '' });
  const mut = useMutation({
    mutationFn: () => api.post(`/ga/vehicle/assets/${assetId}/insurances`, {
      type: f.type, provider: f.provider, policyNumber: f.policyNumber || null,
      premium: numOrNull(f.premium), coverageValue: numOrNull(f.coverageValue),
      startDate: f.startDate, endDate: f.endDate, status: f.status, notes: f.notes || null,
    }),
    onSuccess: () => { toast.success('Data asuransi ditambahkan.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal simpan data asuransi.'),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };
  return (
    <ModalShell title="Tambah Data Asuransi" icon={<ShieldCheck size={16} className="text-teal-600" />} onClose={onClose} wide>
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
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
          <button type="submit" disabled={mut.isPending || !f.provider || !f.startDate || !f.endDate} className="btn-primary bg-teal-600 hover:bg-teal-700">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
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
  const { data: checkpoints = [] } = useQuery<string[]>({
    queryKey: ['ga-inspection-checkpoints'],
    queryFn: async () => (await api.get('/ga/vehicle/inspection-checkpoints')).data,
  });
  const [tanggal, setTanggal] = useState('');
  const [odometer, setOdometer] = useState('');
  const [notes, setNotes] = useState('');
  const [checklist, setChecklist] = useState<Record<string, 'OK' | 'PERLU_PERHATIAN' | 'RUSAK'>>({});

  const overallResult = useMemo(() => {
    const values = Object.values(checklist);
    if (values.some((v) => v === 'RUSAK')) return 'TIDAK_LAYAK';
    if (values.some((v) => v === 'PERLU_PERHATIAN')) return 'PERLU_PERHATIAN';
    return 'BAIK';
  }, [checklist]);

  const mut = useMutation({
    mutationFn: () => api.post(`/ga/vehicle/assets/${assetId}/inspections`, {
      tanggal, odometer: numOrNull(odometer), checklist, overallResult, notes: notes || null,
    }),
    onSuccess: () => { toast.success('Inspeksi disimpan.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal simpan inspeksi.'),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };
  const setPoint = (key: string, value: 'OK' | 'PERLU_PERHATIAN' | 'RUSAK') => setChecklist((prev) => ({ ...prev, [key]: value }));

  return (
    <ModalShell title="Inspeksi Berkala" icon={<ClipboardCheck size={16} className="text-teal-600" />} onClose={onClose} wide>
      <form onSubmit={submit} className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tanggal" type="date" value={tanggal} onChange={setTanggal} />
          <Field label="Odometer" type="number" value={odometer} onChange={setOdometer} />
        </div>

        <div>
          <span className="block text-xs font-medium text-gray-500 mb-2">Checklist Komponen</span>
          <div className="grid grid-cols-2 gap-2">
            {checkpoints.map((cp) => (
              <div key={cp} className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg">
                <span className="text-sm text-gray-700">{CHECKPOINT_LABELS[cp] ?? cp}</span>
                <div className="flex items-center gap-1">
                  {(['OK', 'PERLU_PERHATIAN', 'RUSAK'] as const).map((v) => (
                    <button
                      key={v} type="button" onClick={() => setPoint(cp, v)}
                      className={cn(
                        'text-[10px] font-medium px-2 py-1 rounded-full',
                        checklist[cp] === v
                          ? v === 'OK' ? 'bg-green-600 text-white' : v === 'PERLU_PERHATIAN' ? 'bg-amber-500 text-white' : 'bg-red-600 text-white'
                          : 'bg-gray-100 text-gray-500 hover:bg-gray-200',
                      )}
                    >
                      {v === 'OK' ? 'OK' : v === 'PERLU_PERHATIAN' ? 'Perhatian' : 'Rusak'}
                    </button>
                  ))}
                </div>
              </div>
            ))}
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
          <button type="submit" disabled={mut.isPending || !tanggal} className="btn-primary bg-teal-600 hover:bg-teal-700">
            {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
          </button>
        </div>
      </form>
    </ModalShell>
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
