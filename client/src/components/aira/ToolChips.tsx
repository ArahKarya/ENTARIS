// Chip progres tool ("Mengambil piutang jatuh tempo…" → selesai) di atas jawaban AIRA.

import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { collapseChips } from './chipUtils';
import type { ToolChip } from './types';

export function ToolChips({ chips }: { chips: ReadonlyArray<ToolChip> }) {
  const { t } = useTranslation('aira');
  const items = collapseChips(chips);
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label={t('toolChips.label')}>
      {items.map((c, i) => (
        <li key={`${c.name}-${i}`}>
          <Badge variant={c.state === 'error' ? 'danger' : c.state === 'done' ? 'success' : 'primary'}>
            {c.state === 'start' && <Loader2 className="size-3 animate-spin" aria-hidden />}
            {c.state === 'done' && <Check className="size-3" aria-hidden />}
            {c.state === 'error' && <AlertCircle className="size-3" aria-hidden />}
            <span className="max-w-[16rem] truncate">{c.label}</span>
            <span className="sr-only">{t(c.state === 'done' ? 'toolChips.done' : c.state === 'error' ? 'toolChips.error' : 'toolChips.running')}</span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}
