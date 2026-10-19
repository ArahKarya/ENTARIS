import type { ReactNode } from 'react';
import { AlertTriangle, FileQuestion, SearchX, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type EmptyStateKind = 'empty' | 'no-results' | 'error';

/** Icon and `common:emptyState.<preset>.*` key per kind (text translated at render). */
const PRESETS: Record<EmptyStateKind, { icon: LucideIcon; key: 'empty' | 'noResults' | 'error' }> = {
  empty: { icon: FileQuestion, key: 'empty' },
  'no-results': { icon: SearchX, key: 'noResults' },
  error: { icon: AlertTriangle, key: 'error' },
};

export interface EmptyStateProps {
  /** empty = nothing created yet · no-results = filters hide everything · error = load failed */
  kind?: EmptyStateKind;
  icon?: LucideIcon;
  title?: ReactNode;
  description?: ReactNode;
  /** Primary next step, e.g. <Button>Buat invoice</Button>. */
  action?: ReactNode;
  /** Tighter spacing for use inside cards and table bodies. */
  compact?: boolean;
  className?: string;
}

export function EmptyState({ kind = 'empty', icon, title, description, action, compact, className }: EmptyStateProps) {
  const { t } = useTranslation('common');
  const preset = PRESETS[kind];
  const presetTitle = t(`emptyState.${preset.key}.title`);
  const presetDescription = t(`emptyState.${preset.key}.description`);
  const Icon = icon ?? preset.icon;
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={cn('flex flex-col items-center justify-center text-center', compact ? 'py-8' : 'py-16', className)}
    >
      <div
        className={cn(
          'flex size-14 items-center justify-center rounded-xl',
          kind === 'error' ? 'bg-danger-subtle text-danger-text' : 'bg-muted text-muted-foreground',
        )}
      >
        <Icon className="size-8" strokeWidth={1.5} aria-hidden />
      </div>
      <p className="mt-4 text-base font-semibold text-foreground">{title ?? presetTitle}</p>
      {(description ?? presetDescription) && (
        <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description ?? presetDescription}</p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
