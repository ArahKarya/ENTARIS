import { cn } from '@/lib/utils';
import type { RouteIconProps } from '@/app/routes';

/**
 * AIRA logo with a lucide-like API (size + className). Navy symbol in light
 * theme, white symbol in dark; swapped by the theme class, no JS.
 * Decorative: the visible label next to it carries the name.
 */
export function AiraIcon({ size = 16, className }: RouteIconProps) {
  const common = { width: size, height: size, 'aria-hidden': true, draggable: false } as const;
  return (
    <>
      <img src="/aira-icon.png" alt="" {...common} className={cn('block object-contain dark:hidden', className)} />
      <img src="/aira-icon-light.png" alt="" {...common} className={cn('hidden object-contain dark:block', className)} />
    </>
  );
}
