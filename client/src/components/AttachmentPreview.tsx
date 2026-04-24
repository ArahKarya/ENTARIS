import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { FileText, Download, Trash2, Loader2, X, Eye } from 'lucide-react';
import api from '../lib/api';
import { ConfirmDialog } from './ConfirmDialog';

interface AttachmentPreviewProps {
  referenceType: 'payment' | 'journal';
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
        <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-text-muted)' }} />
        <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Memuat lampiran...</span>
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
              className="group relative border rounded-lg overflow-hidden"
              style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary, var(--color-bg-primary))' }}
            >
              {isImage ? (
                <img
                  src={fileUrl}
                  alt={att.fileName}
                  className="w-full h-24 object-cover cursor-pointer"
                  onClick={() => setLightboxUrl(fileUrl)}
                  loading="lazy"
                />
              ) : (
                <div
                  className="w-full h-24 flex flex-col items-center justify-center gap-1 cursor-pointer"
                  onClick={() => window.open(fileUrl, '_blank')}
                >
                  <FileText size={24} className="text-red-500" />
                  <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>PDF</span>
                </div>
              )}

              {/* Overlay actions */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                {isImage && (
                  <button
                    onClick={() => setLightboxUrl(fileUrl)}
                    className="p-1.5 bg-white rounded-full shadow-sm hover:bg-gray-100"
                    title="Preview"
                  >
                    <Eye size={13} className="text-gray-700" />
                  </button>
                )}
                <a
                  href={fileUrl}
                  download={att.fileName}
                  className="p-1.5 bg-white rounded-full shadow-sm hover:bg-gray-100"
                  title="Download"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download size={13} className="text-gray-700" />
                </a>
                {canDelete && (
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteId(att.id); }}
                    className="p-1.5 bg-white rounded-full shadow-sm hover:bg-red-50"
                    title="Hapus"
                  >
                    <Trash2 size={13} className="text-red-500" />
                  </button>
                )}
              </div>

              {/* File info */}
              <div className="px-2 py-1.5">
                <p className="text-xs truncate font-medium" style={{ color: 'var(--color-text-primary)' }}>
                  {att.fileName}
                </p>
                <p className="text-[9px]" style={{ color: 'var(--color-text-muted)' }}>
                  {formatFileSize(att.fileSize)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/20 rounded-full hover:bg-white/40 transition-colors"
            onClick={() => setLightboxUrl(null)}
          >
            <X size={20} className="text-white" />
          </button>
          <img
            src={lightboxUrl}
            alt="Preview"
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

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
