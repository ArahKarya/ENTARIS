/**
 * Dialog shell for the GA maintenance forms (pinned header and footer, scrolling
 * body). `onClose` is ignored while a submit is in flight.
 */
import type { FormEvent, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { OverlayBody, OverlayFooter, OverlayHeader } from '@/components/sales/dialog-parts-b';
import { dialogShellClass } from '@/components/sales/dialog-classes-b';

export interface FormModalProps {
  title: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  submitTone?: 'primary' | 'danger';
  size?: 'md' | 'lg';
  children: ReactNode;
}

export function FormModal({
  title,
  description,
  onClose,
  onSubmit,
  submitLabel,
  submitting = false,
  submitDisabled = false,
  submitTone = 'primary',
  size = 'md',
  children,
}: FormModalProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting || submitDisabled) return;
    onSubmit();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !submitting && onClose()}>
      <DialogContent size={size} className={dialogShellClass} aria-describedby={description ? undefined : undefined}>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <OverlayHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className={description ? undefined : 'sr-only'}>{description ?? title}</DialogDescription>
          </OverlayHeader>
          <OverlayBody>{children}</OverlayBody>
          <OverlayFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              Batal
            </Button>
            <Button
              type="submit"
              variant={submitTone === 'danger' ? 'danger' : 'primary'}
              disabled={submitDisabled}
              loading={submitting}
            >
              {submitLabel}
            </Button>
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
