import * as React from 'react';
import { AlertCircle } from 'lucide-react';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/** Props Field wires onto its control. */
export interface FieldControlProps {
  id: string;
  'aria-describedby'?: string;
  'aria-invalid'?: true;
  'aria-required'?: true;
  required?: boolean;
}

export interface FieldProps {
  label: React.ReactNode;
  /** Help text under the control; stays visible when an error is shown. */
  hint?: React.ReactNode;
  /** Error message; marks the control aria-invalid and is announced politely. */
  error?: React.ReactNode;
  required?: boolean;
  /** Visually hide the label (still read by screen readers). */
  hideLabel?: boolean;
  /** Use an existing id for the control instead of a generated one. */
  id?: string;
  className?: string;
  /**
   * A single control element (Input, Textarea, SelectTrigger, ...) or a render
   * function receiving the aria props for composite controls.
   */
  children: React.ReactElement<Partial<FieldControlProps>> | ((control: FieldControlProps) => React.ReactNode);
}

/**
 * Label + control + hint + error with ids wired automatically:
 *   <Field label="Nama pelanggan" required error={errors.name}>
 *     <Input value={name} onChange={...} />
 *   </Field>
 */
export function Field({ label, hint, error, required, hideLabel, id, className, children }: FieldProps) {
  const autoId = React.useId();
  const controlId = id ?? `field-${autoId}`;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  const control: FieldControlProps = {
    id: controlId,
    'aria-describedby': describedBy,
    ...(error ? { 'aria-invalid': true as const } : {}),
    ...(required ? { 'aria-required': true as const, required: true } : {}),
  };

  let rendered: React.ReactNode;
  if (typeof children === 'function') {
    rendered = children(control);
  } else {
    const own = children.props;
    rendered = React.cloneElement(children, {
      ...control,
      id: own.id ?? control.id,
      'aria-describedby': [own['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined,
    });
  }

  return (
    <div className={cn('flex flex-col gap-1.5', className)} data-invalid={error ? '' : undefined}>
      <Label htmlFor={controlId} required={required} className={cn(hideLabel && 'sr-only')}>
        {label}
      </Label>
      {rendered}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} aria-live="polite" className="flex items-start gap-1 text-xs font-medium text-danger-text">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
