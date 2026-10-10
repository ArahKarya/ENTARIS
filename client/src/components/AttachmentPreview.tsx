import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Download, Trash2, Loader2, Eye } from 'lucide-react';
import api from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';

interface AttachmentPreviewProps {
  referenceType: 'payment' | 'journal' | 'purchase_invoice' | 'sales_invoice' | 'sales_order' | 'delivery_order' | 'goods_receipt' | 'approval_request';
  referenceId: string;
  canDelete?: boolean;
}

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  referenceType,
  referenceId,
  canDelete = true,
}) => {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: attachments, isLoading } = useQuery({
    queryKey: ['attachments', referenceType, referenceId],
    queryFn: async () => {
      const res = await api.get(`/attachments/${referenceType}/${referenceId}`);
      return res.data;
    },
    enabled: !!referenceId,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/attachments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', referenceType, referenceId] });
      if (referenceType === 'payment') {
        queryClient.invalidateQueries({ queryKey: ['invoice-related-attachments'] });
      }
      setDeleteId(null);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-2">
        <Loader2 size={14} className="animate-spin text-muted-foreground" aria-hidden />
        <span className="text-xs text-muted-foreground" role="status">Memuat lampiran...</span>
      </div>
    );
  }

  if (!attachments || attachments.length === 0) return null;

  const getFileUrl = (id: string) => `${api.defaults.baseURL}/attachments/file/${id}`;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {attachments.map((att: any) => {
          const isImage = att.mimeType.startsWith('image/');
          const fileUrl = getFileUrl(att.id);

          return (
            <div
              key={att.id}
              className="group relative overflow-hidden rounded-lg border border-border bg-muted"
            >
              {isImage ? (
                <button
                  type="button"
                  className="block w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => setLightboxUrl(fileUrl)}
                  aria-label={`Preview ${att.fileName}`}
                >
                  <img src={fileUrl} alt="" className="w-full h-24 object-cover cursor-pointer" loading="lazy" />
                </button>
              ) : (
                <a
                  href={fileUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Buka ${att.fileName}`}
                  className="w-full h-24 flex flex-col items-center justify-center gap-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FileText size={24} className="text-danger-text" aria-hidden />
                  <span className="text-xs font-medium text-muted-foreground">PDF</span>
                </a>
              )}

              {/* Overlay actions */}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex h-24 items-center justify-center gap-2 bg-black/0 opacity-0 transition-colors group-focus-within:bg-black/40 group-focus-within:opacity-100 group-hover:bg-black/40 group-hover:opacity-100 [&>*]:pointer-events-auto">
                {isImage && (
                  <button
                    type="button"
                    onClick={() => setLightboxUrl(fileUrl)}
                    className="inline-flex size-9 items-center justify-center rounded-full bg-card text-foreground shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title="Preview"
                    aria-label={`Preview ${att.fileName}`}
                  >
                    <Eye size={14} aria-hidden />
                  </button>
                )}
                <a
                  href={fileUrl}
                  download={att.fileName}
                  className="inline-flex size-9 items-center justify-center rounded-full bg-card text-foreground shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  title="Download"
                  aria-label={`Download ${att.fileName}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download size={14} aria-hidden />
                </a>
                {canDelete && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeleteId(att.id); }}
                    className="inline-flex size-9 items-center justify-center rounded-full bg-card text-danger-text shadow-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title="Hapus"
                    aria-label={`Hapus ${att.fileName}`}
                  >
                    <Trash2 size={14} aria-hidden />
                  </button>
                )}
              </div>

              {/* File info */}
              <div className="px-2 py-1.5">
                <p className="text-xs truncate font-medium text-foreground">
                  {att.fileName}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatFileSize(att.fileSize)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={(next) => !next && setLightboxUrl(null)}>
        <DialogContent size="doc" className="flex items-center justify-center p-3">
          <DialogTitle className="sr-only">Pratinjau lampiran</DialogTitle>
          <DialogDescription className="sr-only">Gambar lampiran ukuran penuh. Tekan Esc untuk menutup.</DialogDescription>
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Pratinjau lampiran"
              className="max-h-[85dvh] max-w-full rounded-lg object-contain shadow-2xl"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteId}
        title="Hapus Lampiran"
        message="Yakin ingin menghapus lampiran ini? File akan dihapus permanen."
        confirmLabel="Hapus"
        variant="danger"
        onConfirm={() => deleteId && deleteMutation.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </>
  );
};

export default AttachmentPreview;
