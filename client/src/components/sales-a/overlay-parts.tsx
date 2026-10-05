/**
 * Shared anatomy for the Penjualan overlays (form dialogs + detail sheets):
 * fixed header, scrolling body, pinned footer. Composes the frozen ui/* kit via
 * className only.
 */
import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { DialogFooter, DialogHeader } from '@/components/ui/dialog';
import { Button, type ButtonProps } from '@/components/ui/button';

export function FormDialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <DialogHeader className={cn('shrink-0 border-b border-border px-6 py-4', className)} {...props} />;
}

export function FormDialogBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-4', className)} {...props} />;
}

export function FormDialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <DialogFooter
      className={cn('shrink-0 border-t border-border px-6 py-3 sm:justify-between', className)}
      {...props}
    />
  );
}

/** Touch-friendly footer button (44px on mobile). */
export function FooterButton({ className, ...props }: ButtonProps) {
  return <Button className={cn('max-sm:h-11', className)} {...props} />;
}

/** Horizontally scrollable, keyboard-focusable table wrapper. */
export function TableRegion({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="region"
      // Scrollable region must be keyboard reachable (WCAG 2.1.1).
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-label={label}
      className={cn(
        'relative overflow-x-auto rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Inline error banner announced to assistive tech. */
export function FormError({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md bg-danger-subtle px-3 py-2 text-sm text-danger-text">
      {children}
    </p>
  );
}
