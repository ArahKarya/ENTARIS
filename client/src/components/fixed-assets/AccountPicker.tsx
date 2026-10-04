import { useMemo } from 'react';
import { ComboField } from './ComboField';

export interface AccountOption {
  id: string;
  accountNumber: string;
  name: string;
}

interface AccountPickerProps {
  label: string;
  value: string;
  onChange: (id: string) => void;
  accounts: readonly AccountOption[];
  placeholder?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  loading?: boolean;
  className?: string;
}

/** Searchable chart-of-accounts picker for forms ("1.6.3 — Kendaraan"). */
export function AccountPicker({ accounts, placeholder = 'Pilih akun…', ...props }: AccountPickerProps) {
  const options = useMemo(
    () => accounts.map((a) => ({ value: a.id, label: `${a.accountNumber} — ${a.name}` })),
    [accounts],
  );
  return (
    <ComboField
      {...props}
      options={options}
      placeholder={placeholder}
      searchPlaceholder="Cari nomor atau nama akun…"
    />
  );
}
