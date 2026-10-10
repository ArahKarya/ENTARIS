import type { SVGProps } from 'react';
import { cn } from '@/lib/utils';

/**
 * Entaris "Anyaman ∇" mark — paths copied from docs/brand/entaris/entaris-mark*.svg
 * (512 canvas). Do not restyle: no gradients, shadows or rotation (brand README).
 */
const MARK_PATHS = [
  'M306.8 358.5L256.0 270.5L256.0 270.5L192.5 160.5L90.8 160.5L256.0 446.5Z',
  'M86.8 153.5L188.4 153.5L315.5 153.5L317.5 150.0L366.3 65.5L36.0 65.5Z',
  'M374.4 65.5L323.6 153.5L323.6 153.5L260.0 263.5L262.1 267.0L310.8 351.5L476.0 65.5Z',
] as const;

/** Fill per bar, in path order: light-blue bar, top bar, third bar. */
const MARK_FILLS = {
  default: ['#3D8BE0', '#1B2B48', '#2E5CA8'],
  negative: ['#3D8BE0', '#FFFFFF', '#9CC9F5'],
  mono: ['currentColor', 'currentColor', 'currentColor'],
} as const;

export type BrandVariant = keyof typeof MARK_FILLS | 'auto';
export type ProductCode = 'ERP';

export interface BrandMarkProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  /**
   * default = light backgrounds · negative = navy/dark backgrounds ·
   * mono = one colour (currentColor) · auto = default in light theme, negative in dark.
   */
  variant?: BrandVariant;
  /** Pixel size (square). Minimum legible size is 16. */
  size?: number;
  /** Accessible name; omit (or pass "") when a visible wordmark sits next to it. */
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
    // Two copies toggled by the theme class: no JS, no flash.
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

const WORDMARK_SIZES = {
  sm: { mark: 20, text: 'text-sm', chip: 'text-[0.625rem] px-1 py-px', tagline: 'text-[0.5625rem]' },
  md: { mark: 28, text: 'text-lg', chip: 'text-[11px] px-1.5 py-0.5', tagline: 'text-[0.625rem]' },
  lg: { mark: 40, text: 'text-2xl', chip: 'text-xs px-1.5 py-0.5', tagline: 'text-[11px]' },
} as const;

export interface WordmarkProps {
  /** Product chip after the wordmark. Omit for the plain brand. */
  product?: ProductCode;
  variant?: BrandVariant;
  size?: keyof typeof WORDMARK_SIZES;
  /** Show the ∇ mark before the text (default true). */
  showMark?: boolean;
  /** Show "AGENTIC REASONING SYSTEM" under the wordmark. */
  tagline?: boolean;
  className?: string;
}

/**
 * ENTARIS wordmark rendered as text in the app's heading font (owner decision:
 * no Archivo dependency). "TA" is brand blue; the rest is navy (white on dark).
 */
export function Wordmark({
  product,
  variant = 'auto',
  size = 'md',
  showMark = true,
  tagline = false,
  className,
}: WordmarkProps) {
  const s = WORDMARK_SIZES[size];
  const textColor =
    variant === 'negative'
      ? 'text-white'
      : variant === 'mono'
        ? 'text-current'
        : variant === 'auto'
          ? 'text-[#1B2B48] dark:text-white'
          : 'text-[#1B2B48]';
  // Brand blue #3D8BE0 is 3.5:1 on white: fine for large text only (brand README).
  // sm/md render below 18.66px bold, so they use the brand mid-blue #2E5CA8 (6.3:1).
  const lightAccent = size === 'lg' ? 'text-[#3D8BE0]' : 'text-[#2E5CA8]';
  const accentColor = variant === 'mono' ? '' : variant === 'negative' ? 'text-[#9CC9F5]' : lightAccent;
  const autoAccent = variant === 'auto' ? cn(lightAccent, 'dark:text-[#9CC9F5]') : accentColor;
  const label = product ? `Entaris ${product}` : 'Entaris';

  return (
    <span className={cn('inline-flex items-center gap-2', className)} role="img" aria-label={label}>
      {showMark && <BrandMark variant={variant} size={s.mark} title="" />}
      <span className="flex flex-col leading-none" aria-hidden>
        <span className="flex items-center gap-1.5">
          <span className={cn('font-heading font-extrabold uppercase tracking-[0.06em]', s.text, textColor)}>
            EN<span className={autoAccent}>TA</span>RIS
          </span>
          {product && (
            <span
              className={cn(
                'rounded-sm border font-semibold uppercase tracking-wide',
                s.chip,
                variant === 'negative'
                  ? 'border-white/40 text-white'
                  : variant === 'mono'
                    ? 'border-current'
                    : 'border-border-strong text-foreground-secondary',
              )}
            >
              {product}
            </span>
          )}
        </span>
        {tagline && (
          <span
            className={cn(
              'mt-1 font-medium uppercase tracking-[0.18em]',
              s.tagline,
              variant === 'negative' ? 'text-white/80' : variant === 'mono' ? 'text-current' : 'text-muted-foreground',
            )}
          >
            Agentic Reasoning System
          </span>
        )}
      </span>
    </span>
  );
}
