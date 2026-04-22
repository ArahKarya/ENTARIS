import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type LoadingStateProps = {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
};

export function LoadingState({ className, size = 'md' }: LoadingStateProps) {
  const iconSize = size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-10 w-10' : 'h-8 w-8';
  const padding = size === 'sm' ? 'py-8' : size === 'lg' ? 'py-24' : 'py-20';
  return (
    <div className={cn('flex items-center justify-center', padding, className)}>
      <Loader2 className={cn('animate-spin text-muted-foreground', iconSize)} strokeWidth={1.75} />
    </div>
  );
}
