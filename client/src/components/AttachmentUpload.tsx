import React, { useState, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Upload, Loader2, AlertCircle, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { cn } from '@/lib/utils';

interface AttachmentUploadProps {
  referenceType: 'payment' | 'journal' | 'purchase_invoice' | 'sales_invoice' | 'sales_order' | 'delivery_order' | 'goods_receipt';
  referenceId: string;
}

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf';

const AttachmentUpload: React.FC<AttachmentUploadProps> = ({ referenceType, referenceId }) => {
  const { t } = useTranslation('shell');
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
      setError(err.response?.data?.error || t('attachmentUpload.failed'));
    },
  });

  const validateAndUpload = useCallback((fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

    for (const file of files) {
      if (!validTypes.includes(file.type)) {
        setError(t('attachmentUpload.badType', { name: file.name }));
        return;
      }
      if (file.size > MAX_SIZE) {
        setError(t('attachmentUpload.tooLarge', { name: file.name, size: '5MB' }));
        return;
      }
    }

    if (files.length > 5) {
      setError(t('attachmentUpload.tooMany', { max: 5 }));
      return;
    }

    setError('');
    mutation.mutate(files);
  }, [mutation, t]);

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
      <button
        type="button"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        disabled={mutation.isPending}
        className={cn(
          'block min-h-11 w-full cursor-pointer rounded-lg border-2 border-dashed p-4 text-center transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait',
          dragOver
            ? 'border-primary bg-primary-subtle'
            : 'border-border hover:border-primary hover:bg-accent',
        )}
      >
        {mutation.isPending ? (
          <span role="status" className="flex items-center justify-center gap-2 py-1">
            <Loader2 size={16} className="animate-spin text-primary" aria-hidden />
            <span className="text-xs text-primary">{t('attachmentUpload.uploading')}</span>
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2 py-1">
            <Upload size={16} className="text-muted-foreground" aria-hidden />
            <span className="text-xs text-muted-foreground">
              {t('attachmentUpload.dropzone')}
            </span>
          </span>
        )}
        <span className="mt-1 block text-xs text-muted-foreground">
          {t('attachmentUpload.hint', { size: '5MB', max: 5 })}
        </span>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT}
        multiple
        className="hidden"
        aria-label={t('attachmentUpload.choose')}
        onChange={handleFileChange}
      />
      {error && (
        <div role="alert" className="flex items-center gap-1.5 text-xs text-danger-text">
          <AlertCircle size={12} aria-hidden />
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            className="ml-auto inline-flex size-6 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t('attachmentUpload.dismiss')}
          >
            <X size={12} aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
};

export default AttachmentUpload;
