import { useState, useMemo } from 'react';
import { Search, Boxes, Loader2, Plus, Pencil, Trash2, X, AlertCircle, QrCode, FileText, Camera, ImagePlus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import GaAssetQRModal from '../../components/GaAssetQRModal';
import { can } from '../../lib/permissions';
import { toast } from 'sonner';
import AssetDocumentsDrawer from './assets/AssetDocumentsDrawer';

// GA — Registri Aset Fisik. List + create/edit modal. Konsumsi /ga/assets,
// dengan select kategori/cabang/cost-center dari /ga/master/*.

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Aktif' },
  { value: 'IN_REPAIR', label: 'Perbaikan' },
  { value: 'RETIRED', label: 'Dipensiunkan' },
  { value: 'LOST', label: 'Hilang' },
] as const;

const CONDITION_OPTIONS = [
  { value: 'GOOD', label: 'Baik' },
  { value: 'FAIR', label: 'Cukup' },
  { value: 'POOR', label: 'Kurang' },
  { value: 'BROKEN', label: 'Rusak' },
] as const;

const statusBadgeClass = (status: string): string => {
  switch (status) {
    case 'ACTIVE':
      return 'badge badge-green';
    case 'IN_REPAIR':
      return 'badge badge-yellow';
    case 'LOST':
      return 'badge badge-red';
    case 'RETIRED':
    default:
      return 'badge badge-gray';
  }
};

const statusLabel = (status: string): string =>
  STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;

const conditionLabel = (condition: string): string =>
  CONDITION_OPTIONS.find((o) => o.value === condition)?.label ?? condition;

