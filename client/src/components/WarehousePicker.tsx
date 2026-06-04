import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';
import SearchableSelect from './SearchableSelect';

interface Warehouse {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
  /** When true, auto-select the default warehouse if value is empty. */
  autoDefault?: boolean;
  className?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  /** Label shown when no warehouse selected (and autoDefault is off). */
  placeholder?: string;
}

/**
 * Compact dropdown for warehouse selection. Loads the active warehouse list
 * via TanStack Query (cached with the same key everywhere) so multiple
 * pickers in a form share the same fetch.
 */
export const WarehousePicker: React.FC<Props> = ({
  value,
  onChange,
  autoDefault = true,
  className = '',
  disabled = false,
  placeholder = 'Pilih gudang...',
}) => {
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

  // Auto-select default warehouse when value is empty
  useEffect(() => {
    if (autoDefault && !value && defaultWh) {
      onChange(defaultWh.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultWh?.id, autoDefault]);

  return (
    <SearchableSelect
      options={warehouses.map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      className={className}
      searchable="auto"
      allowClear={!autoDefault}
      aria-label={placeholder}
    />
  );
};

export default WarehousePicker;
