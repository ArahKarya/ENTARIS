import { AlertCircle } from 'lucide-react';
import { ComboboxFilter, type ComboboxOption } from '@/components/shared';
import { cn } from '@/lib/utils';

export interface ComboFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  loading?: boolean;
  className?: string;
}

/**
 * Searchable single-select form field (Radix Popover + cmdk via ComboboxFilter,
 * so it works inside dialogs). The visible label mirrors the combobox's own
 * screen-reader label; an empty value means "nothing chosen".
 */
export function ComboField({
  label,
  value,
  onChange,
  options,
  placeholder = 'Pilih…',
  searchPlaceholder = 'Cari…',
  required,
  error,
  hint,
  loading,
  className,
}: ComboFieldProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)} data-invalid={error ? '' : undefined}>
      <span aria-hidden className="inline-flex items-center gap-1 text-sm font-medium leading-5 text-foreground">
        {label}
        {required && <span className="text-danger-text">*</span>}
      </span>
      <ComboboxFilter
        label={required ? `${label} (wajib)` : label}
        value={value}
        onChange={onChange}
        options={options}
        allLabel={placeholder}
        searchPlaceholder={searchPlaceholder}
        loading={loading}
        className={cn(error && '[&_button[role=combobox]]:border-danger')}
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p aria-live="polite" className="flex items-start gap-1 text-xs font-medium text-danger-text">
          <AlertCircle className="mt-px size-3.5 shrink-0" aria-hidden />
          <span>{error}</span>
        </p>
      )}
    </div>
  );
}
