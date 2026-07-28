// GA Equipment (alat timbang) — pilih aset, kelola data equipment (1-1, upsert
// via PUT) + log kalibrasi (1-many). Pola sama dgn GaBuildingPage.
import { useState, useMemo, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Search, ScanLine, Loader2, Save, Plus, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { can } from '../../lib/permissions';
import { formatRupiah, formatDate } from '../../lib/formatters';
import { AssetPhotoSection } from '../../components/AssetPhotoSection';
import { toast } from 'sonner';

const UNITS = ['KG', 'GRAM', 'TON', 'LBS'] as const;
const CAL_MODES = ['ON_SITE', 'SHIPPED'] as const;
const CAL_RESULTS = ['PASS', 'FAIL', 'CONDITIONAL'] as const;

interface Asset { id: string; code: string; name: string; category?: { name?: string } | null }

const numOrNull = (v: string): number | null => {
  if (v === '' || v == null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
};

const RESULT_BADGE: Record<string, string> = { PASS: 'badge-green', FAIL: 'badge-red', CONDITIONAL: 'badge-yellow' };

export const GaEquipmentPage = () => {
  const queryClient = useQueryClient();
  const canEdit = can('ga_equipment', 'edit');

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [showCalModal, setShowCalModal] = useState(false);

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ['ga-assets', 'equipment'],
    queryFn: async () => {
      const res = await api.get('/ga/assets', { params: { limit: 500, categoryId: 'cmq7ja1lo000501lpk8lwwi2q' } });
      return res.data?.data ?? res.data ?? [];
    },
  });

  const filtered = useMemo(() => {
    if (!search) return assets;
    const q = search.toLowerCase();
    return assets.filter((a) => a.code?.toLowerCase().includes(q) || a.name?.toLowerCase().includes(q));
  }, [assets, search]);

  // Auto-select aset pertama begitu daftar termuat -- klik modul langsung
  // tampilkan datanya tanpa perlu klik manual salah satu baris dulu.
  useEffect(() => {
    if (selectedId && filtered.some((a) => a.id === selectedId)) return;
    if (filtered.length > 0) setSelectedId(filtered[0]!.id);
    else if (filtered.length === 0) setSelectedId(null);
  }, [filtered, selectedId]);

  const { data: equip, isLoading: equipLoading } = useQuery({
    queryKey: ['ga-equipment', selectedId],
    queryFn: async () => {
      const res = await api.get(`/ga/equipment/assets/${selectedId}`);
      return res.data ?? null;
    },
    enabled: !!selectedId,
  });

  const { data: calLogs = [] } = useQuery<any[]>({
    queryKey: ['ga-calibration', selectedId],
    queryFn: async () => {
      const res = await api.get(`/ga/equipment/assets/${selectedId}/calibration-logs`);
      return res.data?.data ?? res.data ?? [];
    },
    enabled: !!selectedId,
  });

  useEffect(() => {
    if (equip) {
      setForm({
        maxCapacity: equip.maxCapacity?.toString() ?? '',
        unit: equip.unit ?? '',
        accuracy: equip.accuracy?.toString() ?? '',
        classLabel: equip.classLabel ?? '',
        defaultCalibrator: equip.defaultCalibrator ?? '',
        intervalMonths: equip.intervalMonths?.toString() ?? '12',
        lastCalibratedAt: equip.lastCalibratedAt ? equip.lastCalibratedAt.slice(0, 10) : '',
        notes: equip.notes ?? '',
      });
    } else if (selectedId) {
      setForm({ intervalMonths: '12' });
    }
  }, [equip, selectedId]);

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/ga/equipment/assets/${selectedId}`, {
      maxCapacity: numOrNull(form.maxCapacity || ''),
      unit: form.unit || null,
      accuracy: numOrNull(form.accuracy || ''),
      classLabel: form.classLabel || null,
      defaultCalibrator: form.defaultCalibrator || null,
      intervalMonths: numOrNull(form.intervalMonths || '') ?? 12,
      lastCalibratedAt: form.lastCalibratedAt || null,
      notes: form.notes || null,
    }),
    onSuccess: () => {
      toast.success('Data equipment tersimpan.');
      queryClient.invalidateQueries({ queryKey: ['ga-equipment', selectedId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal menyimpan.'),
  });

  const set = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="space-y-5 pb-8">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">Equipment & Kalibrasi</h1>
        <p className="text-sm text-gray-500 mt-0.5">Data alat timbang & riwayat kalibrasi per aset.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        {/* Daftar aset */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari aset..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div className="max-h-[70vh] overflow-y-auto">
            {assetsLoading ? (
              <div className="p-6 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
            ) : filtered.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-400">Tidak ada aset.</p>
            ) : filtered.map((a) => (
              <button key={a.id} onClick={() => setSelectedId(a.id)}
                className={`w-full text-left px-4 py-2.5 border-b border-gray-50 hover:bg-gray-50 ${selectedId === a.id ? 'bg-blue-50' : ''}`}>
                <p className="text-sm font-medium text-gray-800">{a.name}</p>
                <p className="text-xs text-gray-400 font-mono">{a.code}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Panel */}
        <div className="space-y-5">
          {!selectedId ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center text-gray-400">
              <ScanLine className="w-10 h-10 mx-auto mb-2 text-gray-200" />
              Pilih aset untuk mengelola data equipment & kalibrasi.
            </div>
          ) : equipLoading ? (
            <div className="bg-white border border-gray-200 rounded-xl p-12 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-gray-300" /></div>
          ) : (
            <>
              <div className="bg-white border border-gray-200 rounded-xl p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-4">Data Equipment</h2>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Kapasitas Maks"><input type="number" step="0.001" value={form.maxCapacity || ''} onChange={(e) => set('maxCapacity', e.target.value)} disabled={!canEdit} className="inp" /></Field>
                  <Field label="Satuan"><select value={form.unit || ''} onChange={(e) => set('unit', e.target.value)} disabled={!canEdit} className="inp"><option value="">—</option>{UNITS.map((u) => <option key={u} value={u}>{u}</option>)}</select></Field>
                  <Field label="Akurasi"><input type="number" step="0.0001" value={form.accuracy || ''} onChange={(e) => set('accuracy', e.target.value)} disabled={!canEdit} className="inp" /></Field>
                  <Field label="Kelas"><input value={form.classLabel || ''} onChange={(e) => set('classLabel', e.target.value)} disabled={!canEdit} className="inp" /></Field>
                  <Field label="Lembaga Kalibrator Default"><input value={form.defaultCalibrator || ''} onChange={(e) => set('defaultCalibrator', e.target.value)} disabled={!canEdit} className="inp" /></Field>
                  <Field label="Interval (bulan)"><input type="number" value={form.intervalMonths || ''} onChange={(e) => set('intervalMonths', e.target.value)} disabled={!canEdit} className="inp" /></Field>
                  <Field label="Terakhir Kalibrasi"><input type="date" value={form.lastCalibratedAt || ''} onChange={(e) => set('lastCalibratedAt', e.target.value)} disabled={!canEdit} className="inp" /></Field>
                  <Field label="Jatuh Tempo Berikutnya"><input type="date" value={equip?.nextCalibrationDue ? equip.nextCalibrationDue.slice(0, 10) : ''} disabled className="inp bg-gray-50" /></Field>
                  <div className="sm:col-span-2"><Field label="Catatan"><input value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} disabled={!canEdit} className="inp" /></Field></div>
                </div>
                {canEdit && (
                  <div className="mt-4 flex justify-end">
                    <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="btn-primary">
                      {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Simpan
                    </button>
                  </div>
                )}
              </div>

              <AssetPhotoSection assetId={selectedId} canEdit={canEdit} />

              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
                  <h2 className="text-sm font-semibold text-gray-900">Riwayat Kalibrasi</h2>
                  {canEdit && <button onClick={() => setShowCalModal(true)} className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"><Plus size={13} /> Tambah</button>}
                </div>
                <div className="table-responsive">
                  <table className="data-table">
                    <thead><tr><th>Tanggal</th><th>Lembaga</th><th>No. Sertifikat</th><th className="text-center">Hasil</th><th>Berlaku s/d</th><th className="text-right">Biaya</th></tr></thead>
                    <tbody>
                      {calLogs.length === 0 ? (
                        <tr><td colSpan={6} className="py-8 text-center text-gray-400 text-sm">Belum ada log kalibrasi.</td></tr>
                      ) : calLogs.map((l) => (
                        <tr key={l.id}>
                          <td className="whitespace-nowrap text-gray-500">{formatDate(l.tanggal)}</td>
                          <td>{l.lembaga}</td>
                          <td className="font-mono text-xs">{l.noSertifikat}</td>
                          <td className="text-center"><span className={`badge ${RESULT_BADGE[l.hasil] ?? 'badge-gray'}`}>{l.hasil}</span></td>
                          <td className="whitespace-nowrap text-gray-500">{formatDate(l.validUntil)}</td>
                          <td className="text-right font-mono tabular-nums">{l.biaya ? formatRupiah(Number(l.biaya)) : '—'}</td>
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

      {showCalModal && selectedId && (
        <CalibrationModal assetId={selectedId} onClose={() => setShowCalModal(false)}
          onSaved={() => { queryClient.invalidateQueries({ queryKey: ['ga-calibration', selectedId] }); queryClient.invalidateQueries({ queryKey: ['ga-equipment', selectedId] }); setShowCalModal(false); }} />
      )}

      <style>{`.inp{width:100%;border:1px solid #e5e7eb;border-radius:.5rem;padding:.5rem .75rem;font-size:.875rem}.inp:focus{outline:none;box-shadow:0 0 0 2px #3b82f6}`}</style>
    </div>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function CalibrationModal({ assetId, onClose, onSaved }: { assetId: string; onClose: () => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [f, setF] = useState<Record<string, string>>({ tanggal: today, mode: 'ON_SITE', hasil: 'PASS', validUntil: '' });
  const [err, setErr] = useState('');
  const set = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));

  const mutation = useMutation({
    mutationFn: () => api.post(`/ga/equipment/assets/${assetId}/calibration-logs`, {
      tanggal: f.tanggal, lembaga: f.lembaga, noSertifikat: f.noSertifikat, mode: f.mode,
      biaya: numOrNull(f.biaya || ''), hasil: f.hasil, deviasi: f.deviasi || null,
      rangeTested: f.rangeTested || null, validUntil: f.validUntil,
    }),
    onSuccess: () => { toast.success('Log kalibrasi tersimpan.'); onSaved(); },
    onError: (e: any) => setErr(e.response?.data?.error || 'Gagal menyimpan.'),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.lembaga || !f.noSertifikat || !f.validUntil) { setErr('Lembaga, no. sertifikat, dan masa berlaku wajib diisi.'); return; }
    mutation.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <form onSubmit={submit} className="bg-white rounded-xl w-full max-w-lg shadow-2xl max-h-[95vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h3 className="font-semibold text-gray-900">Tambah Log Kalibrasi</h3>
          <button type="button" onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X size={18} /></button>
        </div>
        <div className="p-5 grid sm:grid-cols-2 gap-4">
          <Field label="Tanggal"><input type="date" value={f.tanggal || ''} onChange={(e) => set('tanggal', e.target.value)} className="inp" /></Field>
          <Field label="Berlaku s/d"><input type="date" value={f.validUntil || ''} onChange={(e) => set('validUntil', e.target.value)} className="inp" /></Field>
          <Field label="Lembaga"><input value={f.lembaga || ''} onChange={(e) => set('lembaga', e.target.value)} className="inp" /></Field>
          <Field label="No. Sertifikat"><input value={f.noSertifikat || ''} onChange={(e) => set('noSertifikat', e.target.value)} className="inp" /></Field>
          <Field label="Mode"><select value={f.mode} onChange={(e) => set('mode', e.target.value)} className="inp">{CAL_MODES.map((m) => <option key={m} value={m}>{m}</option>)}</select></Field>
          <Field label="Hasil"><select value={f.hasil} onChange={(e) => set('hasil', e.target.value)} className="inp">{CAL_RESULTS.map((r) => <option key={r} value={r}>{r}</option>)}</select></Field>
          <Field label="Biaya"><input type="number" value={f.biaya || ''} onChange={(e) => set('biaya', e.target.value)} className="inp" /></Field>
          <Field label="Range Diuji"><input value={f.rangeTested || ''} onChange={(e) => set('rangeTested', e.target.value)} className="inp" /></Field>
          <div className="sm:col-span-2"><Field label="Deviasi"><input value={f.deviasi || ''} onChange={(e) => set('deviasi', e.target.value)} className="inp" /></Field></div>
          {err && <div className="sm:col-span-2 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg p-2">{err}</div>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t bg-gray-50">
          <button type="button" onClick={onClose} className="btn-secondary">Batal</button>
          <button type="submit" disabled={mutation.isPending} className="btn-primary">{mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Simpan'}</button>
        </div>
      </form>
    </div>
  );
}
