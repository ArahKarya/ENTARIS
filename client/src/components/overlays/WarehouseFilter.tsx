/**
 * Warehouse filter for report / list filter bars: searchable combobox with a
 * "Semua gudang" empty option. Same data and query key (`warehouses-active`)
 * as WarehouseSelectField, so the list is fetched once.
 */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { ComboboxFilter } from '@/components/shared';

interface Warehouse {
  id: string;
  code: string;
  name: string;
}

interface WarehouseFilterProps {
  value: string;
  onChange: (id: string) => void;
  label?: string;
  allLabel?: string;
  className?: string;
}

export function WarehouseFilter({
  value,
  onChange,
  label = 'Gudang',
  allLabel = 'Semua gudang',
  className,
}: WarehouseFilterProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const res = await api.get('/warehouses?active=true');
      return res.data.data as Warehouse[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const options = useMemo(
    () => (data ?? []).map((w) => ({ value: w.id, label: `${w.code} — ${w.name}` })),
    [data],
  );
  return (
    <ComboboxFilter
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      allLabel={allLabel}
      loading={isLoading}
      className={className}
    />
  );
}
