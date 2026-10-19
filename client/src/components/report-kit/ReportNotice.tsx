import type { ReactNode } from 'react';
import { AlertTriangle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ReportNoticeProps {
  tone?: 'warning' | 'info';
  children: ReactNode;
  className?: string;
}

/** Inline callout above a report (e.g. "debit-kredit tidak seimbang"). Icon + text, never colour alone. */
export function ReportNotice({ tone = 'warning', children, className }: ReportNoticeProps) {
  const Icon = tone === 'warning' ? AlertTriangle : Info;
  return (
    <div
      role={tone === 'warning' ? 'alert' : 'status'}
      className={cn(
        'no-print flex items-start gap-3 rounded-lg border p-3 text-sm',
        tone === 'warning' ? 'border-warning bg-warning-subtle text-warning-text' : 'border-info bg-info-subtle text-info-text',
        className,
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
