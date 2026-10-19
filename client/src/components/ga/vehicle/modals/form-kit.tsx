/** Fleet modal building blocks: dialog shell and labelled native controls. */
import { useId, type FormEvent, type ReactNode } from 'react';
import { Save, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { controlBase } from '@/components/ui/styles';
import { OverlayHeader } from '@/components/sales/dialog-parts-b';
import { dialogShellClass } from '@/components/sales/dialog-classes-b';
import { cn } from '@/lib/utils';

interface ModalShellProps {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  onClose: () => void;
  children: ReactNode;
  /** 800px instead of 560px. */
  wide?: boolean;
}

/** Centered modal (mounted by the parent while open); Escape / overlay / close button call onClose. */
export function ModalShell({ title, description, icon: Icon, onClose, children, wide }: ModalShellProps) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent size={wide ? 'lg' : 'md'} className={dialogShellClass}>
        <OverlayHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className="size-5 text-primary" strokeWidth={1.75} aria-hidden />}
            {title}
          </DialogTitle>
          <DialogDescription className={description ? undefined : 'sr-only'}>{description ?? title}</DialogDescription>
        </OverlayHeader>
        {children}
      </DialogContent>
    </Dialog>
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
  submitLabel,
  submitIcon: SubmitIcon = Save,
  submitting,
  submitDisabled,
  submitTone = 'primary',
  children,
}: ModalFormProps) {
  const { t } = useTranslation('eam');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };
  return (
    <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-6 py-4">{children}</div>
      <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-border bg-card px-6 py-3 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          {t('fleet.form.cancel')}
        </Button>
        <Button type="submit" variant={submitTone} loading={submitting} disabled={submitDisabled}>
          {!submitting && <SubmitIcon aria-hidden />}
          {submitLabel ?? t('fleet.form.save')}
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

/** Wrapper for a custom control with a visible label. */
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
