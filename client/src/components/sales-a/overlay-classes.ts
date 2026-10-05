/** Shared class strings for the Penjualan overlays (kept out of the .tsx so fast refresh stays happy). */
import { cn } from '@/lib/utils';
import { controlBase } from '@/components/ui/styles';

/** className for DialogContent: flex column so header/footer stay pinned. */
export const formDialogClass = 'flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0';

/** className for a <form> that wraps header + body + footer inside DialogContent. */
export const formShellClass = 'flex min-h-0 flex-1 flex-col';

/** Number-input chrome that matches Input (right aligned, tabular). */
export const numberInputClass = cn(controlBase, 'h-10 px-3 py-1 text-right tabular-nums md:h-9');
