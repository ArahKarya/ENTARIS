import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Crumb } from '@/app/routes';
import { cn } from '@/lib/utils';

interface BreadcrumbsProps {
  items: Crumb[];
  className?: string;
}

/**
 * Topbar trail from the route registry. Below sm only the current page shows;
 * when space is short, ancestors truncate before the current page does.
 * The last crumb is the page (aria-current), never a link.
 */
export function Breadcrumbs({ items, className }: BreadcrumbsProps) {
  if (items.length === 0) return null;
  return (
    <nav aria-label="Breadcrumb" className={cn('min-w-0', className)}>
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <Fragment key={`${item.label}-${index}`}>
              {index > 0 && (
                <li aria-hidden className="hidden shrink-0 text-muted-foreground sm:block">
                  <ChevronRight size={14} strokeWidth={1.75} />
                </li>
              )}
              <li className={cn('truncate', last ? 'max-w-full shrink-0' : 'hidden min-w-0 sm:block')}>
                {last ? (
                  <span aria-current="page" className="font-semibold text-foreground">
                    {item.label}
                  </span>
                ) : item.href ? (
                  <Link
                    to={item.href}
                    className="rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span className="text-muted-foreground">{item.label}</span>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
