import { useState, useCallback } from 'react';
import {
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/shared/loading-state';
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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

const STATUS_TONE: Record<string, 'success' | 'danger' | 'neutral'> = {
  ACTIVE: 'success',
  EXPIRED: 'danger',
  REVOKED: 'neutral',
  ARCHIVED: 'neutral',
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
    <>
      <Sheet open onOpenChange={(next) => !next && onClose()}>
        <SheetContent size="md" aria-describedby="asset-docs-desc">
          <SheetHeader>
            <SheetTitle>Dokumen Aset</SheetTitle>
            <SheetDescription id="asset-docs-desc">
              <span className="font-mono">{assetCode}</span> · {assetName}
            </SheetDescription>
          </SheetHeader>

          {canEdit && (
            <div className="shrink-0 border-b border-border px-6 py-3">
              <Button onClick={() => setUploadOpen(true)}>
                <Plus aria-hidden /> Tambah Dokumen
              </Button>
            </div>
          )}

          <SheetBody className="space-y-3 bg-muted/40">
            {isLoading ? (
              <div role="status" aria-label="Memuat dokumen">
                <LoadingState label="Memuat dokumen aset…" />
              </div>
            ) : documents.length === 0 ? (
              <div className="py-16 text-center">
                <FileText className="mx-auto mb-2 size-10 text-muted-foreground/60" aria-hidden />
                <p className="text-sm text-muted-foreground">Belum ada dokumen untuk aset ini.</p>
                {canEdit && (
                  <Button variant="link" className="mt-2" onClick={() => setUploadOpen(true)}>
                    + Tambah dokumen pertama
                  </Button>
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
                  <div key={d.id} className="space-y-2 rounded-lg border border-border bg-card px-4 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">{d.title}</p>
                        <p className="font-mono text-[11px] text-muted-foreground">{d.code}</p>
                      </div>
                      <Badge variant={STATUS_TONE[d.status] ?? 'neutral'} className="shrink-0">
                        {STATUS_LABEL[d.status] ?? d.status}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      {d.type?.name && <Badge variant="info">{d.type.name}</Badge>}
                      {d.issuedNumber && <span className="text-muted-foreground">No. {d.issuedNumber}</span>}
                      {versionCount > 0 && <span className="text-muted-foreground">{versionCount} versi</span>}
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="space-y-0.5 text-[11px] text-muted-foreground">
                        {d.effectiveDate && <div>Berlaku: {formatDate(d.effectiveDate)}</div>}
                        {d.expiryDate ? (
                          <div
                            className={cn(
                              'inline-flex flex-wrap items-center gap-1',
                              isExpired
                                ? 'font-semibold text-danger-text'
                                : isExpiring
                                  ? 'font-semibold text-warning-text'
                                  : 'text-muted-foreground',
                            )}
                          >
                            {(isExpired || isExpiring) && <AlertTriangle size={11} aria-hidden />}
                            Kadaluarsa: {formatDate(d.expiryDate)}
                            {isExpired && <Badge variant="danger" className="text-xs">Kadaluarsa</Badge>}
                            {!isExpired && isExpiring && <Badge variant="warning" className="text-xs">Segera</Badge>}
                          </div>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        {latest && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11 text-muted-foreground sm:size-9"
                            onClick={() => handleDownload(d.id, latest, d.code)}
                            aria-label={`Unduh ${d.title} versi v${latest.versionNo}`}
                            title={`Unduh versi v${latest.versionNo}`}
                          >
                            <Download aria-hidden />
                          </Button>
                        )}
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-11 text-danger-text sm:size-9"
                            onClick={() => setDeleteTarget(d)}
                            aria-label={`Hapus dokumen ${d.title}`}
                            title="Hapus dokumen"
                          >
                            <Trash2 aria-hidden />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>

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
    </>
  );
};

export default AssetDocumentsDrawer;
