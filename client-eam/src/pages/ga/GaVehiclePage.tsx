// GA Kendaraan — pilih aset, kelola data kendaraan (1-1, upsert via PUT),
// service log (1-many) dan pengajuan service (approval flow).
import { useState, useMemo, useEffect } from 'react';
import type { FormEvent } from 'react';
import {
  Search, Car, Loader2, Save, Plus, Trash2, Wrench, ClipboardList,
  Check, X, XCircle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { can, cap } from '../../lib/permissions';
import { formatRupiah, formatDate } from '../../lib/formatters';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { toast } from 'sonner';

const FUEL_TYPES = ['BENSIN', 'SOLAR', 'PERTAMAX', 'PERTALITE', 'DEX', 'LPG', 'LISTRIK', 'HYBRID', 'LAINNYA'] as const;
const SERVICE_TYPES = ['OLI', 'TUNE_UP', 'SERVIS_BERKALA', 'PERBAIKAN', 'GANTI_BAN', 'ELEKTRIKAL', 'AC', 'LAINNYA'] as const;
const URGENCIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

const SR_STATUS_BADGE: Record<string, string> = {
  SUBMITTED: 'badge-yellow', APPROVED: 'badge-green', REJECTED: 'badge-red',
  CANCELLED: 'badge-gray', DONE: 'badge-blue',
};

interface Asset { id: string; code: string; name: string; category?: { name?: string } | null }

const numOrNull = (v: string): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

export const GaVehiclePage = () => {
  const queryClient = useQueryClient();
  const canEdit = can('ga_vehicle', 'edit');
  const canApprove = cap('approval.decide');

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [deleteLog, setDeleteLog] = useState<{ id: string; label: string } | null>(null);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

  // ── Assets list ───────────────────────────────────────────────────
  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ['ga-assets'],
    queryFn: async () => (await api.get('/ga/assets', { params: { limit: 500, categoryId: 'cmq7ja1dc000001lpil7negq7' } })).data,
  });

  const filteredAssets = useMemo(() => {
    if (!search) return assets;
    const q = search.toLowerCase();
    return assets.filter((a) => a.code?.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q));
  }, [assets, search]);

  const selectedAsset = assets.find((a) => a.id === selectedId) ?? null;

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

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Kendaraan</h1>
        <p className="text-sm text-gray-500 mt-0.5">Data kendaraan, riwayat service, dan pengajuan service per aset.</p>
      </div>

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
        <div className="space-y-5">
          {!selectedAsset ? (
            <div className="card py-20 text-center text-gray-400">
              <Car className="w-10 h-10 mx-auto mb-2 text-gray-200" />
              <p className="text-sm">Pilih aset di kiri untuk melihat data kendaraan.</p>
            </div>
          ) : (
            <>
              {/* Vehicle data form */}
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

              {/* Service logs */}
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

              {/* Service requests */}
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
    </div>
  );
};

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
function ModalShell({ title, icon, onClose, children }: { title: string; icon: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
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
