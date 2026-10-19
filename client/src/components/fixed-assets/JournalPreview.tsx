import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface JournalPreviewLine {
  side: 'DR' | 'CR';
  account: ReactNode;
  amount?: ReactNode;
}

interface JournalPreviewProps {
  title?: string;
  lines: JournalPreviewLine[];
  note?: ReactNode;
  className?: string;
}

/** Compact "journal that will be created" box used before every GL posting. */
export function JournalPreview({ title, lines, note, className }: JournalPreviewProps) {
  const { t } = useTranslation('finance');
  return (
    <div className={cn('rounded-md border border-border bg-muted/50 px-3 py-2.5 text-sm', className)}>
      <p className="text-xs font-medium text-muted-foreground">{title ?? t('journalPreview.title')}</p>
      <dl className="mt-1.5 space-y-1">
        {lines.map((line, i) => (
          <div key={i} className="flex items-baseline gap-2">
            <dt
              className={cn(
                'w-7 shrink-0 font-mono text-xs font-semibold',
                line.side === 'DR' ? 'text-info-text' : 'text-success-text',
              )}
            >
              {line.side}
            </dt>
            <dd className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
              <span className="min-w-0 break-words text-foreground">{line.account}</span>
              {line.amount !== undefined && <span className="num shrink-0 text-foreground">{line.amount}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
