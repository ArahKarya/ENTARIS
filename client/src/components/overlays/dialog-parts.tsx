/**
 * Layout helpers for form dialogs with a scrollable body and a pinned footer.
 * Compose with the shared ui/dialog primitives; no behaviour lives here.
 */
import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';
import { DialogFooter, DialogHeader } from '@/components/ui/dialog';

/** className for DialogContent: header / body / footer as stacked rows. */
export const pinnedDialogClass = 'flex flex-col gap-0 overflow-hidden p-0';

export function PinnedHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <DialogHeader className={cn('shrink-0 border-b border-border px-6 py-4', className)} {...props} />;
}

export function PinnedBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 flex-1 overflow-y-auto px-6 py-4', className)} {...props} />;
}

export function PinnedFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <DialogFooter className={cn('shrink-0 border-t border-border px-6 py-3', className)} {...props} />;
}

/** Inline form-level error (server message), announced to assistive tech. */
export function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
      {message}
    </p>
  );
}
