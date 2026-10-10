import { usePartyPicker } from '@/hooks/usePartyPicker';
import { useTranslation } from 'react-i18next';
import { ComboboxFilter } from './combobox-filter';

export interface PartyFilterProps {
  /** Customer or Supplier (parties of type Both are included). */
  partyType: 'Customer' | 'Supplier';
  value: string;
  onChange: (partyId: string) => void;
  className?: string;
}

/** `common:partyFilter.<key>.*` per party type. */
const COPY_KEY = { Customer: 'customer', Supplier: 'supplier' } as const;

/**
 * Party select for FilterBar's slot:
 *   <FilterBar list={list} …>
 *     <PartyFilter partyType="Customer" value={list.filters.partyId} onChange={(v) => list.setFilter('partyId', v)} />
 *   </FilterBar>
 */
export function PartyFilter({ partyType, value, onChange, className }: PartyFilterProps) {
  const { t } = useTranslation('common');
  const key = COPY_KEY[partyType];
  const copy = {
    label: t(`partyFilter.${key}.label`),
    all: t(`partyFilter.${key}.all`),
    search: t(`partyFilter.${key}.search`),
  };
  // Server search keeps every party reachable (no 200-name cap) and keeps the selection labelled.
  const { pickerProps } = usePartyPicker({ type: partyType, selectedId: value || null });
  return (
    <ComboboxFilter
      label={copy.label}
      value={value}
      onChange={onChange}
      {...pickerProps}
      allLabel={copy.all}
      searchPlaceholder={copy.search}
      className={className ?? 'w-[calc(50%-0.25rem)] sm:w-52'}
    />
  );
}
