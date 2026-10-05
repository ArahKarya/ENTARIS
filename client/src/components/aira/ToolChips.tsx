// Chip progres tool ("Mengambil piutang jatuh tempo…" → selesai) di atas jawaban AIRA.

import { AlertCircle, Check, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { collapseChips } from './chipUtils';
import type { ToolChip } from './types';

export function ToolChips({ chips }: { chips: ReadonlyArray<ToolChip> }) {
  const items = collapseChips(chips);
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Langkah AIRA">
      {items.map((c, i) => (
        <li key={`${c.name}-${i}`}>
          <Badge variant={c.state === 'error' ? 'danger' : c.state === 'done' ? 'success' : 'primary'}>
            {c.state === 'start' && <Loader2 className="size-3 animate-spin" aria-hidden />}
            {c.state === 'done' && <Check className="size-3" aria-hidden />}
            {c.state === 'error' && <AlertCircle className="size-3" aria-hidden />}
            <span className="max-w-[16rem] truncate">{c.label}</span>
            <span className="sr-only">{c.state === 'done' ? ' (selesai)' : c.state === 'error' ? ' (gagal)' : ' (berjalan)'}</span>
          </Badge>
        </li>
      ))}
    </ul>
  );
}
