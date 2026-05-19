import { useState, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Edit2, Trash2, X, GitBranch, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';

interface ProductionProcess {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface FormState {
  name: string;
  description: string;
  sortOrder: string;
}

const blankForm: FormState = { name: '', description: '', sortOrder: '0' };

interface Props {
  userRole: string;
}

export default function ProductionProcessesTab({ userRole }: Props) {
  const canEdit = userRole === 'Admin' || userRole === 'Accountant';
  const queryClient = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ProductionProcess | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: raw, isLoading } = useQuery({
    queryKey: ['production-processes-all'],
    queryFn: () => api.get('/inventory/production-processes').then(r => r.data),
  });
  const processes: ProductionProcess[] = raw?.data ?? [];

  const handleOpenAdd = () => { setEditTarget(null); setModalOpen(true); };
  const handleOpenEdit = (p: ProductionProcess) => { setEditTarget(p); setModalOpen(true); };

  const handleDelete = async (p: ProductionProcess) => {
    if (!confirm(`Hapus proses "${p.name}"? Jika sudah dipakai produksi, akan dinonaktifkan.`)) return;
    setDeletingId(p.id);
    try {
      const res = await api.delete(`/inventory/production-processes/${p.id}`);
      toast.success(res.data?.message || 'Proses dihapus.');
      queryClient.invalidateQueries({ queryKey: ['production-processes-all'] });
      queryClient.invalidateQueries({ queryKey: ['production-processes-active'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Gagal menghapus proses.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-purple-100 bg-purple-50/60 px-4 py-3 flex items-start gap-3">
        <div className="shrink-0 p-1.5 rounded-lg bg-purple-100 text-purple-700">
          <GitBranch size={15} />
        </div>
        <div className="text-sm leading-relaxed">
          <p className="font-semibold text-purple-900">
            Master Proses Produksi
            <span className="text-purple-500 font-normal"> (traceability)</span>
          </p>
          <p className="text-purple-800/80 mt-0.5">
            Daftar proses yang bisa dipilih staff saat input produksi (mis. Drying, Huller, Polishing,
            Packing). Hanya untuk informasi/traceability — tidak ada perhitungan biaya atau pergerakan
            stok yang menempel ke proses.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500">
          {processes.length > 0 && (
            <>
              <span className="font-medium text-gray-700">{processes.length}</span> proses
              {' · '}
              <span className="text-emerald-600">{processes.filter(p => p.isActive).length} aktif</span>
            </>
          )}
        </div>
        {canEdit && (
          <button onClick={handleOpenAdd} className="btn-primary">
            <Plus size={15} /> Proses Baru
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-gray-300" />
        </div>
      ) : processes.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-10 text-center">
          <div className="mx-auto w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center mb-2 text-gray-300">
            <GitBranch size={16} />
          </div>
          <p className="text-sm text-gray-500">Belum ada master proses.</p>
          {canEdit && (
            <p className="text-xs text-gray-400 mt-1">
              Klik <span className="font-semibold text-gray-600">Proses Baru</span> untuk menambahkan
              (mis. Drying, Huller, Polishing, Packing).
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <ul className="divide-y divide-gray-100">
            {processes.map(p => (
              <li
                key={p.id}
                className={cn(
                  'px-4 py-3 hover:bg-gray-50/60 transition-colors',
                  !p.isActive && 'opacity-50',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900 text-sm">{p.name}</span>
                      {!p.isActive && (
                        <span className="badge badge-gray text-[10px]">Nonaktif</span>
                      )}
                      <span className="text-[10px] text-gray-400">
                        urutan: {p.sortOrder}
                      </span>
                    </div>
                    {p.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
                    )}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={() => handleOpenEdit(p)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDelete(p)}
                        disabled={deletingId === p.id}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
                        title="Hapus"
                      >
                        {deletingId === p.id
                          ? <Loader2 size={14} className="animate-spin" />
                          : <Trash2 size={14} />}
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {modalOpen && (
        <ProcessFormModal
          editTarget={editTarget}
          onClose={() => setModalOpen(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['production-processes-all'] });
            queryClient.invalidateQueries({ queryKey: ['production-processes-active'] });
            setModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

interface FormModalProps {
  editTarget: ProductionProcess | null;
  onClose: () => void;
  onSaved: () => void;
}

function ProcessFormModal({ editTarget, onClose, onSaved }: FormModalProps) {
  const isEdit = !!editTarget;
  const [form, setForm] = useState<FormState>(() => {
    if (!editTarget) return blankForm;
    return {
      name: editTarget.name,
      description: editTarget.description ?? '',
      sortOrder: String(editTarget.sortOrder),
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
    if (!form.name.trim()) {
      setError('Nama proses wajib diisi.');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        description: form.description.trim() || null,
        sortOrder: Number(form.sortOrder) || 0,
      };
      if (isEdit) {
        await api.put(`/inventory/production-processes/${editTarget!.id}`, payload);
        toast.success('Proses diperbarui.');
      } else {
        await api.post('/inventory/production-processes', payload);
        toast.success('Proses dibuat.');
      }
      onSaved();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Gagal menyimpan proses.');
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
            <div className="p-2 rounded-lg bg-purple-50 text-purple-600">
              <GitBranch size={16} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {isEdit ? 'Edit Proses Produksi' : 'Proses Produksi Baru'}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Master traceability — tidak posting GL atau stok
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

        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Nama Proses <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Drying / Huller / Polishing / Packing"
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Keterangan
            </label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Mis. Mengeringkan gabah pakai mesin dryer vertical sampai kadar air 14%"
              rows={2}
              className="w-full border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none placeholder:text-gray-400"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Urutan Tampil
            </label>
            <input
              type="number"
              value={form.sortOrder}
              onChange={e => setForm(f => ({ ...f, sortOrder: e.target.value }))}
              className="w-32 border border-gray-200 rounded-lg py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-[11px] text-gray-400 mt-1">
              Angka kecil tampil duluan di multiselect saat input produksi.
            </p>
          </div>

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
            disabled={!form.name.trim() || saving}
            className="btn-primary disabled:opacity-40"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : null}
            {isEdit ? 'Simpan Perubahan' : 'Simpan Proses'}
          </button>
        </div>
      </div>
    </div>
  );
}
