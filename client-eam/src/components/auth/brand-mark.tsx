import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Entaris "Anyaman ∇" mark — copy of client/src/components/shared/brand-mark.tsx
 * (BrandMark only) until client-eam is merged into client (Phase 2.5).
 * Paths from docs/brand/entaris/entaris-mark*.svg. Do not restyle.
 */
const MARK_PATHS = [
  'M306.8 358.5L256.0 270.5L256.0 270.5L192.5 160.5L90.8 160.5L256.0 446.5Z',
  'M86.8 153.5L188.4 153.5L315.5 153.5L317.5 150.0L366.3 65.5L36.0 65.5Z',
  'M374.4 65.5L323.6 153.5L323.6 153.5L260.0 263.5L262.1 267.0L310.8 351.5L476.0 65.5Z',
] as const;

const MARK_FILLS = {
  default: ['#3D8BE0', '#1B2B48', '#2E5CA8'],
  negative: ['#3D8BE0', '#FFFFFF', '#9CC9F5'],
  mono: ['currentColor', 'currentColor', 'currentColor'],
} as const;

export type BrandVariant = keyof typeof MARK_FILLS | 'auto';

export interface BrandMarkProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /** default = light bg · negative = navy/dark bg · mono = currentColor · auto = follows theme. */
  variant?: BrandVariant;
  size?: number;
  /** Accessible name; pass "" when a visible wordmark sits next to it. */
  title?: string;
}

function MarkPaths({ variant }: { variant: keyof typeof MARK_FILLS }) {
  return (
    <>
      {MARK_PATHS.map((d, i) => (
        <path key={d} d={d} fill={MARK_FILLS[variant][i]} />
      ))}
    </>
  );
}

export function BrandMark({ variant = 'default', size = 24, title = 'Entaris', className, ...props }: BrandMarkProps) {
  const decorative = !title;
  const svgProps = {
    xmlns: 'http://www.w3.org/2000/svg',
    viewBox: '0 0 512 512',
    width: size,
    height: size,
    role: decorative ? undefined : ('img' as const),
    'aria-hidden': decorative ? true : undefined,
    'aria-label': decorative ? undefined : title,
    focusable: 'false' as const,
    ...props,
  };

  if (variant === 'auto') {
    return (
      <span className={cn('inline-flex shrink-0', className)} style={{ width: size, height: size }}>
        <svg {...svgProps} className="dark:hidden">
          {!decorative && <title>{title}</title>}
          <MarkPaths variant="default" />
        </svg>
        <svg {...svgProps} aria-hidden className="hidden dark:block">
          <MarkPaths variant="negative" />
        </svg>
      </span>
    );
  }

  return (
    <svg {...svgProps} className={cn('shrink-0', className)}>
      {!decorative && <title>{title}</title>}
      <MarkPaths variant={variant} />
    </svg>
  );
}
