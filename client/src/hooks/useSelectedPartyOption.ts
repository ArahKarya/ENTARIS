import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export interface PartyPickerOption {
  value: string;
  label: string;
}

export interface KnownParty {
  id: string;
  name: string;
}

/**
 * Returns the options with the selected party appended when the picker list does not contain it
 * (picker lists are capped, so an edited document's party can fall outside the loaded page).
 */
export function mergeSelectedPartyOption<T extends PartyPickerOption>(
  options: readonly T[],
  selected: KnownParty | null | undefined,
): Array<T | PartyPickerOption> {
  if (!selected?.id || options.some((o) => o.value === selected.id)) return [...options];
  return [...options, { value: selected.id, label: selected.name }];
}

/**
 * Keeps the currently selected party visible in a capped picker. Uses `known` (for example the
 * party already returned with the document) when given, otherwise loads it by id.
 */
export function useSelectedPartyOption<T extends PartyPickerOption>(
  options: readonly T[],
  partyId: string | null | undefined,
  known?: KnownParty | null,
): Array<T | PartyPickerOption> {
  const inOptions = !!partyId && options.some((o) => o.value === partyId);
  const knownMatches = !!partyId && known?.id === partyId;
  const { data: fetched } = useQuery({
    queryKey: ['party-option', partyId],
    queryFn: async () => {
      const res = await api.get<KnownParty>(`/parties/${partyId}`);
      return { id: res.data.id, name: res.data.name };
    },
    enabled: !!partyId && !inOptions && !knownMatches,
    staleTime: 5 * 60_000,
  });
  const selected = knownMatches ? known : fetched?.id === partyId ? fetched : null;
  return useMemo(() => mergeSelectedPartyOption(options, selected), [options, selected]);
}
