import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Tinted badges use the `-subtle` background with the matching `-text`
 * token (≥4.5:1). Solid fills are reserved for counts and emphasis.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm px-2 py-0.5 text-xs font-medium leading-4',
  {
    variants: {
      variant: {
        neutral: 'bg-neutral-subtle text-neutral-text',
        primary: 'bg-primary-subtle text-primary-subtle-foreground',
        success: 'bg-success-subtle text-success-text',
        warning: 'bg-warning-subtle text-warning-text',
        danger: 'bg-danger-subtle text-danger-text',
        info: 'bg-info-subtle text-info-text',
        outline: 'border border-border-strong text-foreground',
        solid: 'bg-primary text-primary-foreground',
        /** @deprecated use `primary` */
        default: 'bg-primary-subtle text-primary-subtle-foreground',
        /** @deprecated use `neutral` */
        secondary: 'bg-neutral-subtle text-neutral-text',
        /** @deprecated use `danger` */
        destructive: 'bg-danger-subtle text-danger-text',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
