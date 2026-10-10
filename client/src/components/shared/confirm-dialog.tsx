import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Field } from './field';

export interface ReasonOptions {
  label?: string;
  placeholder?: string;
  /** Minimum trimmed length (default 3). */
  minLength?: number;
}

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** danger = destructive/irreversible (cancel invoice, delete, void journal). */
  tone?: 'default' | 'danger';
  confirmLabel?: string;
  cancelLabel?: string;
  /** Ask for a reason before confirming (stored in the audit trail by the caller). */
  requireReason?: boolean | ReasonOptions;
  /**
   * Called with the trimmed reason when `requireReason` is set. May return a
   * promise: the dialog shows a loading state and closes when it resolves.
   * A rejected promise keeps the dialog open so the caller can show the error.
   */
  onConfirm: (reason?: string) => void | Promise<unknown>;
  /** Externally controlled loading (e.g. a mutation's isPending). */
  loading?: boolean;
  children?: React.ReactNode;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  tone = 'default',
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  requireReason = false,
  onConfirm,
  loading: externalLoading = false,
  children,
}: ConfirmDialogProps) {
  const reasonOpts: ReasonOptions | null = requireReason
    ? typeof requireReason === 'object'
      ? requireReason
      : {}
    : null;
  const minLength = reasonOpts?.minLength ?? 3;

  const [reason, setReason] = React.useState('');
  const [touched, setTouched] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const loading = externalLoading || pending;

  React.useEffect(() => {
    if (!open) {
      setReason('');
      setTouched(false);
      setPending(false);
    }
  }, [open]);

  const trimmed = reason.trim();
  const reasonInvalid = reasonOpts !== null && trimmed.length < minLength;
  const reasonError =
    touched && reasonInvalid ? `Alasan wajib diisi (minimal ${minLength} karakter).` : undefined;

  const handleConfirm = async () => {
    if (reasonInvalid) {
      setTouched(true);
      return;
    }
    try {
      setPending(true);
      await onConfirm(reasonOpts ? trimmed : undefined);
      onOpenChange(false);
    } catch {
      /* caller surfaces the error (toast); keep the dialog open for retry */
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent size="sm" role="alertdialog" hideClose={loading}>
        <DialogHeader className="flex-row items-start gap-3">
          {tone === 'danger' && <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-text" aria-hidden />}
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
        </DialogHeader>

        {children}

        {reasonOpts && (
          <Field label={reasonOpts.label ?? 'Alasan'} required error={reasonError}>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              onBlur={() => setTouched(true)}
              placeholder={reasonOpts.placeholder ?? 'Tuliskan alasan…'}
              disabled={loading}
              rows={3}
            />
          </Field>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={handleConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
