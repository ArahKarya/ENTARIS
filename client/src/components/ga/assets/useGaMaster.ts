import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export type GaMasterPath =
  | 'branches'
  | 'cost-centers'
  | 'asset-categories'
  | 'document-types'
  | 'inventory-categories'
  | 'locations';

export interface GaMasterOption {
  id: string;
  code: string;
  name: string;
  isActive?: boolean;
}

/**
 * GET /ga/master/<path>, cached under ['ga-master', path] (same key the
 * Data Induk Aset page invalidates after a write).
 */
export function useGaMaster<T extends GaMasterOption = GaMasterOption>(path: GaMasterPath, enabled = true) {
  return useQuery({
    queryKey: ['ga-master', path],
    queryFn: async () => (await api.get<T[]>(`/ga/master/${path}`)).data,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

/** `{ value, label }` options; inactive rows are kept only when currently selected. */
export function masterOptions(rows: readonly GaMasterOption[] | undefined, keepId?: string | null) {
  return (rows ?? [])
    .filter((r) => r.isActive !== false || r.id === keepId)
    .map((r) => ({ value: r.id, label: `${r.code} · ${r.name}` }));
}
