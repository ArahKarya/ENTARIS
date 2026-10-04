import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared';

export interface TypedConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Word the user must type to enable the confirm button (e.g. RESTORE). */
  keyword: string;
  confirmLabel: string;
  loading?: boolean;
  onConfirm: () => void;
  children?: React.ReactNode;
}

/** Destructive confirmation that requires typing a keyword (restore, reset). */
export function TypedConfirmDialog({
  open, onOpenChange, title, description, keyword, confirmLabel, loading = false, onConfirm, children,
}: TypedConfirmDialogProps) {
  const [value, setValue] = React.useState('');
  React.useEffect(() => { if (!open) setValue(''); }, [open]);
  const matches = value === keyword;

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent size="sm" role="alertdialog" hideClose={loading}>
        <DialogHeader className="flex-row items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-danger-subtle text-danger-text">
            <AlertTriangle className="size-5" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col gap-1.5">
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </div>
        </DialogHeader>
        {children}
        <form
          id="typed-confirm-form"
          onSubmit={(e) => { e.preventDefault(); if (matches && !loading) onConfirm(); }}
        >
          <Field label={<>Ketik <strong>{keyword}</strong> untuk mengonfirmasi</>}>
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={`Ketik ${keyword}`} autoComplete="off" autoFocus disabled={loading} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Batal</Button>
          <Button type="submit" form="typed-confirm-form" variant="danger" disabled={!matches} loading={loading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
