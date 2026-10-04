import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { parseBalanceInput } from '@/components/coa/coa-tree';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

interface MoneyInputProps {
  id?: string;
  value: number | null;
  onChange: (value: number | null) => void;
  className?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  required?: boolean;
  disabled?: boolean;
}

const display = (v: number | null) => (v === null ? '' : formatNumber(v, { maxDecimals: 2 }));

/**
 * Rupiah amount typed the Indonesian way ("1.500.000" or "1.500.000,50").
 * Shows the formatted value when not focused; parses with the COA parser.
 */
export function MoneyInput({ value, onChange, className, ...props }: MoneyInputProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <Input
      {...props}
      inputMode="decimal"
      autoComplete="off"
      className={cn('num text-right', className)}
      value={draft ?? display(value)}
      onFocus={() => setDraft(value === null ? '' : display(value))}
      onChange={(e) => {
        setDraft(e.target.value);
        const n = parseBalanceInput(e.target.value);
        onChange(Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null);
      }}
      onBlur={() => setDraft(null)}
      placeholder="0"
    />
  );
}
