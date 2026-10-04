import type { FieldControlProps } from '@/components/shared';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Radix Select cannot hold "" — this sentinel stands for "none". */
const NONE = '__none__';

export interface FormSelectProps extends Partial<FieldControlProps> {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ value: string; label: string }>;
  /** Adds an empty choice with this label (value ""). */
  noneLabel?: string;
  placeholder?: string;
  disabled?: boolean;
}

/** Design-system select for forms, wrapped in <Field>; Field's aria props land on the trigger. */
export function FormSelect({ value, onChange, options, noneLabel, placeholder, disabled, ...field }: FormSelectProps) {
  // `required` is not valid on the trigger <button>; aria-required carries it.
  const control = { ...field, required: undefined };
  return (
    <Select value={value || (noneLabel ? NONE : '')} onValueChange={(v) => onChange(v === NONE ? '' : v)} disabled={disabled}>
      <SelectTrigger {...control}>
        <SelectValue placeholder={placeholder ?? 'Pilih…'} />
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
