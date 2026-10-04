/** Shared query hooks, keys and URL filter keys for the Pemeliharaan page. */
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const WO_FILTER_KEYS = ['status', 'priority', 'type', 'assetId', 'due', 'mine', 'startDate', 'endDate'] as const;
export const SCHEDULE_FILTER_KEYS = ['active', 'due'] as const;

export const workOrderKey = (id: string) => ['ga-work-order', id] as const;

interface AssetOption {
  id: string;
  code: string;
  name: string;
}

export function useGaAssetOptions() {
  return useQuery({
    queryKey: ['ga-assets-select'],
    queryFn: async () => {
      const res = await api.get<AssetOption[]>('/ga/assets', { params: { limit: 500 } });
      return Array.isArray(res.data) ? res.data : [];
    },
    staleTime: 60_000,
  });
}

export const assetOptions = (assets: AssetOption[] | undefined) =>
  (assets ?? []).map((a) => ({ value: a.id, label: `${a.code} — ${a.name}` }));
