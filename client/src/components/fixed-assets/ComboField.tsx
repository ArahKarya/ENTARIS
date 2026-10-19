import { AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
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
  onSearchChange?: (query: string) => void;
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
  placeholder,
  searchPlaceholder,
  required,
  error,
  hint,
  loading,
  className,
  onSearchChange,
}: ComboFieldProps) {
  const { t } = useTranslation('finance');
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)} data-invalid={error ? '' : undefined}>
      <span aria-hidden className="inline-flex items-center gap-1 text-sm font-medium leading-5 text-foreground">
        {label}
        {required && <span className="text-danger-text">*</span>}
      </span>
      <ComboboxFilter
        label={required ? t('comboField.required', { label }) : label}
        value={value}
        onChange={onChange}
        options={options}
        allLabel={placeholder ?? t('comboField.placeholder')}
        searchPlaceholder={searchPlaceholder ?? t('comboField.search')}
        loading={loading}
        onSearchChange={onSearchChange}
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
