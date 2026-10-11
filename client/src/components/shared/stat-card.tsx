import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useMotion } from '@/contexts/motion-context';
import { CountUp } from './count-up';

export interface StatDelta {
  /** Display text, e.g. "+12%" or "Rp 3,2 jt". */
  value: string;
  direction: 'up' | 'down' | 'flat';
  /** Whether "up" is good (revenue) or bad (overdue AR). Default true. */
  upIsGood?: boolean;
  /** Context, e.g. "vs bulan lalu". */
  label?: string;
}

export interface StatCardProps {
  label?: ReactNode;
  /** @deprecated use `label` */
  title?: ReactNode;
  /** Pre-formatted value (use lib/format). */
  value: ReactNode;
  /** Full value for the tooltip when `value` is compact. */
  valueTitle?: string;
  hint?: ReactNode;
  /** @deprecated use `hint` */
  subtitle?: ReactNode;
  icon?: LucideIcon;
  delta?: StatDelta;
  /** @deprecated use `delta` */
  trend?: { value: string; positive: boolean };
  /** Drill-down link; the whole card becomes the link. */
  href?: string;
  loading?: boolean;
  className?: string;
}

function DeltaChip({ delta }: { delta: StatDelta }) {
  const { direction, upIsGood = true } = delta;
  const good = direction === 'flat' ? null : (direction === 'up') === upIsGood;
  const Icon = direction === 'up' ? ArrowUpRight : direction === 'down' ? ArrowDownRight : Minus;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-sm px-1.5 py-0.5 text-xs font-medium num',
        good === null && 'bg-neutral-subtle text-neutral-text',
        good === true && 'bg-success-subtle text-success-text',
        good === false && 'bg-danger-subtle text-danger-text',
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {delta.value}
    </span>
  );
}

export function StatCard({
  label,
  title,
  value,
  valueTitle,
  hint,
  subtitle,
  icon: Icon,
  delta,
  trend,
  href,
  loading,
  className,
}: StatCardProps) {
  const { t } = useTranslation('common');
  const { motion } = useMotion();
  const countUp = motion === 'lively' && (typeof value === 'string' || typeof value === 'number');
  const effectiveDelta: StatDelta | undefined =
    delta ?? (trend ? { value: trend.value, direction: trend.positive ? 'up' : 'down' } : undefined);
  const note = hint ?? subtitle;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="min-w-0 truncate text-sm font-medium text-muted-foreground">
          {label ?? title}
        </p>
        {Icon && (
          <Icon className="mt-0.5 hidden size-4 shrink-0 text-muted-foreground sm:block" strokeWidth={1.75} aria-hidden />
        )}
      </div>
      {loading ? (
        <div className="mt-2 h-8 w-32 animate-pulse rounded-md bg-muted" aria-hidden />
      ) : (
        <>
          <p className="mt-1 font-heading text-[28px] font-bold leading-[34px] tracking-tight text-foreground num">
            {countUp ? <CountUp key={String(value)} text={String(value)} /> : value}
          </p>
          {valueTitle && valueTitle !== value && <p className="text-xs text-muted-foreground num">{valueTitle}</p>}
        </>
      )}
      {(effectiveDelta || note) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {effectiveDelta && <DeltaChip delta={effectiveDelta} />}
          {effectiveDelta?.label && <span>{effectiveDelta.label}</span>}
          {note && <span className="min-w-0 truncate">{note}</span>}
        </div>
      )}
      {href && (
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary">
          {t('statCard.viewDetail')} <ArrowRight className="size-3.5" aria-hidden />
        </span>
      )}
    </>
  );

  const shell = cn(
    'block rounded-lg border border-border bg-card p-4 text-card-foreground shadow-[var(--shadow-1)]',
    className,
  );

  if (href) {
    return (
      <Link
        to={href}
        className={cn(
          shell,
          'transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        )}
      >
        {body}
      </Link>
    );
  }
  return (
    <div className={shell} aria-busy={loading || undefined}>
      {body}
    </div>
  );
}
