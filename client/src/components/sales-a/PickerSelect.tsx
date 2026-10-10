/**
 * Drop-in for SearchableSelect inside dialogs: its menu portals outside the modal
 * focus scope and cannot be clicked there, so this uses ComboboxFilter.
 */
import { ComboboxFilter } from '@/components/shared';

export interface PickerOption {
  value: string;
  label: string;
}

interface PickerSelectProps {
  options: PickerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Accessible name of the combobox (falls back to the placeholder). */
  'aria-label'?: string;
  onSearchChange?: (query: string) => void;
  loading?: boolean;
}

export function PickerSelect({
  options,
  value,
  onChange,
  placeholder = 'Pilih',
  disabled,
  className,
  'aria-label': ariaLabel,
  onSearchChange,
  loading,
}: PickerSelectProps) {
  const label = ariaLabel ?? placeholder;
  if (disabled) {
    const selected = options.find((o) => o.value === value);
    return (
      <div
        role="textbox"
        aria-readonly="true"
        aria-disabled="true"
        aria-label={label}
        className="flex h-10 w-full cursor-not-allowed items-center rounded-md border border-input bg-muted px-3 text-base text-foreground opacity-60 md:h-9 md:text-sm"
      >
        <span className="truncate">{selected?.label ?? placeholder}</span>
      </div>
    );
  }
  return (
    <ComboboxFilter
      className={className}
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      allLabel={placeholder}
      searchPlaceholder="Cari…"
      onSearchChange={onSearchChange}
      loading={loading}
    />
  );
}
