/**
 * Labelled searchable select for dialogs (Radix Popover + cmdk via the shared
 * ComboboxFilter), replacing the legacy SearchableSelect whose portalled menu
 * is outside a modal dialog's focus scope.
 */
import { ComboboxFilter, type ComboboxOption } from '@/components/shared';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ComboboxFieldProps {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  placeholder: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  onSearchChange?: (query: string) => void;
  loading?: boolean;
}

export function ComboboxField({
  label,
  required,
  value,
  onChange,
  options,
  placeholder,
  hint,
  error,
  disabled,
  onSearchChange,
  loading,
}: ComboboxFieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      {/* The combobox carries its own (screen-reader) label; this one is visual. */}
      <Label required={required} aria-hidden>
        {label}
      </Label>
      {disabled ? (
        <Input
          readOnly
          disabled
          aria-label={label}
          value={options.find((o) => o.value === value)?.label ?? ''}
          placeholder={placeholder}
        />
      ) : (
        <ComboboxFilter
          label={label}
          value={value}
          onChange={onChange}
          options={options}
          allLabel={placeholder}
          searchPlaceholder="Cari…"
          onSearchChange={onSearchChange}
          loading={loading}
        />
      )}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger-text">
          {error}
        </p>
      )}
    </div>
  );
}
