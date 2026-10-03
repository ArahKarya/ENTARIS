import { useState, useEffect } from 'react';
import { Plus, Edit3, Trash2, Loader2, Warehouse as WhIcon, Star } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { toast } from 'sonner';
import { cn } from '../lib/utils';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

interface Warehouse {
  id: string;
  code: string;
  name: string;
  location: string | null;
  description: string | null;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  itemCount?: number;
  totalStock?: number;
}

export const Warehouses = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Warehouse | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Warehouse | null>(null);

  const queryClient = useQueryClient();

  const { data: warehouses, isLoading } = useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const res = await api.get('/warehouses');
      return res.data.data as Warehouse[];
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/warehouses/${id}`),
    onSuccess: () => {
      toast.success('Gudang dihapus.');
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error ?? 'Gagal hapus gudang.'),
  });

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Gudang</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Master gudang fisik/logis untuk pemisahan stok per lokasi.</p>
        </div>
        <button
          className="btn-primary self-start"
          onClick={() => { setEditTarget(null); setIsModalOpen(true); }}
        >
          <Plus size={15} /> Tambah Gudang
        </button>
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Kode</th>
                <th>Nama</th>
                <th>Lokasi</th>
                <th className="text-right">Jumlah Item</th>
                <th className="text-right">Total Stok</th>
                <th className="text-center">Status</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-16 text-center text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                </td></tr>
              ) : !warehouses || warehouses.length === 0 ? (
                <tr><td colSpan={7} className="py-16 text-center">
                  <WhIcon className="w-10 h-10 text-muted-foreground mx-auto mb-2 opacity-40" />
                  <p className="text-sm text-muted-foreground">Belum ada gudang.</p>
                </td></tr>
              ) : (
                warehouses.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <span className="font-mono text-xs text-foreground bg-muted px-1.5 py-0.5 rounded">{w.code}</span>
                    </td>
                    <td>
                      <p className="font-medium text-foreground inline-flex items-center gap-1.5">
                        {w.name}
                        {w.isDefault && <Star size={12} className="text-amber-500 fill-amber-500" />}
                      </p>
                      {w.description && <p className="text-xs text-muted-foreground">{w.description}</p>}
                    </td>
                    <td className="text-xs text-muted-foreground">{w.location ?? '—'}</td>
                    <td className="text-right font-mono tabular-nums">{w.itemCount ?? 0}</td>
                    <td className="text-right font-mono tabular-nums">
                      {Number(w.totalStock ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 3 })}
                    </td>
                    <td className="text-center">
                      <span className={cn('badge', w.isActive ? 'badge-green' : 'badge-gray')}>
                        {w.isActive ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => { setEditTarget(w); setIsModalOpen(true); }}
                          className="p-1.5 hover:bg-accent rounded text-muted-foreground hover:text-foreground"
                          aria-label="Edit gudang"
                        >
                          <Edit3 size={14} />
                        </button>
                        {!w.isDefault && (
                          <button
                            onClick={() => setDeleteTarget(w)}
                            className="p-1.5 hover:bg-red-50 rounded text-red-500 hover:text-red-600"
                            aria-label="Hapus gudang"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <WarehouseModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditTarget(null); }}
        editTarget={editTarget}
      />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Hapus Gudang"
        message={`Yakin hapus gudang "${deleteTarget?.name}"? Hanya bisa dihapus kalau tidak ada stok & belum pernah dipakai transaksi.`}
        confirmLabel="Ya, Hapus"
        variant="danger"
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => { if (deleteTarget) deleteMut.mutate(deleteTarget.id); }}
      />
    </div>
  );
};

export default Warehouses;

// ─── Modal ───────────────────────────────────────────────────────────────
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  editTarget: Warehouse | null;
}

function WarehouseModal({ isOpen, onClose, editTarget }: ModalProps) {
  useBodyScrollLock(isOpen);
  const isEdit = Boolean(editTarget?.id);
  const queryClient = useQueryClient();

  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  const [sortOrder, setSortOrder] = useState(0);
  const [error, setError] = useState('');

  // Hydrate form whenever the modal opens (with or without edit target).
  useEffect(() => {
    if (!isOpen) return;
    if (editTarget) {
      setCode(editTarget.code);
      setName(editTarget.name);
      setLocation(editTarget.location ?? '');
      setDescription(editTarget.description ?? '');
      setIsActive(editTarget.isActive);
      setIsDefault(editTarget.isDefault);
      setSortOrder(editTarget.sortOrder ?? 0);
    } else {
      setCode(''); setName(''); setLocation(''); setDescription('');
      setIsActive(true); setIsDefault(false); setSortOrder(0);
    }
    setError('');
  }, [isOpen, editTarget?.id]);

  const mutation = useMutation({
    mutationFn: async (data: any) => {
      const url = isEdit ? `/warehouses/${editTarget!.id}` : '/warehouses';
      const method = isEdit ? 'put' : 'post';
      const res = await api[method](url, data);
      return res.data;
    },
    onSuccess: () => {
      toast.success(isEdit ? 'Gudang diperbarui.' : 'Gudang ditambahkan.');
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      onClose();
    },
    onError: (e: any) => setError(e.response?.data?.error ?? 'Gagal simpan gudang.'),
  });

  const handleSubmit = () => {
    setError('');
    if (!code.trim()) { setError('Kode wajib diisi.'); return; }
    if (!name.trim()) { setError('Nama wajib diisi.'); return; }
    mutation.mutate({
      code: code.trim(),
      name: name.trim(),
      location: location.trim() || null,
      description: description.trim() || null,
      isActive,
      isDefault,
      sortOrder,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onKeyDown={(e: React.KeyboardEvent) => e.key === 'Escape' && onClose()}>
      <div className="rounded-xl w-full max-w-md shadow-2xl"
        style={{ backgroundColor: 'var(--color-bg-primary)' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <h3 className="font-semibold text-foreground">{isEdit ? 'Edit Gudang' : 'Tambah Gudang'}</h3>
        </div>
        <div className="p-5 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Kode *</label>
            <input type="text" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="Mis: UTAMA, TRANSIT" maxLength={30}
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Nama *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Mis: Gudang Utama" maxLength={100}
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Lokasi</label>
            <input type="text" value={location} onChange={(e) => setLocation(e.target.value)}
              placeholder="Alamat / area" maxLength={200}
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Deskripsi</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2}
              className="w-full mt-1 px-3 py-2 text-sm border border-border rounded-lg bg-card focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)}
                className="rounded" />
              <span className="text-foreground">Aktif</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded" />
              <span className="text-foreground">Default</span>
            </label>
          </div>
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-100 rounded p-2">{error}</div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border bg-muted/30">
          <button onClick={onClose} className="btn-secondary">Batal</button>
          <button onClick={handleSubmit} disabled={mutation.isPending}
            className="btn-primary disabled:opacity-40">
            {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
            {isEdit ? 'Simpan' : 'Tambah'}
          </button>
        </div>
      </div>
    </div>
  );
}
