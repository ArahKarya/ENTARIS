import type { ReactNode } from 'react';
import { AlertCircle, AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tone = 'danger' | 'warning' | 'info' | 'success' | 'neutral';

const TONES: Record<Tone, string> = {
  danger: 'border-danger/30 bg-danger-subtle text-danger-text',
  warning: 'border-warning/30 bg-warning-subtle text-warning-text',
  info: 'border-info/30 bg-info-subtle text-info-text',
  success: 'border-success/30 bg-success-subtle text-success-text',
  neutral: 'border-border bg-muted text-foreground',
};

/** Inline banner. `danger` is announced assertively (role=alert); others use role=status. */
export function Callout({
  tone = 'danger',
  children,
  className,
  icon,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  const Icon = tone === 'danger' ? AlertCircle : tone === 'warning' ? AlertTriangle : Info;
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn('flex items-start gap-2 rounded-lg border p-3 text-sm', TONES[tone], className)}
    >
      {icon ?? <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export function ErrorAlert({ message, className }: { message?: string | null; className?: string }) {
  if (!message) return null;
  return (
    <Callout tone="danger" className={className}>
      {message}
    </Callout>
  );
}
