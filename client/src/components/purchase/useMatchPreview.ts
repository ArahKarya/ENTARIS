import { keepPreviousData, useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import { useDebounce } from '@/hooks/useDebounce';
import type { MatchItemPayload, MatchResult } from './three-way-match';

/** Debounced POST /purchase/invoices/match-preview for an unsaved payload. */
export function useMatchPreview(items: MatchItemPayload[] | null | undefined, delay = 400) {
  const linked = (items ?? []).some((i) => i.goodsReceiptItemId);
  const key = useDebounce(JSON.stringify(items ?? []), delay);
  return useQuery<MatchResult>({
    queryKey: ['purchase-invoice-match-preview', key],
    queryFn: async () => (await api.post('/purchase/invoices/match-preview', { items: JSON.parse(key) })).data,
    enabled: linked,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}
