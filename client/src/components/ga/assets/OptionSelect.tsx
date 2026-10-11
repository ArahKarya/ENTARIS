import type { FieldControlProps } from '@/components/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useTranslation } from 'react-i18next';

/** Radix Select cannot hold "" — this sentinel stands for "none". */
const NONE = '__none__';

export interface OptionSelectProps extends Partial<FieldControlProps> {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Adds an empty choice with this label (value ""). */
  noneLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}

/**
 * Design-system select for forms, to be wrapped in <Field>. The aria props
 * Field passes in land on the trigger.
 */
export function OptionSelect({ value, onChange, options, noneLabel, placeholder, disabled, ...field }: OptionSelectProps) {
  // `required` is not valid on the trigger <button>; aria-required carries it.
  const { t } = useTranslation('eam');
  const { required, ...control } = field;
  void required;
  return (
    <Select
      value={value || (noneLabel ? NONE : '')}
      onValueChange={(v) => onChange(v === NONE ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger {...control}>
        <SelectValue placeholder={placeholder ?? t('assets.select')} />
      </SelectTrigger>
      <SelectContent>
        {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
