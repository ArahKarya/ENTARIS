import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('settings');
  const [value, setValue] = React.useState('');
  React.useEffect(() => { if (!open) setValue(''); }, [open]);
  const matches = value === keyword;

  return (
    <Dialog open={open} onOpenChange={(next) => !loading && onOpenChange(next)}>
      <DialogContent size="sm" role="alertdialog" hideClose={loading}>
        <DialogHeader className="flex-row items-start gap-3">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-danger-text" aria-hidden />
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
          <Field label={<Trans t={t} i18nKey="typedConfirm.prompt" values={{ keyword }} components={{ strong: <strong /> }} />}>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves to the first field when the dialog/inline editor opens */}
            <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={t('typedConfirm.placeholder', { keyword })} autoComplete="off" autoFocus disabled={loading} />
          </Field>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>{t('typedConfirm.cancel')}</Button>
          <Button type="submit" form="typed-confirm-form" variant="danger" disabled={!matches} loading={loading}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
