import React, { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

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
  size = 'sm',
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

  const sizeClass = size === 'sm' ? 'text-xs py-1.5 px-2' : 'text-sm py-2 px-3';

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={`w-full border border-border rounded bg-card focus:outline-none focus:ring-1 focus:ring-blue-500 ${sizeClass} ${className}`}
    >
      <option value="">{placeholder}</option>
      {warehouses.map((w) => (
        <option key={w.id} value={w.id}>
          {w.code} — {w.name}
        </option>
      ))}
    </select>
  );
};

export default WarehousePicker;
