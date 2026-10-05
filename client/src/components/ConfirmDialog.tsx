/**
 * Legacy API adapter over the shared ConfirmDialog (components/shared).
 * Kept so existing callers (`open` / `message` / `onCancel` / `variant`) keep
 * working unchanged. Unlike the shared dialog, the caller closes it: after
 * `onConfirm` the dialog stays controlled by `open`, and `onCancel` fires only
 * for dismissals (Batal, Esc, overlay, X), never after a confirm.
 */
import { useRef } from 'react';
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
  title = 'Konfirmasi',
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  variant = 'default',
}: ConfirmDialogProps) {
  // The shared dialog calls onOpenChange(false) right after onConfirm resolves;
  // swallow that one so legacy onCancel handlers do not run after a confirm.
  const confirmedRef = useRef(false);

  return (
    <SharedConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (confirmedRef.current) return;
        onCancel();
      }}
      title={title}
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
