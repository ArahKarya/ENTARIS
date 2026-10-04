/**
 * Query keys and shared queries of the fleet module. Keys are unchanged from
 * the previous page so caches shared with other screens stay coherent.
 */
import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { INSPECTION_CATEGORY_FALLBACK, type InspectionCategory } from './constants';
import type { UserOption } from './types';

export const vehicleKeys = {
  fleetList: ['ga-fleet'] as const,
  fleetSummary: ['ga-fleet-summary'] as const,
  assetDetail: (id: string) => ['ga-asset-detail', id] as const,
  vehicle: (id: string) => ['ga-vehicle', id] as const,
  services: (id: string) => ['ga-vehicle-services', id] as const,
  requests: (id: string) => ['ga-vehicle-requests', id] as const,
  taxes: (id: string) => ['ga-vehicle-taxes', id] as const,
  taxRequests: (id: string) => ['ga-vehicle-tax-requests', id] as const,
  insurances: (id: string) => ['ga-vehicle-insurances', id] as const,
  fuel: (id: string) => ['ga-vehicle-fuel', id] as const,
  inspections: (id: string) => ['ga-vehicle-inspections', id] as const,
  incidents: (id: string) => ['ga-vehicle-incidents', id] as const,
  tires: (id: string) => ['ga-vehicle-tires', id] as const,
  oil: (id: string) => ['ga-vehicle-oil', id] as const,
  documents: (id: string) => ['ga-documents', 'asset', id] as const,
  inspectionCategories: ['ga-inspection-categories'] as const,
};

type KeyName = Exclude<keyof typeof vehicleKeys, 'fleetList' | 'fleetSummary' | 'inspectionCategories'>;

/**
 * Invalidates the given per-vehicle caches. Fleet list + KPIs are refreshed
 * too unless `fleet: false`, since most edits change due states or costs.
 */
export function useInvalidateVehicle(assetId: string) {
  const qc = useQueryClient();
  return useCallback(
    (names: KeyName[], { fleet = true }: { fleet?: boolean } = {}) => {
      for (const n of names) qc.invalidateQueries({ queryKey: vehicleKeys[n](assetId) });
      if (fleet) {
        qc.invalidateQueries({ queryKey: vehicleKeys.fleetList });
        qc.invalidateQueries({ queryKey: vehicleKeys.fleetSummary });
      }
    },
    [qc, assetId],
  );
}

export async function fetchInspectionCategories(): Promise<InspectionCategory[]> {
  const data = (await api.get('/ga/vehicle/inspection-categories')).data;
  return Array.isArray(data) && data.length > 0 ? data : INSPECTION_CATEGORY_FALLBACK;
}

/** Checklist categories (falls back to the built-in structure). */
export function useInspectionCategories(): InspectionCategory[] {
  const { data } = useQuery({
    queryKey: vehicleKeys.inspectionCategories,
    queryFn: fetchInspectionCategories,
    staleTime: 10 * 60_000,
  });
  return data ?? INSPECTION_CATEGORY_FALLBACK;
}

/** Users for the driver / inspector pickers (first 200). */
export function useUserOptions(key: string, enabled = true) {
  return useQuery<UserOption[]>({
    queryKey: [key],
    queryFn: async () => (await api.get('/users', { params: { limit: 200 } })).data?.data ?? [],
    enabled,
    staleTime: 5 * 60_000,
  });
}
