/**
 * Warehouse dropdown for dialog lines. Same data, query key and default
 * auto-select behaviour as the legacy WarehousePicker, on the Radix Select.
 */
import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { OptionSelect } from './OptionSelect';

interface Warehouse {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  isDefault: boolean;
}

interface WarehouseSelectProps {
  value: string;
  onChange: (id: string) => void;
  /** Auto-select the default warehouse while value is empty (legacy default: true). */
  autoDefault?: boolean;
  disabled?: boolean;
  /** Accessible name + placeholder. */
  label?: string;
  className?: string;
}

export function WarehouseSelect({
  value,
  onChange,
  autoDefault = true,
  disabled,
  label: labelProp,
  className,
}: WarehouseSelectProps) {
  const { t } = useTranslation('inventory');
  const label = labelProp ?? t('warehouseSelect.placeholder');
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
    <OptionSelect
      aria-label={label}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className={className}
      placeholder={label}
      emptyLabel={autoDefault ? undefined : t('warehouseSelect.none')}
      options={warehouses.map((w) => ({ value: w.id, label: `${w.code} · ${w.name}` }))}
    />
  );
}
