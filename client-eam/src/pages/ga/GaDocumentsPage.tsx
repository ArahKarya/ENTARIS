import { useState, useMemo, useCallback } from 'react';
import {
  Search,
  FileText,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Upload,
  Download,
  AlertTriangle,
  X,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../lib/api';
import { formatDate } from '../../lib/formatters';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { can } from '../../lib/permissions';
import { toast } from 'sonner';

// GA Legal Documents & Certificates — dokumen legal/sertifikat dengan
// versioning (upload PDF) dan tracking masa berlaku (expiry).
// Endpoint base: /ga/documents (di-mount oleh routes/ga/index.ts).

type DocStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ARCHIVED';

interface DocType {
  id: string;
  code: string;
  name: string;
  category?: string | null;
}

interface AssetOption {
  id: string;
  code: string;
  name: string;
}

interface DocVersion {
  id: string;
  versionNo: number;
  fileSize: number;
  notes?: string | null;
  createdAt?: string;
}

interface GaDocument {
  id: string;
  code: string;
  title: string;
  status: DocStatus;
  typeId: string;
  assetId?: string | null;
  issuedBy?: string | null;
  issuedNumber?: string | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  daysToExpiry: number | null;
  type?: { code: string; name: string; category?: string | null };
  asset?: { id: string; code: string; name: string } | null;
  versions?: DocVersion[];
}

interface DocFormState {
  title: string;
  typeId: string;
  assetId: string;
  issuedBy: string;
  issuedNumber: string;
  effectiveDate: string;
  expiryDate: string;
  status: DocStatus;
}

const STATUS_LABEL: Record<DocStatus, string> = {
  ACTIVE: 'Aktif',
  EXPIRED: 'Kadaluarsa',
  REVOKED: 'Dicabut',
  ARCHIVED: 'Diarsipkan',
};

const STATUS_BADGE: Record<DocStatus, string> = {
  ACTIVE: 'badge-green',
  EXPIRED: 'badge-red',
  REVOKED: 'badge-gray',
  ARCHIVED: 'badge-gray',
};

const EMPTY_FORM: DocFormState = {
  title: '',
  typeId: '',
  assetId: '',
  issuedBy: '',
  issuedNumber: '',
  effectiveDate: '',
  expiryDate: '',
  status: 'ACTIVE',
};

const toDateInput = (v?: string | null) => (v ? new Date(v).toISOString().slice(0, 10) : '');

export const GaDocumentsPage = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [expiringOnly, setExpiringOnly] = useState(false);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<GaDocument | null>(null);
  const [form, setForm] = useState<DocFormState>(EMPTY_FORM);

  const [uploadTarget, setUploadTarget] = useState<GaDocument | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GaDocument | null>(null);

  const queryClient = useQueryClient();
  const canEdit = can('ga_documents', 'edit');

  const { data: docTypes = [] } = useQuery<DocType[]>({
    queryKey: ['ga-document-types'],
    queryFn: async () => (await api.get('/ga/master/document-types')).data,
  });

  const { data: assets = [] } = useQuery<AssetOption[]>({
    queryKey: ['ga-assets-options'],
    queryFn: async () => {
      const res = await api.get('/ga/assets', { params: { limit: 500 } });
      return Array.isArray(res.data) ? res.data : res.data?.data ?? [];
    },
  });

  const { data: documents = [], isLoading } = useQuery<GaDocument[]>({
    queryKey: ['ga-documents', statusFilter, typeFilter, expiringOnly],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (statusFilter) params.status = statusFilter;
      if (typeFilter) params.typeId = typeFilter;
      if (expiringOnly) params.expiringDays = 60;
      const res = await api.get('/ga/documents', { params });
      return res.data;
    },
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ga-documents'] });
  };

  const saveMutation = useMutation({
    mutationFn: async (payload: DocFormState & { id?: string }) => {
      const body = {
        title: payload.title,
        typeId: payload.typeId,
        assetId: payload.assetId || null,
        issuedBy: payload.issuedBy || null,
        issuedNumber: payload.issuedNumber || null,
        effectiveDate: payload.effectiveDate || null,
        expiryDate: payload.expiryDate || null,
        status: payload.status,
      };
      if (payload.id) return api.put(`/ga/documents/${payload.id}`, body);
      return api.post('/ga/documents', body);
    },
    onSuccess: () => {
      toast.success(editTarget ? 'Dokumen diperbarui.' : 'Dokumen dibuat.');
      setIsModalOpen(false);
      invalidate();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal menyimpan dokumen.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/documents/${id}`),
    onSuccess: () => {
      toast.success('Dokumen dihapus.');
      invalidate();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal menghapus dokumen.'),
  });

  const uploadMutation = useMutation({
    mutationFn: async ({ id, file, notes }: { id: string; file: File; notes: string }) => {
      const fd = new FormData();
      fd.append('file', file);
      if (notes) fd.append('notes', notes);
      return api.post(`/ga/documents/${id}/versions`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      toast.success('Versi dokumen diunggah.');
      setUploadTarget(null);
      invalidate();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Gagal mengunggah versi.'),
  });

  const handleDownload = useCallback(async (docId: string, versionId: string, filename: string) => {
    try {
      const res = await api.get(`/ga/documents/${docId}/versions/${versionId}/file`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Gagal mengunduh file dokumen.');
    }
  }, []);

  const openCreate = () => {
    setEditTarget(null);
    setForm(EMPTY_FORM);
    setIsModalOpen(true);
  };

  const openEdit = (doc: GaDocument) => {
    setEditTarget(doc);
    setForm({
      title: doc.title,
      typeId: doc.typeId,
      assetId: doc.assetId ?? '',
      issuedBy: doc.issuedBy ?? '',
      issuedNumber: doc.issuedNumber ?? '',
      effectiveDate: toDateInput(doc.effectiveDate),
      expiryDate: toDateInput(doc.expiryDate),
      status: doc.status,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Judul wajib diisi.');
    if (!form.typeId) return toast.error('Jenis dokumen wajib dipilih.');
    saveMutation.mutate({ ...form, id: editTarget?.id });
  };

  const filtered = useMemo(() => {
    if (!searchTerm) return documents;
    const q = searchTerm.toLowerCase();
    return documents.filter(
      (d) =>
        d.code?.toLowerCase().includes(q) ||
        d.title?.toLowerCase().includes(q) ||
        d.issuedNumber?.toLowerCase().includes(q),
    );
  }, [documents, searchTerm]);

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Dokumen Legal & Sertifikat</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Dokumen legal/sertifikat dengan versioning dan tracking masa berlaku.
          </p>
        </div>
        {canEdit && (
          <button className="btn-primary self-start" onClick={openCreate}>
            <Plus size={15} /> Dokumen Baru
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Cari kode, judul, atau nomor..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">Semua jenis</option>
          {docTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="py-2 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
        >
          <option value="">Semua status</option>
          {(Object.keys(STATUS_LABEL) as DocStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={expiringOnly}
            onChange={(e) => setExpiringOnly(e.target.checked)}
            className="rounded border-gray-300 text-teal-600 focus:ring-teal-500"
          />
          Akan jatuh tempo (60 hari)
        </label>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Kode</th>
                <th scope="col">Judul</th>
                <th scope="col">Jenis</th>
                <th scope="col">Aset</th>
                <th scope="col">Masa Berlaku</th>
                <th scope="col" className="text-center">Status</th>
                <th scope="col" className="w-28"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
                    Memuat data dokumen...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                    <p className="text-sm text-gray-400">Belum ada dokumen.</p>
                    {canEdit && (
                      <button
                        onClick={openCreate}
                        className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-medium"
                      >
                        + Tambah dokumen pertama
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((d) => {
                  const latest = d.versions?.[0];
                  const isExpired = d.daysToExpiry !== null && d.daysToExpiry < 0;
                  const isExpiring = d.daysToExpiry !== null && d.daysToExpiry >= 0 && d.daysToExpiry <= 60;
                  return (
                    <tr key={d.id}>
                      <td className="whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">
                          {d.code}
                        </span>
                      </td>
                      <td>
                        <span className="font-medium text-gray-800">{d.title}</span>
                        {d.issuedNumber && (
                          <span className="block text-[11px] text-gray-400">{d.issuedNumber}</span>
                        )}
                      </td>
                      <td className="text-gray-600">{d.type?.name ?? '—'}</td>
                      <td className="text-gray-600">
                        {d.asset ? (
                          <span className="text-xs">
                            {d.asset.code} · {d.asset.name}
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">
                        {d.expiryDate ? (
                          <span
                            className={cn(
                              'text-xs inline-flex items-center gap-1',
                              isExpired
                                ? 'text-red-600 font-semibold'
                                : isExpiring
                                  ? 'text-amber-600 font-semibold'
                                  : 'text-gray-500',
                            )}
                          >
                            {(isExpired || isExpiring) && <AlertTriangle size={12} />}
                            {formatDate(d.expiryDate)}
                            {isExpired && <span className="block text-[10px] uppercase">Kadaluarsa</span>}
                            {!isExpired && isExpiring && (
                              <span className="text-[10px]">({d.daysToExpiry} hari)</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="text-center">
                        <span className={cn('badge', STATUS_BADGE[d.status])}>
                          {STATUS_LABEL[d.status]}
                        </span>
                      </td>
                      <td>
                        <div className="flex items-center gap-0.5">
                          {latest && (
                            <button
                              onClick={() => handleDownload(d.id, latest.id, `${d.code}-v${latest.versionNo}.pdf`)}
                              className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-colors"
                              title={`Unduh versi v${latest.versionNo}`}
                            >
                              <Download size={16} />
                            </button>
                          )}
                          {canEdit && (
                            <>
                              <button
                                onClick={() => setUploadTarget(d)}
                                className="p-1.5 hover:bg-teal-50 rounded text-gray-400 hover:text-teal-600 transition-colors"
                                title="Unggah versi"
                              >
                                <Upload size={16} />
                              </button>
                              <button
                                onClick={() => openEdit(d)}
                                className="p-1.5 hover:bg-blue-50 rounded text-gray-400 hover:text-blue-600 transition-colors"
                                title="Edit"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(d)}
                                className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                                title="Hapus"
                              >
                                <Trash2 size={16} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit modal */}
      {isModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsModalOpen(false);
          }}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-base font-semibold text-gray-900">
                {editTarget ? 'Edit Dokumen' : 'Dokumen Baru'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 hover:bg-gray-100 rounded text-gray-400"
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Judul *</label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jenis Dokumen *</label>
                  <select
                    value={form.typeId}
                    onChange={(e) => setForm((f) => ({ ...f, typeId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Pilih jenis...</option>
                    {docTypes.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Aset (opsional)</label>
                  <select
                    value={form.assetId}
                    onChange={(e) => setForm((f) => ({ ...f, assetId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="">Tidak terkait aset</option>
                    {assets.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} · {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Diterbitkan Oleh</label>
                  <input
                    type="text"
                    value={form.issuedBy}
                    onChange={(e) => setForm((f) => ({ ...f, issuedBy: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nomor Penerbitan</label>
                  <input
                    type="text"
                    value={form.issuedNumber}
                    onChange={(e) => setForm((f) => ({ ...f, issuedNumber: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Efektif</label>
                  <input
                    type="date"
                    value={form.effectiveDate}
                    onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal Kadaluarsa</label>
                  <input
                    type="date"
                    value={form.expiryDate}
                    onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as DocStatus }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {(Object.keys(STATUS_LABEL) as DocStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  Batal
                </button>
                <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
                  {saveMutation.isPending && <Loader2 size={15} className="animate-spin" />}
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload version modal */}
      {uploadTarget && (
        <UploadVersionModal
          doc={uploadTarget}
          isPending={uploadMutation.isPending}
          onClose={() => setUploadTarget(null)}
          onSubmit={(file, notes) => uploadMutation.mutate({ id: uploadTarget.id, file, notes })}
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
        title="Hapus Dokumen"
        message={`Hapus dokumen ${deleteTarget?.code} — ${deleteTarget?.title}? Semua versi file ikut terhapus.`}
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
    </div>
  );
};

interface UploadVersionModalProps {
  doc: GaDocument;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (file: File, notes: string) => void;
}

function UploadVersionModal({ doc, isPending, onClose, onSubmit }: UploadVersionModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return toast.error('Pilih file PDF terlebih dahulu.');
    onSubmit(file, notes);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Unggah Versi</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400">
            <X size={18} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-4 space-y-4">
          <p className="text-sm text-gray-500">
            Dokumen: <span className="font-medium text-gray-700">{doc.code} — {doc.title}</span>
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File PDF *</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Catatan (opsional)</label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button type="submit" disabled={isPending} className="btn-primary">
              {isPending && <Loader2 size={15} className="animate-spin" />}
              Unggah
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
