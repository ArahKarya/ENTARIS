/**
 * Presentational building blocks shared by the sales overlays (form dialogs and
 * detail sheets): pinned header/footer with a scrolling body, and an announced
 * error banner. Pure layout, no behaviour.
 */
import type { ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export function OverlayHeader({ className, ...props }: React.ComponentProps<typeof DialogHeader>) {
  return <DialogHeader className={cn('shrink-0 border-b border-border px-6 pb-4 pt-5', className)} {...props} />;
}

export function OverlayBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-6 py-4', className)} {...props} />;
}

export function OverlayFooter({ className, ...props }: React.ComponentProps<typeof DialogFooter>) {
  return (
    <DialogFooter
      className={cn('shrink-0 border-t border-border bg-card px-6 py-3 [&>button]:min-h-11 sm:[&>button]:min-h-0', className)}
      {...props}
    />
  );
}

/** Server / submit error, announced to assistive tech. */
export function FormError({ message }: { message?: ReactNode }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}

/** Keyboard-focusable horizontal-scroll wrapper for tables inside an overlay. */
export function ScrollRegion({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable regions must be keyboard reachable
    <div role="region" tabIndex={0} aria-label={label} className={cn('overflow-x-auto rounded-md', className)}>
      {children}
    </div>
  );
}
