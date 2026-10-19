import { Rows3, Rows4 } from 'lucide-react';
import type { TableDensity } from '@/hooks/useTableDensity';
import { cn } from '@/lib/utils';
import { useTranslation } from 'react-i18next';

export interface DensityToggleProps {
  value: TableDensity;
  onChange: (next: TableDensity) => void;
  className?: string;
}

const OPTIONS = [
  { value: 'comfortable', labelKey: 'density.comfortable', icon: Rows3 },
  { value: 'compact', labelKey: 'density.compact', icon: Rows4 },
] as const;

/** Two-button segmented control: Nyaman (44px rows) / Ringkas (36px rows). */
export function DensityToggle({ value, onChange, className }: DensityToggleProps) {
  const { t } = useTranslation();
  return (
    <div role="group" aria-label={t('density.groupLabel')} className={cn('inline-flex rounded-md border border-border bg-card p-0.5', className)}>
      {OPTIONS.map(({ value: v, labelKey, icon: Icon }) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          aria-label={t(labelKey)}
          title={t(labelKey)}
          onClick={() => onChange(v)}
          className={cn(
            'inline-flex size-8 items-center justify-center rounded-sm text-muted-foreground transition-colors md:size-7',
            'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === v && 'bg-muted text-foreground',
          )}
        >
          <Icon className="size-4" strokeWidth={1.75} aria-hidden />
        </button>
      ))}
    </div>
  );
}
