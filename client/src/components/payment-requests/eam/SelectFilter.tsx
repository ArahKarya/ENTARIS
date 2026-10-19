import { useId } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const ALL = '__all__';

interface SelectFilterProps {
  /** Screen-reader label. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  /** Label of the empty value ("Semua …"). */
  allLabel: string;
  className?: string;
}

/** Plain select for a FilterBar slot (same look as the bar's status select). */
export function SelectFilter({ label, value, onChange, options, allLabel, className }: SelectFilterProps) {
  const id = useId();
  return (
    <div className={cn('w-[calc(50%-0.25rem)] sm:w-48', className)}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
