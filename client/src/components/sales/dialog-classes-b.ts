import { cn } from '@/lib/utils';
import { controlBase } from '@/components/ui/styles';

/** className for DialogContent: flex column, header + footer pinned, body scrolls. */
export const dialogShellClass = 'flex flex-col gap-0 overflow-hidden p-0';

/** Right-aligned tabular money input chrome (matches ui/Input). Use with RupiahInput. */
export const moneyInputClass = cn(
  controlBase,
  'flex h-10 px-3 py-1 text-right tabular-nums md:h-9',
);

/** Radix Select cannot hold an empty item value; map "no selection" through this sentinel. */
export const NONE_VALUE = '__none';
