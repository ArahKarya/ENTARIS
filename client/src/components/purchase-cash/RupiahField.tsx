/**
 * Rupiah amount input with live `.` grouping — same parsing as the legacy
 * RupiahInput (digits only, empty = 0) but built on the design-system Input so
 * Field can wire label / aria-invalid / aria-describedby onto it.
 */
import * as React from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface RupiahFieldProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (value: number) => void;
}

const fmt = (n: number) => (n ? n.toLocaleString('id-ID', { maximumFractionDigits: 0 }) : '');

export function RupiahField({ value, onChange, className, ...rest }: RupiahFieldProps) {
  const [display, setDisplay] = React.useState(() => fmt(value));
  React.useEffect(() => {
    setDisplay(fmt(value));
  }, [value]);
  return (
    <Input
      {...rest}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      placeholder={rest.placeholder ?? '0'}
      value={display}
      className={cn('num text-right', className)}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') {
          setDisplay('');
          onChange(0);
          return;
        }
        const num = Number(raw.replace(/[^0-9]/g, ''));
        if (Number.isNaN(num)) return;
        setDisplay(fmt(num));
        onChange(num);
      }}
    />
  );
}
