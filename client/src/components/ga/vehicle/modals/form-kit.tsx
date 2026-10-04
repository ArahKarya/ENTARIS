/**
 * Form building blocks for the fleet modals: an accessible modal shell and
 * labelled native controls styled with the design tokens.
 *
 * The shell is a plain fixed overlay (not Radix Dialog) on purpose: the
 * legacy SearchableSelect used by the driver/inspector pickers portals its
 * list to <body>, which a Radix modal would make unclickable.
 */
import { useEffect, useId, useRef, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Save, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { controlBase } from '@/components/ui/styles';
import { cn } from '@/lib/utils';

const FOCUSABLE = 'input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[href],[tabindex]:not([tabindex="-1"])';

interface ModalShellProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  onClose: () => void;
  children: ReactNode;
  /** 800px instead of 560px. */
  wide?: boolean;
}

/** Centered modal with title bar, Escape/overlay close, focus trap and focus restore. */
export function ModalShell({ title, description, icon: Icon, onClose, children, wide }: ModalShellProps) {
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const first = panel?.querySelector<HTMLElement>(`form ${FOCUSABLE}`) ?? panel;
    first?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      // An open SearchableSelect list handles its own Escape.
      if (e.key === 'Escape' && !document.querySelector('[role="listbox"]')) {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const firstEl = items[0]!;
      const lastEl = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  return createPortal(
    <div
      role="presentation"
      className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center bg-overlay p-0 sm:items-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={cn(
          'flex max-h-[92dvh] w-full flex-col rounded-t-xl border border-border bg-card text-card-foreground shadow-[var(--shadow-3)] focus:outline-none sm:max-h-[calc(100dvh-2rem)] sm:rounded-xl',
          wide ? 'sm:max-w-[800px]' : 'sm:max-w-[560px]',
        )}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {Icon && (
              <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary-subtle-foreground">
                <Icon className="size-4" strokeWidth={1.75} aria-hidden />
              </span>
            )}
            <div className="min-w-0">
              <h2 id={titleId} className="font-heading text-base font-semibold leading-6 text-foreground">
                {title}
              </h2>
              {description && (
                <p id={descId} className="text-sm text-muted-foreground">
                  {description}
                </p>
              )}
            </div>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Tutup" className="-mr-1 text-muted-foreground">
            <X aria-hidden />
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

interface ModalFormProps {
  onSubmit: () => void;
  onCancel: () => void;
  submitLabel?: string;
  submitIcon?: LucideIcon;
  submitting?: boolean;
  submitDisabled?: boolean;
  submitTone?: 'primary' | 'danger';
  children: ReactNode;
}

/** Form body + sticky footer (Batal / Simpan). */
export function ModalForm({
  onSubmit,
  onCancel,
  submitLabel = 'Simpan',
  submitIcon: SubmitIcon = Save,
  submitting,
  submitDisabled,
  submitTone = 'primary',
  children,
}: ModalFormProps) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={submit} noValidate className="flex flex-col">
      <div className="space-y-3 px-5 py-4">{children}</div>
      <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" variant={submitTone} loading={submitting} disabled={submitDisabled}>
          {!submitting && <SubmitIcon aria-hidden />}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}

interface FieldShellProps {
  label: string;
  required?: boolean;
  hint?: ReactNode;
  className?: string;
  children: (id: string, describedBy?: string) => ReactNode;
}

function FieldShell({ label, required, hint, className, children }: FieldShellProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-danger-text" aria-hidden>
            *
          </span>
        )}
      </label>
      {children(id, hintId)}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
    </div>
  );
}

interface TextFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'number' | 'date';
  step?: string;
  min?: string;
  disabled?: boolean;
  required?: boolean;
  placeholder?: string;
  hint?: ReactNode;
  inputMode?: 'numeric' | 'decimal';
  className?: string;
}

export function TextField({ label, value, onChange, type = 'text', step, min, disabled, required, placeholder, hint, inputMode, className }: TextFieldProps) {
  return (
    <FieldShell label={label} required={required} hint={hint} className={className}>
      {(id, describedBy) => (
        <input
          id={id}
          type={type}
          step={step}
          min={min}
          value={value}
          disabled={disabled}
          required={required}
          aria-required={required || undefined}
          aria-describedby={describedBy}
          placeholder={placeholder}
          inputMode={inputMode ?? (type === 'number' ? 'decimal' : undefined)}
          onChange={(e) => onChange(e.target.value)}
          className={cn(controlBase, 'h-10 px-3 md:h-9', type === 'number' && 'num text-right')}
        />
      )}
    </FieldShell>
  );
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  labels?: Record<string, string>;
  /** Text of the empty option; omit to hide it. */
  emptyLabel?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function SelectField({ label, value, onChange, options, labels, emptyLabel, disabled, required, className }: SelectFieldProps) {
  return (
    <FieldShell label={label} required={required} className={className}>
      {(id) => (
        <select
          id={id}
          value={value}
          disabled={disabled}
          required={required}
          aria-required={required || undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn(controlBase, 'h-10 px-3 md:h-9')}
        >
          {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
          {options.map((o) => (
            <option key={o} value={o}>
              {labels?.[o] ?? o}
            </option>
          ))}
        </select>
      )}
    </FieldShell>
  );
}

interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  disabled?: boolean;
  required?: boolean;
  className?: string;
}

export function TextAreaField({ label, value, onChange, rows = 2, disabled, required, className }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} required={required} className={className}>
      {(id) => (
        <textarea
          id={id}
          rows={rows}
          value={value}
          disabled={disabled}
          required={required}
          aria-required={required || undefined}
          onChange={(e) => onChange(e.target.value)}
          className={cn(controlBase, 'min-h-16 px-3 py-2')}
        />
      )}
    </FieldShell>
  );
}

/** Wrapper for a custom control (e.g. SearchableSelect) with a visible label. */
export function CustomField({ label, required, hint, className, children }: Omit<FieldShellProps, 'children'> & { children: ReactNode }) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <span className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="ml-0.5 text-danger-text" aria-hidden>
            *
          </span>
        )}
      </span>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Two equal columns from sm up, stacked on phones. */
export function FieldRow({ children, cols = 2 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  return (
    <div
      className={cn(
        'grid grid-cols-1 gap-3',
        cols === 2 && 'sm:grid-cols-2',
        cols === 3 && 'sm:grid-cols-3',
        cols === 4 && 'sm:grid-cols-2 md:grid-cols-4',
      )}
    >
      {children}
    </div>
  );
}
