/** Options for the asset PIC (penanggung jawab) picker. */
import type { ComboboxOption } from '@/components/shared';
import { tEam } from '../eam-i18n';

export interface PicUserOption {
  id: string;
  fullName: string;
}

/**
 * Users as picker options; the current PIC stays selectable (with its stored name) even when
 * the user list cannot be loaded or does not include them, so saving never drops the PIC.
 */
export function picOptions(
  users: readonly PicUserOption[] | undefined,
  current: { id: string; fullName: string | null } | null | undefined,
): ComboboxOption[] {
  const options = (users ?? []).map((u) => ({ value: u.id, label: u.fullName }));
  if (current && !options.some((o) => o.value === current.id)) {
    options.unshift({ value: current.id, label: current.fullName ?? tEam('assets.unknownUser') });
  }
  return options;
}
