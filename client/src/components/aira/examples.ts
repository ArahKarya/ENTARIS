// Contoh permintaan di keadaan kosong (diterjemahkan saat dipakai agar mengikuti bahasa UI).

import i18n from '@/i18n';

const EXAMPLE_KEYS = ['receivables', 'cashBook', 'approvals'] as const;

export function examplePrompts(): string[] {
  return EXAMPLE_KEYS.map((k) => i18n.t(`aira:empty.examples.${k}`));
}
