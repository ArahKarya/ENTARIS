/**
 * Plain overlay dialog for GA forms that contain <SearchableSelect>.
 *
 * SearchableSelect portals its menu to <body>, which a Radix modal makes
 * unclickable (pointer/focus trap), so these forms use the same light shell
 * as pages/ga/requests/CreateRequestModal: role="dialog" + aria-modal,
 * Escape closes (unless busy), focus moves in on open and back on close.
 */
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { closeButtonClass } from '@/components/ui/styles';
import { cn } from '@/lib/utils';

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
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'input:not([type=hidden]):not([disabled]), textarea:not([disabled]), select:not([disabled]), [role=combobox]:not([aria-disabled=true])',
    );
    (first ?? panelRef.current)?.focus();
    return () => previous?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, submitting]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (submitting || submitDisabled) return;
    onSubmit();
  };

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-overlay p-4">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[calc(100dvh-2rem)] w-full flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-6 text-card-foreground shadow-[var(--shadow-3)] focus:outline-none',
          size === 'lg' ? 'max-w-[720px]' : 'max-w-[560px]',
        )}
      >
        <button type="button" onClick={onClose} disabled={submitting} className={closeButtonClass}>
          <X className="size-4" aria-hidden />
          <span className="sr-only">Tutup</span>
        </button>
        <div className="flex flex-col gap-1.5 pr-8">
          <h2 id={titleId} className="font-heading text-lg font-semibold leading-7 text-foreground">
            {title}
          </h2>
          {description && (
            <p id={descId} className="text-sm text-muted-foreground">
              {description}
            </p>
          )}
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {children}
          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
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
          </div>
        </form>
      </div>
    </div>
  );
}
