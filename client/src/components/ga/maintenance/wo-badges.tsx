import { StatusBadge } from '@/components/shared';
import { PRIORITY_LABELS, PRIORITY_TONE, type WoPriority } from './wo-meta';

/** Priority chip: always a text label ("Mendesak", "Tinggi", …) plus a tone. */
export function PriorityBadge({ priority, className }: { priority: WoPriority; className?: string }) {
  return (
    <StatusBadge
      label={PRIORITY_LABELS[priority] ?? priority}
      tone={PRIORITY_TONE[priority] ?? 'neutral'}
      className={className}
    />
  );
}
