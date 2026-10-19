import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

type LoadingStateProps = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  /** Visible text naming what is loading, e.g. "Memuat log audit…" (default: common:states.loadingData). */
  label?: string;
};

export function LoadingState({ className, size = 'md', label }: LoadingStateProps) {
  const { t } = useTranslation('common');
  const iconSize = size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const padding = size === 'sm' ? 'py-8' : size === 'lg' ? 'py-24' : 'py-20';
  return (
    <div role="status" aria-live="polite" className={cn('flex flex-col items-center justify-center gap-3', padding, className)}>
      <Loader2 className={cn('animate-spin text-muted-foreground', iconSize)} strokeWidth={1.75} aria-hidden />
      <p className="text-sm text-muted-foreground">{label ?? t('states.loadingData')}</p>
    </div>
  );
}
