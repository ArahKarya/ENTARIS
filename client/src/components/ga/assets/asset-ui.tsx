/**
 * Small building blocks shared by the asset register, the building page and
 * the equipment page: due-date marker, photo thumbnail, detail rows.
 */
import { useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Clock, ImageOff } from 'lucide-react';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { photoUrl, type DueInfo } from './asset-model';
import { useTranslation } from 'react-i18next';

const DUE_ICON = { overdue: AlertTriangle, dueSoon: Clock, ok: CheckCircle2 } as const;
const DUE_TEXT = { overdue: 'text-danger-text', dueSoon: 'text-warning-text', ok: 'text-muted-foreground' } as const;

interface DueMarkerProps {
  info: DueInfo | null;
  /** Show the date above the marker. */
  date?: string | null;
  /** Hide the marker when the state is "ok" (lists that only flag problems). */
  hideOk?: boolean;
  className?: string;
}

/**
 * Date with its due state. The state is carried by an icon and a text label,
 * never by colour alone.
 */
export function DueMarker({ info, date, hideOk = false, className }: DueMarkerProps) {
  const showMarker = !!info && !(hideOk && info.state === 'ok');
  if (date === undefined && !showMarker) return null;
  const Icon = info ? DUE_ICON[info.state] : null;
  return (
    <span className={cn('inline-flex flex-col items-start gap-0.5', className)}>
      {date !== undefined && (
        <span
          className={cn(
            'num whitespace-nowrap',
            info && info.state !== 'ok' ? 'font-medium text-foreground' : 'text-muted-foreground',
          )}
        >
          {formatDate(date)}
        </span>
      )}
      {showMarker && info && Icon && (
        <span className={cn('inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium', DUE_TEXT[info.state])}>
          <Icon className="size-3.5 shrink-0" aria-hidden />
          {info.label}
        </span>
      )}
    </span>
  );
}

interface AssetThumbProps {
  filePath?: string | null;
  alt: string;
  size?: 'sm' | 'md';
  className?: string;
}

/** Square photo thumbnail with a neutral placeholder (no photo / broken file). */
export function AssetThumb({ filePath, alt, size = 'sm', className }: AssetThumbProps) {
  const { t } = useTranslation('eam');
  const [broken, setBroken] = useState(false);
  const box = size === 'sm' ? 'size-10' : 'size-16';
  if (!filePath || broken) {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground', box, className)}
        title={t('assets.noPhoto')}
      >
        <ImageOff className="size-4" aria-hidden />
        <span className="sr-only">{t('assets.noPhoto')}</span>
      </span>
    );
  }
  return (
    <img
      src={photoUrl(filePath)}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      className={cn('shrink-0 rounded-md border border-border object-cover', box, className)}
    />
  );
}

/** Label/value pair inside a <dl>. */
export function Detail({ label, children, wide }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm text-foreground">{children}</dd>
    </div>
  );
}

/** Card section with a heading row and optional actions. */
export function Section({
  title,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-lg border border-border bg-card', className)}>
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
          {title}
        </h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={cn('p-4', bodyClassName)}>{children}</div>
    </section>
  );
}

/** Heading row above a table that brings its own card (DataTable). */
export function TableSection({
  title,
  icon,
  actions,
  children,
}: {
  title: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {icon && <span className="text-muted-foreground [&_svg]:size-4">{icon}</span>}
          {title}
        </h2>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
