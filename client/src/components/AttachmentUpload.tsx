import React, { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Loader2, AlertCircle, X } from 'lucide-react';
import api from '../lib/api';

interface AttachmentUploadProps {
  referenceType: 'payment' | 'journal';
  referenceId: string;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf';

const AttachmentUpload: React.FC<AttachmentUploadProps> = ({ referenceType, referenceId }) => {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (files: File[]) => {
      const formData = new FormData();
      formData.append('referenceType', referenceType);
      formData.append('referenceId', referenceId);
      for (const file of files) {
        formData.append('files', file);
      }
      return api.post('/attachments/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['attachments', referenceType, referenceId] });
      // Uploading a payment/deposit attachment also affects any currently-open
      // invoice drawer's 'Dari Pembayaran' section, so refresh that cache too.
      if (referenceType === 'payment') {
        queryClient.invalidateQueries({ queryKey: ['invoice-related-attachments'] });
      }
      setError('');
    },
    onError: (err: any) => {
      setError(err.response?.data?.error || 'Gagal mengupload file.');
    },
  });

  const validateAndUpload = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

    for (const file of files) {
      if (!validTypes.includes(file.type)) {
        setError(`File "${file.name}" tidak didukung. Hanya JPG, PNG, WebP, PDF.`);
        return;
      }
      if (file.size > MAX_SIZE) {
        setError(`File "${file.name}" terlalu besar. Maksimal 5MB.`);
        return;
      }
    }

    if (files.length > 5) {
      setError('Maksimal 5 file sekaligus.');
      return;
    }

    setError('');
    mutation.mutate(files);
  }, [mutation]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) {
      validateAndUpload(e.dataTransfer.files);
    }
  }, [validateAndUpload]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndUpload(e.target.files);
      e.target.value = '';
    }
  }, [validateAndUpload]);

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
          ${dragOver
            ? 'border-blue-400 bg-blue-50 dark:bg-blue-900/20'
            : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 hover:bg-gray-50 dark:hover:bg-gray-800/50'
          }
        `}
      >
        {mutation.isPending ? (
          <div className="flex items-center justify-center gap-2 py-1">
            <Loader2 size={16} className="animate-spin text-blue-500" />
            <span className="text-xs text-blue-600">Mengupload...</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-1">
            <Upload size={16} style={{ color: 'var(--color-text-muted)' }} />
            <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Seret file atau klik untuk upload bukti transfer
            </span>
          </div>
        )}
        <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
          JPG, PNG, PDF — maks 5MB, maks 5 file
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPT}
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600">
          <AlertCircle size={12} />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto">
            <X size={12} />
          </button>
        </div>
      )}
    </div>
  );
};

export default AttachmentUpload;
