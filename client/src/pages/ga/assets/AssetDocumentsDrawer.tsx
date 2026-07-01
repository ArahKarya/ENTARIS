import { useState, useCallback } from 'react';
import {
  X,
  Loader2,
  Plus,
  Download,
  Trash2,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { cn } from '../../../lib/utils';
import { formatDate } from '../../../lib/formatters';
import { can } from '../../../lib/permissions';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { toast } from 'sonner';
import UploadAssetDocumentModal from './UploadAssetDocumentModal';

// Drawer daftar dokumen/lampiran milik satu aset EAM. Konsumsi endpoint
// /ga/documents?assetId=<id> (backend GaDocument sudah lengkap). Menampilkan
// judul, tipe, no dokumen, masa berlaku (badge kadaluarsa/segera), status,
// jumlah versi, tombol download versi terakhir, tambah dokumen, dan hapus.

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Aktif',
  EXPIRED: 'Kadaluarsa',
  REVOKED: 'Dicabut',
  ARCHIVED: 'Diarsipkan',
};

const STATUS_BADGE: Record<string, string> = {
  ACTIVE: 'badge-green',
  EXPIRED: 'badge-red',
  REVOKED: 'badge-gray',
  ARCHIVED: 'badge-gray',
};

interface DocVersion {
  id: string;
  versionNo: number;
  fileSize: number;
  createdAt?: string;
}

interface AssetDocument {
  id: string;
  code: string;
  title: string;
  status: string;
  issuedNumber?: string | null;
  issuedBy?: string | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  daysToExpiry: number | null;
  type?: { code: string; name: string } | null;
  versions?: DocVersion[];
}

interface Props {
  assetId: string;
  assetCode: string;
  assetName: string;
  onClose: () => void;
}

export const AssetDocumentsDrawer = ({ assetId, assetCode, assetName, onClose }: Props) => {
  const queryClient = useQueryClient();
  const canEdit = can('ga_documents', 'edit');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AssetDocument | null>(null);

  const { data: documents = [], isLoading } = useQuery<AssetDocument[]>({
    queryKey: ['ga-asset-documents', assetId],
    queryFn: async () => (await api.get('/ga/documents', { params: { assetId } })).data,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/documents/${id}`),
    onSuccess: () => {
      toast.success('Dokumen dihapus.');
      queryClient.invalidateQueries({ queryKey: ['ga-asset-documents', assetId] });
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } } };
      toast.error(e.response?.data?.error || 'Gagal menghapus dokumen.');
    },
  });

  const handleDownload = useCallback(
    async (docId: string, version: DocVersion, code: string) => {
      try {
        const res = await api.get(`/ga/documents/${docId}/versions/${version.id}/file`, {
          responseType: 'blob',
        });
        const url = URL.createObjectURL(res.data as Blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${code}-v${version.versionNo}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      } catch {
        toast.error('Gagal mengunduh file dokumen.');
      }
    },
    [],
  );

  const assetLabel = `${assetCode} · ${assetName}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[110] flex justify-end bg-black/50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-gray-50 w-full max-w-md h-full flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 bg-white border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Dokumen Aset</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              <span className="font-mono">{assetCode}</span> · {assetName}
            </p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400">
            <X size={18} />
          </button>
        </div>

        {/* Action bar */}
        {canEdit && (
          <div className="px-5 py-3 bg-white border-b border-gray-100">
            <button
              onClick={() => setUploadOpen(true)}
              className="btn-primary bg-teal-600 hover:bg-teal-700 text-sm"
            >
              <Plus size={15} /> Tambah Dokumen
            </button>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          {isLoading ? (
            <div className="py-16 text-center text-gray-400">
              <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-gray-300" />
              Memuat dokumen...
            </div>
          ) : documents.length === 0 ? (
            <div className="py-16 text-center">
              <FileText className="w-10 h-10 text-gray-200 mx-auto mb-2" />
              <p className="text-sm text-gray-400">Belum ada dokumen untuk aset ini.</p>
              {canEdit && (
                <button
                  onClick={() => setUploadOpen(true)}
                  className="mt-3 text-xs text-teal-600 hover:text-teal-700 font-medium"
                >
                  + Tambah dokumen pertama
                </button>
              )}
            </div>
          ) : (
            documents.map((d) => {
              const isExpired = d.daysToExpiry !== null && d.daysToExpiry < 0;
              const isExpiring =
                d.daysToExpiry !== null && d.daysToExpiry >= 0 && d.daysToExpiry <= 30;
              const latest = d.versions?.[0];
              const versionCount = d.versions?.length ?? 0;
              return (
                <div
                  key={d.id}
                  className="bg-white border border-gray-200 rounded-lg px-4 py-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800 text-sm truncate">{d.title}</p>
                      <p className="text-[11px] text-gray-400 font-mono">{d.code}</p>
                    </div>
                    <span className={cn('badge flex-shrink-0', STATUS_BADGE[d.status] ?? 'badge-gray')}>
                      {STATUS_LABEL[d.status] ?? d.status}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    {d.type?.name && <span className="badge badge-blue">{d.type.name}</span>}
                    {d.issuedNumber && (
                      <span className="text-gray-500">No. {d.issuedNumber}</span>
                    )}
                    {versionCount > 0 && (
                      <span className="text-gray-400">{versionCount} versi</span>
                    )}
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[11px] text-gray-500 space-y-0.5">
                      {d.effectiveDate && <div>Berlaku: {formatDate(d.effectiveDate)}</div>}
                      {d.expiryDate ? (
                        <div
                          className={cn(
                            'inline-flex items-center gap-1',
                            isExpired
                              ? 'text-red-600 font-semibold'
                              : isExpiring
                                ? 'text-amber-600 font-semibold'
                                : 'text-gray-500',
                          )}
                        >
                          {(isExpired || isExpiring) && <AlertTriangle size={11} />}
                          Kadaluarsa: {formatDate(d.expiryDate)}
                          {isExpired && (
                            <span className="badge badge-red text-[10px]">Kadaluarsa</span>
                          )}
                          {!isExpired && isExpiring && (
                            <span className="badge badge-yellow text-[10px]">Segera</span>
                          )}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      {latest && (
                        <button
                          onClick={() => handleDownload(d.id, latest, d.code)}
                          className="p-1.5 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-700 transition-colors"
                          title={`Unduh versi v${latest.versionNo}`}
                        >
                          <Download size={16} />
                        </button>
                      )}
                      {canEdit && (
                        <button
                          onClick={() => setDeleteTarget(d)}
                          className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                          title="Hapus dokumen"
                        >
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {uploadOpen && (
        <UploadAssetDocumentModal
          assetId={assetId}
          assetLabel={assetLabel}
          onClose={() => setUploadOpen(false)}
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
        message={`Hapus dokumen "${deleteTarget?.title}"? Semua versi file ikut terhapus dan tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Ya, Hapus"
        variant="danger"
      />
    </div>
  );
};

export default AssetDocumentsDrawer;
