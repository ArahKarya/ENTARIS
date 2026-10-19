import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BreadcrumbItemData {
  label: string;
  href?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** @deprecated use `description` */
  subtitle?: ReactNode;
  icon?: LucideIcon;
  /** One primary action; extra actions as outline buttons or a ⋯ menu. */
  actions?: ReactNode;
  /** @deprecated use `actions` */
  action?: ReactNode;
  /** Custom breadcrumb node (slot). Takes precedence over `breadcrumbs`. */
  breadcrumb?: ReactNode;
  /** Simple breadcrumb trail rendered as links. */
  breadcrumbs?: BreadcrumbItemData[];
  /** Tabs or filters rendered under the title row. */
  children?: ReactNode;
  className?: string;
}

function Breadcrumbs({ items }: { items: BreadcrumbItemData[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {index > 0 && <ChevronRight className="size-3.5" aria-hidden />}
              {item.href && !last ? (
                <Link
                  to={item.href}
                  className="rounded-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="font-medium text-foreground" aria-current={last ? 'page' : undefined}>
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export function PageHeader({
  title,
  description,
  subtitle,
  icon: Icon,
  actions,
  action,
  breadcrumb,
  breadcrumbs,
  children,
  className,
}: PageHeaderProps) {
  const desc = description ?? subtitle;
  const acts = actions ?? action;
  const crumbs = breadcrumb ?? (breadcrumbs && breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null);

  return (
    <header className={cn('flex flex-col gap-3 pb-4', className)}>
      {crumbs && <div className="hidden sm:block">{crumbs}</div>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
              <Icon className="size-5" strokeWidth={1.75} aria-hidden />
            </span>
          )}
          <div className="min-w-0">
            <h1 className="font-heading text-[22px] font-semibold leading-7 tracking-tight text-foreground">{title}</h1>
            {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
          </div>
        </div>
        {acts && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{acts}</div>}
      </div>
      {children}
    </header>
  );
}
