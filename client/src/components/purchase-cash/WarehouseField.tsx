/**
 * Warehouse picker for forms inside Dialog/Sheet. Same query + auto-default
 * behaviour as the legacy WarehousePicker, but built on OptionPicker (Radix
 * layers) so it works inside a modal.
 */
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { OptionPicker } from './OptionPicker';

interface Warehouse {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
}

interface WarehouseFieldProps {
  id?: string;
  value: string;
  onChange: (id: string) => void;
  /** Auto-select the default warehouse while value is empty. */
  autoDefault?: boolean;
  disabled?: boolean;
  placeholder?: string;
  'aria-label'?: string;
}

export function WarehouseField({
  id,
  value,
  onChange,
  autoDefault = true,
  disabled,
  placeholder = 'Pilih gudang...',
  'aria-label': ariaLabel,
}: WarehouseFieldProps) {
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
    <OptionPicker
      id={id}
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      disabled={disabled}
      options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
    />
  );
}
