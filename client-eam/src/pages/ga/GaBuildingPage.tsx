// GA Bangunan — pilih aset, kelola data bangunan (1-1, upsert via PUT)
// dan sewa/rental (1-many, masuk/keluar).
import { useState, useMemo, useEffect } from 'react';
import type { FormEvent } from 'react';
import {
  Search, Building2, Loader2, Save, Plus, KeyRound, X, StopCircle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { can } from '../../lib/permissions';
import { formatRupiah, formatDate } from '../../lib/formatters';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { toast } from 'sonner';

const BUILDING_TYPES = ['KANTOR', 'GUDANG', 'PABRIK', 'RUMAH', 'MESS', 'RUKO', 'LAINNYA'] as const;
const OWNERSHIP = ['MILIK_SENDIRI', 'SEWA_MASUK', 'SEWA_KELUAR', 'PINJAM_PAKAI'] as const;
const CERT_TYPES = ['HM', 'HGB', 'HGU', 'HP_AKTA', 'GIRIK', 'BELUM_SERTIFIKAT'] as const;
const RENTAL_ARAH = ['SEWA_MASUK', 'SEWA_KELUAR'] as const;
const RENTAL_PERIODE = ['BULANAN', 'TAHUNAN'] as const;

interface Asset { id: string; code: string; name: string; category?: { name?: string } | null }

const numOrNull = (v: string): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

export const GaBuildingPage = () => {
  const queryClient = useQueryClient();
  const canEdit = can('ga_building', 'edit');

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showRentalModal, setShowRentalModal] = useState(false);
  const [endTarget, setEndTarget] = useState<{ id: string; label: string } | null>(null);

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ['ga-assets', 'gedung'],
    queryFn: async () => (await api.get('/ga/assets', { params: { limit: 500, categoryId: 'cmq6bx8z30003vvqjbog7voys,cmq7ja1kg000401lp4k5obtk8' } })).data,
  });

  const filteredAssets = useMemo(() => {
    if (!search) return assets;
    const q = search.toLowerCase();
    return assets.filter((a) => a.code?.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q));
  }, [assets, search]);

  // Auto-select aset pertama begitu daftar termuat -- klik modul langsung
  // tampilkan datanya tanpa perlu klik manual salah satu baris dulu.
  useEffect(() => {
    if (selectedId && filteredAssets.some((a) => a.id === selectedId)) return;
    if (filteredAssets.length > 0) setSelectedId(filteredAssets[0]!.id);
    else if (filteredAssets.length === 0) setSelectedId(null);
  }, [filteredAssets, selectedId]);

  const selectedAsset = assets.find((a) => a.id === selectedId) ?? null;

  const { data: buildingData, isLoading: bdLoading } = useQuery({
    queryKey: ['ga-building', selectedId],
    queryFn: async () => (await api.get(`/ga/building/assets/${selectedId}`)).data,
    enabled: !!selectedId,
  });

  useEffect(() => {
    const d = buildingData ?? {};
    setForm({
      jenis: d.jenis ?? 'KANTOR', ownership: d.ownership ?? 'MILIK_SENDIRI',
      luasTanah: d.luasTanah != null ? String(d.luasTanah) : '',
      luasBangunan: d.luasBangunan != null ? String(d.luasBangunan) : '',
      jumlahLantai: d.jumlahLantai != null ? String(d.jumlahLantai) : '',
      tahunBangun: d.tahunBangun != null ? String(d.tahunBangun) : '',
      tahunRenovasi: d.tahunRenovasi != null ? String(d.tahunRenovasi) : '',
      alamatLengkap: d.alamatLengkap ?? '', kelurahan: d.kelurahan ?? '', kecamatan: d.kecamatan ?? '',
      kota: d.kota ?? '', provinsi: d.provinsi ?? '', kodePos: d.kodePos ?? '',
      certificateType: d.certificateType ?? '', certificateNumber: d.certificateNumber ?? '',
      njopTanah: d.njopTanah != null ? String(d.njopTanah) : '',
      njopBangunan: d.njopBangunan != null ? String(d.njopBangunan) : '',
      notes: d.notes ?? '',
    });
  }, [buildingData, selectedId]);

  const saveData = useMutation({
    mutationFn: () => api.put(`/ga/building/assets/${selectedId}`, {
      jenis: form.jenis, ownership: form.ownership,
      luasTanah: numOrNull(form.luasTanah), luasBangunan: numOrNull(form.luasBangunan),
      jumlahLantai: numOrNull(form.jumlahLantai), tahunBangun: numOrNull(form.tahunBangun),
      tahunRenovasi: numOrNull(form.tahunRenovasi), alamatLengkap: form.alamatLengkap || null,
      kelurahan: form.kelurahan || null, kecamatan: form.kecamatan || null, kota: form.kota || null,
      provinsi: form.provinsi || null, kodePos: form.kodePos || null,
      certificateType: form.certificateType || null, certificateNumber: form.certificateNumber || null,
      njopTanah: numOrNull(form.njopTanah), njopBangunan: numOrNull(form.njopBangunan),
      notes: form.notes || null,
    }),
    onSuccess: () => {
      toast.success('Data bangunan disimpan.');
      queryClient.invalidateQueries({ queryKey: ['ga-building', selectedId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal simpan data bangunan.'),
  });

  const { data: rentals = [] } = useQuery<any[]>({
    queryKey: ['ga-building-rentals', selectedId],
    queryFn: async () => (await api.get(`/ga/building/assets/${selectedId}/rentals`)).data,
    enabled: !!selectedId,
  });

  const endRental = useMutation({
    mutationFn: (rid: string) => api.patch(`/ga/building/assets/${selectedId}/rentals/${rid}/end`),
    onSuccess: () => {
      toast.success('Sewa diakhiri.');
      queryClient.invalidateQueries({ queryKey: ['ga-building-rentals', selectedId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal akhiri sewa.'),
  });

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Bangunan & Tanah</h1>
        <p className="text-sm text-gray-500 mt-0.5">Data properti, sertifikat, dan kontrak sewa per aset.</p>
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
              <div className="py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
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
              <Building2 className="w-10 h-10 mx-auto mb-2 text-gray-200" />
              <p className="text-sm">Pilih aset di kiri untuk melihat data bangunan.</p>
            </div>
          ) : (
            <>
              {/* Building data form */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <Building2 size={16} className="text-teal-600" /> Data Bangunan — {selectedAsset.name}
                  </h2>
                  {canEdit && (
                    <button onClick={() => saveData.mutate()} disabled={saveData.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700">
                      {saveData.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
                    </button>
                  )}
                </div>
                {bdLoading ? (
                  <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin mx-auto text-gray-300" /></div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <SelectField label="Jenis" value={form.jenis} onChange={(v) => setForm({ ...form, jenis: v })} disabled={!canEdit} options={BUILDING_TYPES} allowEmpty={false} />
                    <SelectField label="Kepemilikan" value={form.ownership} onChange={(v) => setForm({ ...form, ownership: v })} disabled={!canEdit} options={OWNERSHIP} allowEmpty={false} />
                    <Field label="Jumlah Lantai" type="number" value={form.jumlahLantai} onChange={(v) => setForm({ ...form, jumlahLantai: v })} disabled={!canEdit} />
                    <Field label="Luas Tanah (m²)" type="number" value={form.luasTanah} onChange={(v) => setForm({ ...form, luasTanah: v })} disabled={!canEdit} />
                    <Field label="Luas Bangunan (m²)" type="number" value={form.luasBangunan} onChange={(v) => setForm({ ...form, luasBangunan: v })} disabled={!canEdit} />
                    <Field label="Tahun Bangun" type="number" value={form.tahunBangun} onChange={(v) => setForm({ ...form, tahunBangun: v })} disabled={!canEdit} />
                    <Field label="Tahun Renovasi" type="number" value={form.tahunRenovasi} onChange={(v) => setForm({ ...form, tahunRenovasi: v })} disabled={!canEdit} />
                    <SelectField label="Jenis Sertifikat" value={form.certificateType} onChange={(v) => setForm({ ...form, certificateType: v })} disabled={!canEdit} options={CERT_TYPES} />
                    <Field label="No. Sertifikat" value={form.certificateNumber} onChange={(v) => setForm({ ...form, certificateNumber: v })} disabled={!canEdit} />
                    <Field label="NJOP Tanah" type="number" value={form.njopTanah} onChange={(v) => setForm({ ...form, njopTanah: v })} disabled={!canEdit} />
                    <Field label="NJOP Bangunan" type="number" value={form.njopBangunan} onChange={(v) => setForm({ ...form, njopBangunan: v })} disabled={!canEdit} />
                    <div className="col-span-2 md:col-span-3">
                      <Field label="Alamat Lengkap" value={form.alamatLengkap} onChange={(v) => setForm({ ...form, alamatLengkap: v })} disabled={!canEdit} />
                    </div>
                    <Field label="Kelurahan" value={form.kelurahan} onChange={(v) => setForm({ ...form, kelurahan: v })} disabled={!canEdit} />
                    <Field label="Kecamatan" value={form.kecamatan} onChange={(v) => setForm({ ...form, kecamatan: v })} disabled={!canEdit} />
                    <Field label="Kota" value={form.kota} onChange={(v) => setForm({ ...form, kota: v })} disabled={!canEdit} />
                    <Field label="Provinsi" value={form.provinsi} onChange={(v) => setForm({ ...form, provinsi: v })} disabled={!canEdit} />
                    <Field label="Kode Pos" value={form.kodePos} onChange={(v) => setForm({ ...form, kodePos: v })} disabled={!canEdit} />
                    <div className="col-span-2 md:col-span-3">
                      <Field label="Catatan" value={form.notes} onChange={(v) => setForm({ ...form, notes: v })} disabled={!canEdit} />
                    </div>
                  </div>
                )}
              </div>

              {/* Rentals */}
              <div className="card p-0 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                    <KeyRound size={16} className="text-teal-600" /> Kontrak Sewa
                  </h2>
                  {canEdit && (
                    <button onClick={() => setShowRentalModal(true)} className="btn-primary bg-teal-600 hover:bg-teal-700">
                      <Plus size={14} /> Tambah
                    </button>
                  )}
                </div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th className="text-center">Arah</th><th>Pihak</th>
                        <th className="text-right">Nilai Sewa</th><th>Periode</th>
                        <th>Mulai</th><th>Akhir</th><th className="text-center">Status</th><th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rentals.length === 0 ? (
                        <tr><td colSpan={8} className="py-10 text-center text-sm text-gray-400">Belum ada kontrak sewa.</td></tr>
                      ) : rentals.map((r) => {
                        const isActive = r.status === 'AKTIF';
                        return (
                          <tr key={r.id} className={isActive ? '' : 'opacity-60'}>
                            <td className="text-center">
                              <span className={`badge ${r.arah === 'SEWA_MASUK' ? 'badge-green' : 'badge-blue'}`}>
                                {r.arah === 'SEWA_MASUK' ? 'Masuk' : 'Keluar'}
                              </span>
                            </td>
                            <td className="font-medium text-gray-800">{r.pihak}{r.kontak && <span className="block text-[11px] text-gray-400">{r.kontak}</span>}</td>
                            <td className="text-right font-mono tabular-nums text-gray-900">{formatRupiah(Number(r.nilaiSewa))}</td>
                            <td className="text-gray-600">{r.periode === 'BULANAN' ? 'Bulanan' : 'Tahunan'}</td>
                            <td className="text-gray-500 whitespace-nowrap">{formatDate(r.tanggalMulai)}</td>
                            <td className="text-gray-500 whitespace-nowrap">{formatDate(r.tanggalAkhir)}</td>
                            <td className="text-center"><span className={`badge ${isActive ? 'badge-green' : 'badge-gray'}`}>{r.status}</span></td>
                            <td>
                              {canEdit && isActive && (
                                <button onClick={() => setEndTarget({ id: r.id, label: `${r.pihak}` })}
                                  className="p-1.5 hover:bg-amber-50 rounded text-gray-400 hover:text-amber-600 transition-colors" title="Akhiri sewa">
                                  <StopCircle size={15} />
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {showRentalModal && selectedId && (
        <RentalModal
          assetId={selectedId}
          onClose={() => setShowRentalModal(false)}
          onSaved={() => {
            setShowRentalModal(false);
            queryClient.invalidateQueries({ queryKey: ['ga-building-rentals', selectedId] });
          }}
        />
      )}

      <ConfirmDialog
        open={endTarget !== null}
        onCancel={() => setEndTarget(null)}
        onConfirm={() => { if (endTarget) { endRental.mutate(endTarget.id); setEndTarget(null); } }}
        title="Akhiri Kontrak Sewa"
        message={`Akhiri kontrak sewa dengan ${endTarget?.label}? Status akan berubah menjadi BERAKHIR.`}
        confirmLabel="Ya, Akhiri"
        variant="danger"
      />
    </div>
  );
};

// ── Field helpers ─────────────────────────────────────────────────────
interface FieldProps { label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean }
function Field({ label, value, onChange, type = 'text', disabled }: FieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      <input
        type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-500"
      />
    </label>
  );
}

interface SelectFieldProps { label: string; value: string; onChange: (v: string) => void; options: readonly string[]; disabled?: boolean; allowEmpty?: boolean }
function SelectField({ label, value, onChange, options, disabled, allowEmpty = true }: SelectFieldProps) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      <select
        value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 disabled:bg-gray-50 disabled:text-gray-500"
      >
        {allowEmpty && <option value="">—</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function RentalModal({ assetId, onClose, onSaved }: { assetId: string; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    arah: 'SEWA_MASUK', pihak: '', kontak: '', nilaiSewa: '', periode: 'BULANAN', tanggalMulai: '', tanggalAkhir: '', notes: '',
  });
  const mut = useMutation({
    mutationFn: () => api.post(`/ga/building/assets/${assetId}/rentals`, {
      arah: f.arah, pihak: f.pihak, kontak: f.kontak || null, nilaiSewa: numOrNull(f.nilaiSewa) ?? 0,
      periode: f.periode, tanggalMulai: f.tanggalMulai, tanggalAkhir: f.tanggalAkhir, notes: f.notes || null,
    }),
    onSuccess: () => { toast.success('Kontrak sewa ditambahkan.'); onSaved(); },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal simpan kontrak sewa.'),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); mut.mutate(); };
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><KeyRound size={16} className="text-teal-600" /> Tambah Kontrak Sewa</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400"><X size={18} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <SelectField label="Arah" value={f.arah} onChange={(v) => setF({ ...f, arah: v })} options={RENTAL_ARAH} allowEmpty={false} />
            <SelectField label="Periode" value={f.periode} onChange={(v) => setF({ ...f, periode: v })} options={RENTAL_PERIODE} allowEmpty={false} />
          </div>
          <Field label="Pihak" value={f.pihak} onChange={(v) => setF({ ...f, pihak: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kontak" value={f.kontak} onChange={(v) => setF({ ...f, kontak: v })} />
            <Field label="Nilai Sewa" type="number" value={f.nilaiSewa} onChange={(v) => setF({ ...f, nilaiSewa: v })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tanggal Mulai" type="date" value={f.tanggalMulai} onChange={(v) => setF({ ...f, tanggalMulai: v })} />
            <Field label="Tanggal Akhir" type="date" value={f.tanggalAkhir} onChange={(v) => setF({ ...f, tanggalAkhir: v })} />
          </div>
          <Field label="Catatan" value={f.notes} onChange={(v) => setF({ ...f, notes: v })} />
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg">Batal</button>
            <button type="submit" disabled={mut.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700">
              {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
