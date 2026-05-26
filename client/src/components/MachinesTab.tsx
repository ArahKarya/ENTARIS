import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Edit2, Trash2, X, Cog, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface Machine {
  id: string;
  code: string;
  name: string;
  idealRatePerHour: string | number | null;
  unit: string;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  code: string;
  name: string;
  idealRatePerHour: string;
  unit: string;
  notes: string;
  isActive: boolean;
}

const blankForm: FormState = {
  code: '',
  name: '',
  idealRatePerHour: '',
  unit: 'kg',
  notes: '',
  isActive: true,
};

const fmtRate = (v: string | number | null) =>
  v == null ? null : Number(v).toLocaleString('id-ID', { maximumFractionDigits: 3 });

interface Props {
  userRole: string;
}

export default function MachinesTab({ userRole }: Props) {
  const canEdit = userRole === 'Admin' || userRole === 'Accountant';
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Machine | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ['machines-all'],
    queryFn: () => api.get('/inventory/machines').then(r => r.data),
  });
  const machines: Machine[] = raw?.data ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['machines-all'] });
    queryClient.invalidateQueries({ queryKey: ['machines-active'] });
  };

  const handleOpenAdd = () => { setEditTarget(null); setModalOpen(true); };
  const handleOpenEdit = (m: Machine) => { setEditTarget(m); setModalOpen(true); };

  const handleDelete = async (m: Machine) => {
    if (!confirm(`Hapus mesin "${m.name}"? Jika sudah dipakai produksi, hapus akan ditolak.`)) return;
    setDeletingId(m.id);
    try {
      const res = await api.delete(`/inventory/machines/${m.id}`);
      toast.success(res.data?.message || 'Mesin dihapus.');
      invalidate();
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menghapus mesin.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-sky-100 bg-sky-50/60 px-4 py-3 flex items-start gap-3">
        <div className="shrink-0 p-1.5 rounded-lg bg-sky-100 text-sky-700">
          <Cog size={15} />
        </div>
        <div className="text-sm leading-relaxed">
          <p className="font-semibold text-sky-900">
            Master Mesin
            <span className="text-sky-500 font-normal"> (OEE)</span>
          </p>
          <p className="text-sky-800/80 mt-0.5">
            Daftar mesin produksi beserta kapasitas ideal (kg/jam). Dipakai untuk menghitung
            Performance pada OEE (Overall Equipment Effectiveness) saat input produksi.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {machines.length > 0 && (
            <>
              <span className="font-medium text-gray-700">{machines.length}</span> mesin
              {' · '}
              <span className="text-emerald-600">{machines.filter(m => m.isActive).length} aktif</span>
            </>
          )}
        </div>
        {canEdit && (
          <button onClick={handleOpenAdd} className="btn-primary">
            <Plus size={15} /> Mesin Baru
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-gray-300" />
        </div>
      ) : machines.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-2 text-gray-300">
            <Cog size={16} />
          </div>
          <p className="text-sm text-gray-500">Belum ada master mesin.</p>
          {canEdit && (
            <p className="text-xs text-gray-400 mt-1">
              Klik <span className="font-semibold text-gray-600">Mesin Baru</span> untuk menambahkan
              (mis. Mesin Pellet 1).
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {machines.map(m => {
              const rate = fmtRate(m.idealRatePerHour);
              return (
                <li
                  key={m.id}
                  className={cn(
                    'px-4 py-3 hover:bg-gray-50/60 transition-colors',
                    !m.isActive && 'opacity-50',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-[11px] text-gray-400">{m.code}</span>
                        <span className="font-medium text-gray-900 text-sm">{m.name}</span>
                        {!m.isActive && (
                          <span className="badge badge-gray text-[10px]">Nonaktif</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {rate != null
                          ? <>Kapasitas ideal: <span className="font-medium text-gray-700">{rate} {m.unit}/jam</span></>
                          : <span className="text-amber-600">Kapasitas ideal belum diisi — Performance OEE tidak terhitung</span>}
                      </p>
                      {m.notes && (
                        <p className="text-xs text-gray-400 mt-0.5">{m.notes}</p>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => handleOpenEdit(m)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => handleDelete(m)}
                          disabled={deletingId === m.id}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                          title="Hapus"
                        >
                          {deletingId === m.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Trash2 size={14} />}
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {modalOpen && (
        <MachineFormModal
          editTarget={editTarget}
          onClose={() => setModalOpen(false)}
          onSaved={() => { invalidate(); setModalOpen(false); }}
        />
      )}
    </div>
  );
}

interface FormModalProps {
  editTarget: Machine | null;
  onClose: () => void;
  onSaved: () => void;
}

function MachineFormModal({ editTarget, onClose, onSaved }: FormModalProps) {
  const isEdit = !!editTarget;
  const [form, setForm] = useState<FormState>(() => {
    if (!editTarget) return blankForm;
    return {
      code: editTarget.code,
      name: editTarget.name,
      idealRatePerHour: editTarget.idealRatePerHour != null ? String(Number(editTarget.idealRatePerHour)) : '',
      unit: editTarget.unit ?? 'kg',
      notes: editTarget.notes ?? '',
      isActive: editTarget.isActive,
    };
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && !saving) onClose();
  }, [saving, onClose]);
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleSubmit = async () => {
    setError(null);
    if (!form.code.trim()) { setError('Kode mesin wajib diisi.'); return; }
    if (!form.name.trim()) { setError('Nama mesin wajib diisi.'); return; }
    setSaving(true);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        idealRatePerHour: form.idealRatePerHour.trim() ? Number(form.idealRatePerHour) : null,
        unit: form.unit.trim() || 'kg',
        notes: form.notes.trim() || null,
        isActive: form.isActive,
      };
      if (isEdit) {
        await api.put(`/inventory/machines/${editTarget!.id}`, payload);
        toast.success('Mesin diperbarui.');
      } else {
        await api.post('/inventory/machines', payload);
        toast.success('Mesin dibuat.');
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Gagal menyimpan mesin.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
    >
      <div
        className="rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[95vh] overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-sky-50 text-sky-600">
              <Cog size={16} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {isEdit ? 'Edit Mesin' : 'Mesin Baru'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Master mesin untuk perhitungan OEE
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-4 overflow-y-auto">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Kode <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={form.code}
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                placeholder="MESIN-PELLET-01"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Satuan
              </label>
              <input
                type="text"
                value={form.unit}
                onChange={e => setForm(f => ({ ...f, unit: e.target.value }))}
                placeholder="kg"
                className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-gray-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nama Mesin <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Mesin Pellet 1"
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Kapasitas Ideal ({form.unit || 'kg'}/jam)
            </label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={form.idealRatePerHour}
              onChange={e => setForm(f => ({ ...f, idealRatePerHour: e.target.value }))}
              placeholder="Misal: 1000"
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500 placeholder:text-gray-400"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Output maksimal mesin per jam. Dipakai untuk komponen Performance OEE.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Catatan
            </label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              placeholder="Keterangan tambahan..."
              rows={2}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none placeholder:text-gray-400"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={e => setForm(f => ({ ...f, isActive: e.target.checked }))}
              className="rounded border-gray-300 text-sky-600 focus:ring-sky-500 w-4 h-4"
            />
            <span className="text-sm text-gray-700">Mesin aktif</span>
          </label>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
              <AlertCircle size={15} /> <span>{error}</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-2">
          <button onClick={onClose} disabled={saving} className="btn-secondary">Batal</button>
          <button
            onClick={handleSubmit}
            disabled={!form.code.trim() || !form.name.trim() || saving}
            className="btn-primary disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {isEdit ? 'Simpan Perubahan' : 'Simpan Mesin'}
          </button>
        </div>
      </div>
    </div>
  );
}
