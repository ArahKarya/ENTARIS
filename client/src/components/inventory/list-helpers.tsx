/**
 * Non-component helpers shared by the Stok & Produksi list tabs.
 */
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface ItemOption {
  id: string;
  code: string;
  name: string;
  unit: string;
}

/** Item list for filters (legacy picker call, max 200 rows). */
export function useItemOptions() {
  return useQuery({
    queryKey: ['inventory-items', 'filter-options'],
    queryFn: async () => {
      const res = await api.get('/inventory/items', { params: { limit: 200 } });
      return (res.data.data ?? res.data) as ItemOption[];
    },
    staleTime: 60_000,
  });
}

/** Column header with a unit kept in normal case: "NILAI (Rp)". */
export function withUnit(label: string, unit = 'Rp'): ReactNode {
  return (
    <>
      {label} <span className="normal-case">({unit})</span>
    </>
  );
}
