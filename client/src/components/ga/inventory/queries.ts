/**
 * Shared React Query hooks for Inventaris Kantor (master options + invalidation).
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { GA_INVENTORY_KEY, ITEMS_ENDPOINT, type GaCategoryOption, type GaItemRow, type GaLocationOption } from './ga-inventory-model';

export function useGaCategories() {
  return useQuery({
    queryKey: ['ga-inventory-categories'],
    queryFn: async () => (await api.get<GaCategoryOption[]>('/ga/master/inventory-categories')).data,
    staleTime: 5 * 60_000,
  });
}

export function useGaLocations() {
  return useQuery({
    queryKey: ['ga-locations'],
    queryFn: async () => (await api.get<GaLocationOption[]>('/ga/master/locations')).data,
    staleTime: 5 * 60_000,
  });
}

/** Item picker options for the movement / opname forms (legacy array call, max 500). */
export function useGaItemOptions(enabled: boolean) {
  return useQuery({
    queryKey: [GA_INVENTORY_KEY, 'item-options'],
    queryFn: async () => (await api.get<GaItemRow[]>(ITEMS_ENDPOINT, { params: { limit: 500 } })).data,
    enabled,
    staleTime: 30_000,
  });
}

/** Refreshes every GA inventory list, KPI and dashboard after a write. */
export function useInvalidateGaInventory() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [GA_INVENTORY_KEY] });
    // Item pickers of Permintaan Barang / Pemeliharaan (stock shown there).
    for (const key of ['ga-inventory-items-select', 'ga-inventory-items-mr', 'ga-inventory-items-mr-receive']) {
      queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [queryClient]);
}
