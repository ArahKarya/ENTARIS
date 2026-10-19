/**
 * Filter controls for the Stok & Produksi list tabs, sized for FilterBar's slot.
 */
import { useId } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ComboboxFilter } from '@/components/shared';
import { useItemOptions } from './list-helpers';

const ALL = '__all__';

interface SelectFilterProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  className?: string;
}

/** Labelled single select; empty value = "all". */
export function SelectFilter({ label, value, onChange, allLabel, options, className }: SelectFilterProps) {
  const id = useId();
  return (
    <div className={className ?? 'w-[calc(50%-0.25rem)] sm:w-44'}>
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

interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

interface IdFilterProps {
  value: string;
  onChange: (id: string) => void;
  className?: string;
  allLabel?: string;
}

/** Warehouse combobox (shares the cached active-warehouse list with WarehousePicker). */
export function WarehouseFilter({ value, onChange, className, allLabel }: IdFilterProps) {
  const { t } = useTranslation('inventory');
  const { data, isLoading } = useQuery({
    queryKey: ['warehouses-active'],
    queryFn: async () => {
      const res = await api.get('/warehouses?active=true');
      return res.data.data as WarehouseOption[];
    },
    staleTime: 5 * 60 * 1000,
  });
  const options = (data ?? []).map((w) => ({ value: w.id, label: w.name, hint: w.code }));
  return (
    <ComboboxFilter
      label={t('filters.warehouse')}
      value={value}
      onChange={onChange}
      options={options}
      allLabel={allLabel ?? t('filters.allWarehouses')}
      searchPlaceholder={t('filters.searchWarehouse')}
      loading={isLoading}
      className={className ?? 'w-[calc(50%-0.25rem)] sm:w-48'}
    />
  );
}

/** Item combobox (code shown as hint, both searchable). */
export function ItemFilter({ value, onChange, className }: IdFilterProps) {
  const { t } = useTranslation('inventory');
  const { data, isLoading } = useItemOptions();
  const options = (data ?? []).map((i) => ({ value: i.id, label: i.name, hint: i.code }));
  return (
    <ComboboxFilter
      label={t('filters.item')}
      value={value}
      onChange={onChange}
      options={options}
      allLabel={t('filters.allItems')}
      searchPlaceholder={t('filters.searchItem')}
      loading={isLoading}
      className={className ?? 'w-[calc(50%-0.25rem)] sm:w-52'}
    />
  );
}
