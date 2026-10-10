import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { useDebounce } from './useDebounce';
import {
  fetchPartyById,
  mergeSelectedPartyOption,
  partyOptionQueryKey,
  type KnownParty,
  type PartyPickerOption,
  type PartyRecord,
} from './useSelectedPartyOption';

/** Server list mode (GET /parties with `sort`) caps a page at 500. */
export const PARTY_PICKER_LIMIT = 500;
export const PARTY_PICKER_DEBOUNCE_MS = 300;

export type PartyPickerType = 'Customer' | 'Supplier';

export interface UsePartyPickerOptions<O extends PartyPickerOption> {
  /** Customer or Supplier (both include partyType Both); omit for every party. */
  type?: PartyPickerType;
  /** Currently selected party id; always kept in the options. */
  selectedId?: string | null;
  /** Party already known from the document being edited (avoids a fetch). */
  known?: KnownParty | null;
  /** Only active parties (selected party still shown). */
  activeOnly?: boolean;
  enabled?: boolean;
  /** Custom option mapping; keep it stable (module level). */
  toOption?: (party: PartyRecord) => O;
}

export interface PartyPickerProps<O> {
  options: Array<O | PartyPickerOption>;
  onSearchChange: (query: string) => void;
  loading: boolean;
}

export interface UsePartyPickerResult<O> {
  /** Spread into OptionPicker / ComboboxFilter / PickerSelect / ComboboxField / ComboField. */
  pickerProps: PartyPickerProps<O>;
  options: Array<O | PartyPickerOption>;
  /** Parties of the current search page. */
  parties: PartyRecord[];
  /** Full record of the selected party, even when outside the current page. */
  selectedParty: PartyRecord | null;
  /** Matching parties on the server (may exceed the loaded page). */
  total: number;
  isLoading: boolean;
}

/** Query key shared by every party picker: under ['parties'] so party mutations refresh it. */
export function partyPickerQueryKey(type: PartyPickerType | undefined, activeOnly: boolean, search: string) {
  return ['parties', 'picker', type ?? 'all', activeOnly ? 'active' : 'any', search] as const;
}

interface PickerPage {
  data: PartyRecord[];
  total: number;
}

function findInPickerCache(queryClient: QueryClient, partyId: string): PartyRecord | undefined {
  for (const [, page] of queryClient.getQueriesData<PickerPage>({ queryKey: ['parties', 'picker'] })) {
    const hit = page?.data.find((p) => p.id === partyId);
    if (hit) return hit;
  }
  return undefined;
}

const defaultToOption = (p: PartyRecord): PartyPickerOption => ({ value: p.id, label: p.name });

/**
 * Searchable party picker data: queries the server by search term (debounced, list mode,
 * max 500) instead of the capped legacy list, and always includes the selected party.
 */
export function usePartyPicker<O extends PartyPickerOption = PartyPickerOption>({
  type,
  selectedId,
  known,
  activeOnly = false,
  enabled = true,
  toOption,
}: UsePartyPickerOptions<O> = {}): UsePartyPickerResult<O> {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const debounced = useDebounce(search.trim(), PARTY_PICKER_DEBOUNCE_MS);

  const listQuery = useQuery({
    queryKey: partyPickerQueryKey(type, activeOnly, debounced),
    queryFn: async () => {
      // `sort` switches GET /parties to the paged list mode (search + limit up to 500).
      const res = await api.get('/parties', {
        params: {
          type,
          search: debounced || undefined,
          isActive: activeOnly ? 'true' : undefined,
          sort: 'name',
          limit: PARTY_PICKER_LIMIT,
        },
      });
      const data = (res.data?.data ?? res.data ?? []) as PartyRecord[];
      const page: PickerPage = { data, total: Number(res.data?.total ?? data.length) };
      return page;
    },
    enabled,
    // Rows carry balances (outstandingAmount, deposits) that forms read, so refetch on mount.
    staleTime: 0,
    placeholderData: keepPreviousData,
  });

  const parties = useMemo(() => listQuery.data?.data ?? [], [listQuery.data]);

  const listed = selectedId ? parties.find((p) => p.id === selectedId) : undefined;
  // A party picked from an earlier search page keeps its details after the search changes.
  const remembered = selectedId && !listed ? findInPickerCache(queryClient, selectedId) : undefined;
  const { data: fetched } = useQuery({
    queryKey: partyOptionQueryKey(selectedId),
    queryFn: () => fetchPartyById(selectedId as string),
    enabled: enabled && !!selectedId && !listed && !remembered,
  });

  const selectedParty: PartyRecord | null = selectedId
    ? (listed ?? remembered ?? (fetched?.id === selectedId ? fetched : null))
    : null;
  const selectedOption: KnownParty | null = selectedParty ?? (known && known.id === selectedId ? known : null);

  const mapper = (toOption ?? defaultToOption) as (p: PartyRecord) => O;
  const baseOptions = useMemo(() => parties.map(mapper), [parties, mapper]);
  const options = useMemo(() => mergeSelectedPartyOption(baseOptions, selectedOption), [baseOptions, selectedOption]);

  return {
    pickerProps: { options, onSearchChange: setSearch, loading: listQuery.isFetching },
    options,
    parties,
    selectedParty,
    total: listQuery.data?.total ?? 0,
    isLoading: listQuery.isLoading,
  };
}