export const GaAssetsPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; code: string } | null>(null);
  const [qrTarget, setQrTarget] = useState<any | null>(null);
  const [docDrawerAsset, setDocDrawerAsset] = useState<{ id: string; code: string; name: string } | null>(null);
  const queryClient = useQueryClient();

  const canEdit = can('ga_assets', 'edit');
  const canViewDocs = can('ga_documents', 'view');

  // ['ga-assets', 'all']: the vehicle/building/equipment pages cache filtered
  // lists under ['ga-assets', '<category>']; a bare ['ga-assets'] key collided
  // with them. Invalidation still uses the ['ga-assets'] prefix.
  const { data: assets = [], isLoading } = useQuery({
    queryKey: ['ga-assets', 'all'],
    queryFn: async () => {
      const res = await api.get('/ga/assets', { params: { limit: 500 } });
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.post('/ga/assets/bulk/delete', { ids: [id] }),
    onSuccess: () => {
      toast.success('Aset dihapus.');
      queryClient.invalidateQueries({ queryKey: ['ga-assets'] }); // prefix match: 'all' + per-category lists
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal menghapus aset.'),
  });

  const filtered = useMemo(() => {
    if (!searchTerm) return assets;
    const q = searchTerm.toLowerCase();
    return assets.filter((a: any) =>
      a.code?.toLowerCase().includes(q) ||
      a.name?.toLowerCase().includes(q) ||
      a.serialNumber?.toLowerCase().includes(q) ||
      a.location?.toLowerCase().includes(q) ||
      a.category?.name?.toLowerCase().includes(q) ||
      a.branch?.name?.toLowerCase().includes(q)
    );
  }, [assets, searchTerm]);

  const openCreate = () => {
    setEditTarget(null);
    setIsModalOpen(true);
  };

  const openEdit = (asset: any) => {
    setEditTarget(asset);
    setIsModalOpen(true);
  };

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Aset General Affairs</h1>
          <p className="text-sm text-gray-500 mt-0.5">Registri aset fisik perusahaan beserta status &amp; kondisinya.</p>
        </div>
        {canEdit && (
          <button className="btn-primary bg-teal-600 hover:bg-teal-700 self-start" onClick={openCreate}>
            <Plus size={15} /> Tambah Aset
          </button>
        )}
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Cari kode, nama, kategori, atau lokasi..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Nama</th>
                <th scope="col">Kategori</th>
                <th scope="col">Cabang</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col" className="text-center">Kondisi</th>
                <th scope="col" className="w-20 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                    Memuat data aset...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Boxes className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Belum ada aset.</p>
                    {canEdit && (
                      <button onClick={openCreate} className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-medium">
                        + Tambah aset pertama
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((a: any) => (
                  <tr key={a.id}>
                    <td className="whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{a.code}</span>
                    </td>
                    <td>
                      <span className="font-medium text-gray-800">{a.name}</span>
                      {a.fixedAsset && (
                        <span className="badge badge-blue text-[10px] ml-1.5" title={`Tercatat sebagai Aset Tetap ${a.fixedAsset.assetNumber} · Nilai buku Rp ${Number(a.fixedAsset.bookValue).toLocaleString('id-ID')}`}>Aset Tetap</span>
                      )}
                      {a.location && <span className="block text-[11px] text-gray-400">{a.location}</span>}
                    </td>
                    <td className="text-gray-700">{a.category?.name ?? '—'}</td>
                    <td className="text-gray-700">{a.branch?.name ?? '—'}</td>
                    <td className="text-center">
                      <span className={statusBadgeClass(a.status)}>{statusLabel(a.status)}</span>
                    </td>
                    <td className="text-center text-gray-600">{conditionLabel(a.condition)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-0.5">
                        <button
                          onClick={() => setQrTarget(a)}
                          className="p-1.5 hover:bg-slate-100 rounded text-gray-400 hover:text-slate-700 transition-colors"
                          title="QR aset"
                        >
                          <QrCode size={16} />
                        </button>
                        {canViewDocs && (
                          <button
                            onClick={() => setDocDrawerAsset({ id: a.id, code: a.code, name: a.name })}
                            className="p-1.5 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600 transition-colors"
                            title="Dokumen aset"
                          >
                            <FileText size={16} />
                          </button>
                        )}
                        {canEdit && (
                          <>
                            <button
                              onClick={() => openEdit(a)}
                              className="p-1.5 hover:bg-teal-50 rounded text-gray-400 hover:text-teal-600 transition-colors"
                              title="Edit aset"
                            >
                              <Pencil size={16} />
                            </button>
                            <button
                              onClick={() => setDeleteTarget({ id: a.id, code: a.code })}
                              className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                              title="Hapus aset"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
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

      {isModalOpen && (
        <AssetModal
          key={editTarget?.id ?? 'new'}
          asset={editTarget}
          onClose={() => setIsModalOpen(false)}
        />
      )}

      <GaAssetQRModal
        isOpen={qrTarget !== null}
        onClose={() => setQrTarget(null)}
        asset={qrTarget}
      />

      {docDrawerAsset && (
        <AssetDocumentsDrawer
          assetId={docDrawerAsset.id}
          assetCode={docDrawerAsset.code}
          assetName={docDrawerAsset.name}
          onClose={() => setDocDrawerAsset(null)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMutation.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
        title="Hapus Aset"
        message={`Apakah Anda yakin ingin menghapus aset ${deleteTarget?.code}? Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
    </div>
  );
};

// ─── Create / Edit modal (inline) ──────────────────────────────────
interface AssetPhoto {
  id: string;
  filePath: string;
  caption: string | null;
}

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;

interface AssetModalProps {
  asset: any | null;
  onClose: () => void;
}

const AssetModal = ({ asset, onClose }: AssetModalProps) => {
  const isEdit = !!asset;
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    code: asset?.code ?? '',
    name: asset?.name ?? '',
    categoryId: asset?.categoryId ?? '',
    branchId: asset?.branchId ?? '',
    costCenterId: asset?.costCenterId ?? '',
    serialNumber: asset?.serialNumber ?? '',
    acquisitionDate: asset?.acquisitionDate ? String(asset.acquisitionDate).split('T')[0] : '',
    acquisitionCost: asset?.acquisitionCost != null ? String(asset.acquisitionCost) : '',
    status: asset?.status ?? 'ACTIVE',
    condition: asset?.condition ?? 'GOOD',
    location: asset?.location ?? '',
    notes: asset?.notes ?? '',
  });

  const setField = (key: keyof typeof form, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const { data: categories = [] } = useQuery({
    queryKey: ['ga-master', 'asset-categories'],
    queryFn: async () => (await api.get('/ga/master/asset-categories')).data,
  });
  const { data: branches = [] } = useQuery({
    queryKey: ['ga-master', 'branches'],
    queryFn: async () => (await api.get('/ga/master/branches')).data,
  });
  const { data: costCenters = [] } = useQuery({
    queryKey: ['ga-master', 'cost-centers'],
    queryFn: async () => (await api.get('/ga/master/cost-centers')).data,
  });

  // ── Asset photos ─────────────────────────────────────────────────
  // Edit: stored photos come from the asset detail (the list endpoint does not
  // include photos, only /:id). Create: the photo is uploaded after the save.
  const { data: assetDetail } = useQuery<{ photos?: AssetPhoto[] }>({
    queryKey: ['ga-asset-detail', asset?.id],
    queryFn: async () => (await api.get(`/ga/assets/${asset.id}`)).data,
    enabled: isEdit,
  });
  const existingPhotos: AssetPhoto[] = assetDetail?.photos ?? [];

  const [newPhotoFile, setNewPhotoFile] = useState<File | null>(null);
  const [newPhotoPreview, setNewPhotoPreview] = useState<string | null>(null);

  const pickPhoto = (f: File | null) => {
    if (newPhotoPreview) URL.revokeObjectURL(newPhotoPreview);
    if (!f) {
      setNewPhotoFile(null);
      setNewPhotoPreview(null);
      return;
    }
    if (!PHOTO_TYPES.includes(f.type)) {
      setNewPhotoFile(null);
      setNewPhotoPreview(null);
      setError('Format foto harus JPG, PNG, atau WEBP.');
      return;
    }
    if (f.size > PHOTO_MAX_BYTES) {
      setNewPhotoFile(null);
      setNewPhotoPreview(null);
      setError('Ukuran foto maksimal 5 MB.');
      return;
    }
    setNewPhotoFile(f);
    setNewPhotoPreview(URL.createObjectURL(f));
  };

  const uploadPhoto = async (assetId: string) => {
    if (!newPhotoFile) return;
    const fd = new FormData();
    fd.append('photo', newPhotoFile);
    // Do NOT set Content-Type manually — axios sets the multipart boundary.
    await api.post(`/ga/assets/${assetId}/photos`, fd);
    queryClient.invalidateQueries({ queryKey: ['ga-asset-detail', assetId] });
    queryClient.invalidateQueries({ queryKey: ['ga-asset-photos', assetId] });
  };

  const deletePhotoMutation = useMutation({
    mutationFn: (photoId: string) => api.delete(`/ga/assets/${asset?.id}/photos/${photoId}`),
    onSuccess: () => {
      toast.success('Foto dihapus.');
      queryClient.invalidateQueries({ queryKey: ['ga-asset-detail', asset?.id] });
      queryClient.invalidateQueries({ queryKey: ['ga-asset-photos', asset?.id] });
    },
    onError: () => toast.error('Gagal menghapus foto.'),
  });

  const mutation = useMutation({
    mutationFn: (payload: any) =>
      isEdit ? api.put(`/ga/assets/${asset.id}`, payload) : api.post('/ga/assets', payload),
    onSuccess: async (res) => {
      try {
        const savedId: string | undefined = isEdit ? asset.id : res.data?.id;
        if (savedId) await uploadPhoto(savedId);
      } catch {
        toast.error('Aset tersimpan, tapi foto gagal diunggah. Coba unggah ulang lewat Edit.');
      }
      toast.success(isEdit ? 'Aset diperbarui.' : 'Aset dibuat.');
      queryClient.invalidateQueries({ queryKey: ['ga-assets'] }); // prefix match: 'all' + per-category lists
      onClose();
    },
    onError: (err: any) => setError(err.response?.data?.error || 'Gagal menyimpan aset.'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) return setError('Nama aset wajib diisi.');
    if (!form.categoryId) return setError('Kategori wajib dipilih.');
    if (!form.branchId) return setError('Cabang wajib dipilih.');

    const payload: any = {
      code: form.code.trim() || undefined,
      name: form.name.trim(),
      categoryId: form.categoryId,
      branchId: form.branchId,
      costCenterId: form.costCenterId || null,
      serialNumber: form.serialNumber.trim() || null,
      acquisitionDate: form.acquisitionDate || null,
      acquisitionCost: form.acquisitionCost ? Number(form.acquisitionCost) : null,
      status: form.status,
      condition: form.condition,
      location: form.location.trim() || null,
      notes: form.notes.trim() || null,
    };
    mutation.mutate(payload);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">{isEdit ? 'Edit Aset' : 'Tambah Aset'}</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400"><X size={18} /></button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kode {!isEdit && <span className="text-gray-400">(opsional, auto)</span>}</label>
              <input
                type="text"
                value={form.code}
                onChange={(e) => setField('code', e.target.value)}
                placeholder={isEdit ? '' : 'Kosongkan untuk auto-generate'}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nama <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setField('name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kategori <span className="text-red-500">*</span></label>
              <select
                value={form.categoryId}
                onChange={(e) => setField('categoryId', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="">— Pilih kategori —</option>
                {categories.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.code} — {c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cabang <span className="text-red-500">*</span></label>
              <select
                value={form.branchId}
                onChange={(e) => setField('branchId', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="">— Pilih cabang —</option>
                {branches.map((b: any) => (
                  <option key={b.id} value={b.id}>{b.code} — {b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Cost Center</label>
              <select
                value={form.costCenterId}
                onChange={(e) => setField('costCenterId', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                <option value="">— Tidak ada —</option>
                {costCenters.map((cc: any) => (
                  <option key={cc.id} value={cc.id}>{cc.code} — {cc.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">No. Seri</label>
              <input
                type="text"
                value={form.serialNumber}
                onChange={(e) => setField('serialNumber', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tanggal Perolehan</label>
              <input
                type="date"
                value={form.acquisitionDate}
                onChange={(e) => setField('acquisitionDate', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Nilai Perolehan</label>
              <input
                type="number"
                min="0"
                value={form.acquisitionCost}
                onChange={(e) => setField('acquisitionCost', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={form.status}
                onChange={(e) => setField('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Kondisi</label>
              <select
                value={form.condition}
                onChange={(e) => setField('condition', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white"
              >
                {CONDITION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Lokasi</label>
              <input
                type="text"
                value={form.location}
                onChange={(e) => setField('location', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">Catatan</label>
              <textarea
                value={form.notes}
                onChange={(e) => setField('notes', e.target.value)}
                rows={2}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Asset photos */}
          <div className="border-t border-border pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Camera size={13} aria-hidden /> Foto Aset
            </p>

            {existingPhotos.length > 0 && (
              <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {existingPhotos.map((ph) => (
                  <div key={ph.id} className="group relative">
                    <img
                      src={`/uploads/${ph.filePath}`}
                      alt={ph.caption ?? 'Foto aset'}
                      className="h-20 w-full rounded-lg border border-border object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => deletePhotoMutation.mutate(ph.id)}
                      disabled={deletePhotoMutation.isPending}
                      title="Hapus foto"
                      aria-label="Hapus foto"
                      className="absolute right-1 top-1 rounded-full bg-overlay p-1 text-white opacity-0 transition-opacity hover:bg-danger focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-50"
                    >
                      <Trash2 size={11} aria-hidden />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {newPhotoPreview ? (
              <div className="relative inline-block">
                <img src={newPhotoPreview} alt="Pratinjau foto baru" className="h-20 rounded-lg border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => pickPhoto(null)}
                  title="Batalkan foto"
                  aria-label="Batalkan foto"
                  className="absolute -right-1.5 -top-1.5 rounded-full bg-foreground p-0.5 text-background hover:bg-danger hover:text-danger-foreground"
                >
                  <X size={12} aria-hidden />
                </button>
                <p className="mt-1 text-[11px] text-muted-foreground">Diunggah saat aset disimpan.</p>
              </div>
            ) : (
              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-surface-hover focus-within:ring-2 focus-within:ring-ring">
                <ImagePlus size={14} aria-hidden />
                {existingPhotos.length > 0 ? 'Tambah foto lain' : 'Pilih foto (JPG/PNG/WEBP, maks 5 MB)'}
                <input
                  type="file"
                  accept={PHOTO_TYPES.join(',')}
                  className="sr-only"
                  onChange={(e) => {
                    pickPhoto(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
              </label>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors">
              Batal
            </button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-60">
              {mutation.isPending && <Loader2 size={15} className="animate-spin" />}
              {isEdit ? 'Simpan Perubahan' : 'Simpan'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
