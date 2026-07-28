import type { LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

type BreadcrumbItemData = {
  label: string;
  href?: string;
};

type PageHeaderProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  breadcrumbs?: BreadcrumbItemData[];
  action?: React.ReactNode;
};

export function PageHeader({ title, subtitle, icon: Icon, breadcrumbs, action }: PageHeaderProps) {
  return (
    <div className="space-y-2 border-b border-border pb-4">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="hidden sm:block">
          <ol className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {breadcrumbs.map((item, index) => (
              <li key={item.label} className="flex items-center gap-1.5">
                {index > 0 && <ChevronRight className="h-3 w-3" />}
                {item.href ? (
                  <Link
                    to={item.href}
                    className="hover:text-foreground transition-colors"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-foreground font-medium">{item.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {Icon && (
            <Icon className="h-5 w-5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-semibold tracking-tight text-foreground truncate">
              {title}
            </h1>
            {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
