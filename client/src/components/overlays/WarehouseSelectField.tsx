/**
 * Warehouse dropdown for dialogs, on Radix Select because WarehousePicker portals
 * its menu outside the dialog's focus scope.
 */
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Field } from '@/components/shared';

interface Warehouse {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
}

const NONE = '__none';

interface WarehouseSelectFieldProps {
  label?: string;
  value: string;
  onChange: (id: string) => void;
  /** Auto-select the default warehouse while value is empty. */
  autoDefault?: boolean;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
  required?: boolean;
  error?: string;
}

export function WarehouseSelectField({
  label = 'Gudang',
  value,
  onChange,
  autoDefault = false,
  disabled,
  placeholder = 'Pilih gudang',
  hint,
  required,
  error,
}: WarehouseSelectFieldProps) {
  const { data } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const res = await api.get('/warehouses?active=true');
      return res.data.data as Warehouse[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const warehouses = useMemo(() => data ?? [], [data]);
  const defaultWh = useMemo(() => warehouses.find((w) => w.isDefault), [warehouses]);

  useEffect(() => {
    if (autoDefault && !value && defaultWh) onChange(defaultWh.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultWh?.id, autoDefault]);

  return (
    <Field label={label} hint={hint} required={required} error={error}>
      {(control) => (
        <Select
          value={value || NONE}
          onValueChange={(v) => onChange(v === NONE ? '' : v)}
          disabled={disabled}
        >
          <SelectTrigger {...control}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {!autoDefault && <SelectItem value={NONE}>Tidak dipilih</SelectItem>}
            {warehouses.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.code} · {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </Field>
  );
}
