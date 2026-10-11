import api from './api';
import i18n from '@/i18n';

export type AttachmentRefType = 'payment' | 'journal';

export const ATTACHMENT_MAX_SIZE = 5 * 1024 * 1024; // 5MB
export const ATTACHMENT_VALID_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

export interface AttachmentValidationError {
  file: string;
  reason: string;
}

/**
 * Validate a list of files for attachment upload.
 * Returns null if all valid, or an error describing the first invalid file.
 */
export function validateAttachmentFiles(files: File[]): AttachmentValidationError | null {
  if (files.length > 5) {
    return { file: '', reason: i18n.t('attachments.tooMany', { ns: 'common', max: 5 }) };
  }
  for (const file of files) {
    if (!ATTACHMENT_VALID_TYPES.includes(file.type)) {
      return { file: file.name, reason: i18n.t('attachments.badType', { ns: 'common' }) };
    }
    if (file.size > ATTACHMENT_MAX_SIZE) {
      return { file: file.name, reason: i18n.t('attachments.tooLarge', { ns: 'common', size: '5MB' }) };
    }
  }
  return null;
}

/**
 * Upload one or more files as attachments to a reference entity.
 * Used by both AttachmentUpload component and BulkExpenseModal.
 */
export async function uploadAttachments(
  referenceType: AttachmentRefType,
  referenceId: string,
  files: File[],
): Promise<void> {
  if (files.length === 0) return;
  const formData = new FormData();
  formData.append('referenceType', referenceType);
  formData.append('referenceId', referenceId);
  for (const file of files) {
    formData.append('files', file);
  }
  await api.post('/attachments/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}
