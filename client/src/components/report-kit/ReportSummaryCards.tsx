import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { StatCard } from '@/components/shared';
import { formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';

export interface SummaryItem {
  label: string;
  value: number;
  icon?: LucideIcon;
  hint?: ReactNode;
  /** Pre-formatted text shown instead of the rupiah format (e.g. "12,5%", "3 run"). The sign of `value` still drives the tone. */
  formatted?: string;
  /** 'auto' (default): negative amounts use the danger colour. The sign is always shown as (parentheses) too. */
  tone?: 'auto' | 'neutral' | 'positive' | 'negative';
}

export interface ReportSummaryCardsProps {
  items: ReadonlyArray<SummaryItem>;
  loading?: boolean;
  label?: string;
}

const COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
};

function toneClass(item: SummaryItem): string {
  const tone = item.tone ?? 'auto';
  if (tone === 'positive') return 'text-success-text';
  if (tone === 'negative' || (tone === 'auto' && item.value < 0)) return 'text-danger-text';
  return '';
}

/** KPI row built from the shared StatCard. Values are full rupiah, negatives in parentheses. */
export function ReportSummaryCards({ items, loading, label }: ReportSummaryCardsProps) {
  const { t } = useTranslation('reports');
  return (
    <section aria-label={label ?? t('kit.summaryCards')} className={cn('grid gap-3', COLS[Math.min(Math.max(items.length, 1), 4)])}>
      {items.map((item) => {
        const text = item.formatted ?? formatRupiah(item.value, { negative: 'parens' });
        return (
          <StatCard
            key={item.label}
            label={item.label}
            icon={item.icon}
            hint={item.hint}
            loading={loading}
            valueTitle={text}
            value={<span className={cn('break-words', toneClass(item))}>{text}</span>}
          />
        );
      })}
    </section>
  );
}
