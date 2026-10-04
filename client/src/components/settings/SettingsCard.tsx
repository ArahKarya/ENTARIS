import type { ReactNode } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface SettingsCardProps {
  title: ReactNode;
  description?: ReactNode;
  /** Header actions (e.g. "Tambah"). */
  actions?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Tone for the danger zone card. */
  tone?: 'default' | 'danger';
}

/** Consistent settings card: title + description + optional actions, then content. */
export function SettingsCard({
  title, description, actions, footer, children, className, contentClassName, tone = 'default',
}: SettingsCardProps) {
  return (
    <Card className={cn(tone === 'danger' && 'border-danger/40', className)}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 basis-60">
          <CardTitle className={cn('text-base', tone === 'danger' && 'text-danger-text')}>{title}</CardTitle>
          {description && <CardDescription className="mt-1">{description}</CardDescription>}
        </div>
        {actions && <div className="flex max-w-full flex-wrap items-center gap-2">{actions}</div>}
      </CardHeader>
      {children !== undefined && <CardContent className={contentClassName}>{children}</CardContent>}
      {footer && <CardFooter>{footer}</CardFooter>}
    </Card>
  );
}
