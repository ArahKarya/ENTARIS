import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Keyboard-focusable, labelled scroll container (WCAG 2.1.1 / axe scrollable-region-focusable). */
export function ScrollRegion({ label, className, children }: { label: string; className?: string; children: ReactNode }) {
  return (
    <div
      role="region"
      // Scroll container must be keyboard reachable.
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      tabIndex={0}
      aria-label={label}
      className={cn('rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      {children}
    </div>
  );
}
