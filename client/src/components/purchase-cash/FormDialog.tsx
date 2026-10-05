/**
 * Dialog shell for the purchase / cash forms: header (title + description),
 * scrolling body and a pinned footer (Batal left of the primary action).
 * Esc and the close button are blocked while a request is in flight, and
 * outside clicks never dismiss (long forms lose data on a stray click).
 */
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface FormDialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  /** Visible subtitle under the title; falls back to a screen-reader description. */
  description?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'doc';
  /** Extra classes for DialogContent, e.g. `sm:max-w-2xl`. */
  className?: string;
  /** A request is in flight: block Esc / close. */
  busy?: boolean;
  children: ReactNode;
  /** Full footer override; defaults to Batal + primary action. */
  footer?: ReactNode;
  submitLabel?: ReactNode;
  busyLabel?: ReactNode;
  onSubmit?: () => void;
  submitDisabled?: boolean;
  submitVariant?: 'primary' | 'danger';
  cancelLabel?: string;
}

export function FormDialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  className,
  busy = false,
  children,
  footer,
  submitLabel = 'Simpan',
  busyLabel = 'Menyimpan…',
  onSubmit,
  submitDisabled,
  submitVariant = 'primary',
  cancelLabel = 'Batal',
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        size={size}
        hideClose={busy}
        className={cn('flex flex-col gap-0 overflow-hidden p-0', className)}
        onInteractOutside={(e) => e.preventDefault()}
        // Focus the dialog itself (not the first field): no mobile keyboard pop-up
        // or selected date text; Tab moves into the form from the title.
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement | null)?.focus();
        }}
      >
        <DialogHeader className="shrink-0 border-b border-border px-4 py-4 sm:px-6">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">Formulir {typeof title === 'string' ? title : ''}</DialogDescription>
          )}
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-6">{children}</div>
        <DialogFooter className="shrink-0 border-t border-border px-4 py-3 sm:px-6">
          {footer ?? (
            <>
              <Button variant="outline" className="h-11 sm:h-9" onClick={onClose} disabled={busy}>
                {cancelLabel}
              </Button>
              <Button
                variant={submitVariant}
                className="h-11 sm:h-9"
                onClick={onSubmit}
                loading={busy}
                disabled={submitDisabled}
              >
                {busy ? busyLabel : submitLabel}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
