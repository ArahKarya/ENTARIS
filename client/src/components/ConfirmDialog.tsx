/**
 * Legacy adapter over the shared ConfirmDialog. The caller closes it: `onCancel`
 * fires only for dismissals, never after a confirm.
 */
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog as SharedConfirmDialog } from '@/components/shared/confirm-dialog';

interface ConfirmDialogProps {
  open: boolean;
  title?: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'default';
}

export function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  variant = 'default',
}: ConfirmDialogProps) {
  // The shared dialog calls onOpenChange(false) right after onConfirm resolves;
  // swallow that one so legacy onCancel handlers do not run after a confirm.
  const confirmedRef = useRef(false);
  const { t } = useTranslation('common');

  return (
    <SharedConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (confirmedRef.current) return;
        onCancel();
      }}
      title={title ?? t('actions.confirm')}
      description={message}
      tone={variant}
      confirmLabel={confirmLabel}
      cancelLabel={cancelLabel}
      onConfirm={() => {
        confirmedRef.current = true;
        setTimeout(() => {
          confirmedRef.current = false;
        }, 0);
        onConfirm();
      }}
    />
  );
}
