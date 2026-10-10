/**
 * Compact single select (Radix Select) for short option lists inside dialogs
 * and sheets: units, payment terms, accounts, warehouses.
 */
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface SelectChoice {
  value: string;
  label: string;
}

const NONE = '__none';

interface OptionSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectChoice[];
  /** Accessible name (always required: these selects often sit in table cells). */
  'aria-label': string;
  placeholder?: string;
  /** Adds a first "empty" choice with this label (maps to value ''). */
  emptyLabel?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function OptionSelect({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
  placeholder,
  emptyLabel,
  disabled,
  className,
  id,
}: OptionSelectProps) {
  const { t } = useTranslation('sales');
  return (
    <Select
      value={value === '' ? (emptyLabel ? NONE : '') : value}
      onValueChange={(v) => onChange(v === NONE ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} className={className}>
        <SelectValue placeholder={placeholder ?? emptyLabel ?? t('optionSelect.placeholder')} />
      </SelectTrigger>
      <SelectContent>
        {emptyLabel && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
