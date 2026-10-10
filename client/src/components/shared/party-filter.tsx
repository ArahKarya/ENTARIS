import { usePartyPicker } from '@/hooks/usePartyPicker';
import { ComboboxFilter } from './combobox-filter';

export interface PartyFilterProps {
  /** Customer → pelanggan, Supplier → pemasok (parties of type Both are included). */
  partyType: 'Customer' | 'Supplier';
  value: string;
  onChange: (partyId: string) => void;
  className?: string;
}

const COPY = {
  Customer: { label: 'Pelanggan', all: 'Semua pelanggan', search: 'Cari pelanggan…' },
  Supplier: { label: 'Pemasok', all: 'Semua pemasok', search: 'Cari pemasok…' },
} as const;

/**
 * Party select for FilterBar's slot:
 *   <FilterBar list={list} …>
 *     <PartyFilter partyType="Customer" value={list.filters.partyId} onChange={(v) => list.setFilter('partyId', v)} />
 *   </FilterBar>
 */
export function PartyFilter({ partyType, value, onChange, className }: PartyFilterProps) {
  const copy = COPY[partyType];
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
