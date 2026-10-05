import { PencilLine } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { AiraIcon } from '@/components/shell/AiraIcon';

/** Where the draft came from: read by AIRA from a photo, or entered by hand (paste/CSV). */
export function SourceChip({ source }: { source: 'manual' | 'aira' }) {
  return source === 'aira' ? (
    <Badge variant="info">
      <AiraIcon size={12} />
      AIRA
    </Badge>
  ) : (
    <Badge variant="neutral">
      <PencilLine className="size-3" aria-hidden />
      Manual
    </Badge>
  );
}
