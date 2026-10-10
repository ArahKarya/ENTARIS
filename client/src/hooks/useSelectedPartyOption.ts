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

/** Party row as returned by GET /parties and GET /parties/:id (fields the forms read). */
export interface PartyRecord extends KnownParty {
  partyType?: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxId?: string | null;
  isWapu?: boolean;
  isActive?: boolean;
  outstandingAmount?: number | string | null;
  depositBalance?: number | string | null;
  customerDepositBalance?: number | string | null;
}

/** Shared cache key for a party loaded by id; under ['parties'] so party mutations refresh it. */
export const partyOptionQueryKey = (partyId: string | null | undefined) => ['parties', 'option', partyId] as const;

export async function fetchPartyById(partyId: string): Promise<PartyRecord> {
  const res = await api.get<PartyRecord>(`/parties/${partyId}`);
  return res.data;
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
    queryKey: partyOptionQueryKey(partyId),
    queryFn: () => fetchPartyById(partyId as string),
    enabled: !!partyId && !inOptions && !knownMatches,
    staleTime: 5 * 60_000,
  });
  const selected = knownMatches ? known : fetched?.id === partyId ? fetched : null;
  return useMemo(() => mergeSelectedPartyOption(options, selected), [options, selected]);
}
