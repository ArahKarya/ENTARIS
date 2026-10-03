import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { ComboboxFilter } from './combobox-filter';

interface PartyOption {
  id: string;
  name: string;
}

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
  const { data, isLoading } = useQuery({
    queryKey: ['parties', 'filter-options', partyType],
    queryFn: async () => {
      const res = await api.get('/parties', { params: { type: partyType, limit: 200 } });
      return (res.data.data ?? res.data) as PartyOption[];
    },
    staleTime: 5 * 60_000,
  });
  const options = (data ?? []).map((p) => ({ value: p.id, label: p.name }));
  return (
    <ComboboxFilter
      label={copy.label}
      value={value}
      onChange={onChange}
      options={options}
      allLabel={copy.all}
      searchPlaceholder={copy.search}
      loading={isLoading}
      className={className ?? 'w-[calc(50%-0.25rem)] sm:w-52'}
    />
  );
}
