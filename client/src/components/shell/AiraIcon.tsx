import { cn } from '@/lib/utils';
import type { RouteIconProps } from '@/app/routes';

/**
 * AIRA "Lipat Δ" mark (docs/brand/aira) as inline SVG with a lucide-like API
 * (size + className), so it stays crisp at 16px. Light theme uses the colour
 * mark; dark theme switches to the negative variant (light crossbar, white
 * right leg) through the theme class, no JS.
 * Decorative: the visible label next to it carries the name.
 */
export function AiraIcon({ size = 16, className, tone = 'auto' }: RouteIconProps & { tone?: 'auto' | 'negative' }) {
  const negative = tone === 'negative';
  return (
    <svg
      viewBox="0 0 512 512"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={cn('block shrink-0', className)}
    >
      {/* left leg (agent) */}
      <path fill="#3D8BE0" d="M36.0 446.5L137.6 446.5L252.0 248.5L201.1 160.5Z" />
      {/* crossbar (tool layer) */}
      <path className={negative ? 'fill-[#9CC9F5]' : 'fill-[#2E5CA8] dark:fill-[#9CC9F5]'} d="M398.3 312.0L223.4 312.0L189.9 370.0L431.8 370.0Z" />
      {/* right leg (human approver) */}
      <path
        className={negative ? 'fill-white' : 'fill-[#1B2B48] dark:fill-white'}
        d="M205.2 153.5L292.7 305.0L394.3 305.0L256.0 65.5ZM374.4 446.5L476.0 446.5L435.9 377.0L334.3 377.0Z"
      />
    </svg>
  );
}
