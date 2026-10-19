import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Search } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Crumb } from '@/app/routes';
import { Breadcrumbs } from './Breadcrumbs';
import { AiraIcon } from './AiraIcon';

interface TopbarProps {
  breadcrumbs: Crumb[];
  onOpenMenu: () => void;
  onOpenSearch: () => void;
  /** Notification bell slot (rendered between AIRA and the user menu). */
  notifications?: ReactNode;
  /** User menu slot (rightmost). */
  userMenu?: ReactNode;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent);
const iconButton =
  'inline-flex size-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card';

export function Topbar({ breadcrumbs, onOpenMenu, onOpenSearch, notifications, userMenu }: TopbarProps) {
  const { t } = useTranslation('shell');
  const shortcut = isMac ? '⌘K' : 'Ctrl K';
  return (
    <header
      data-no-print
      className="sticky top-0 z-[var(--z-sticky)] flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card px-3 sm:gap-3 lg:px-6"
    >
      <button type="button" onClick={onOpenMenu} aria-label={t('topbar.openMenu')} className={cn(iconButton, '-ml-1 lg:hidden')}>
        <Menu size={20} strokeWidth={1.75} aria-hidden />
      </button>

      <Breadcrumbs items={breadcrumbs} className="flex-1" />

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <button
          type="button"
          onClick={onOpenSearch}
          aria-label={t('topbar.search')}
          aria-keyshortcuts="Control+K Meta+K"
          className={cn(
            iconButton,
            'md:h-9 md:w-44 md:justify-start md:gap-2 md:border md:border-input md:bg-background md:px-3 md:text-sm xl:w-80',
          )}
        >
          <Search size={16} strokeWidth={1.75} aria-hidden />
          {/* Short placeholder below xl leaves the breadcrumb room next to the sidebar. */}
          <span className="hidden flex-1 truncate text-left md:inline xl:hidden">{t('topbar.searchShort')}</span>
          <span className="hidden flex-1 truncate text-left xl:inline">{t('topbar.searchLong')}</span>
          <kbd className="hidden rounded border border-border bg-muted px-1.5 font-mono text-xs leading-5 text-muted-foreground md:inline">
            {shortcut}
          </kbd>
        </button>

        <Link
          to="/aira"
          aria-label={t('topbar.askAira')}
          className={cn(
            iconButton,
            'sm:w-auto sm:gap-2 sm:border sm:border-border-strong sm:bg-card sm:px-3 sm:text-sm sm:font-medium sm:text-foreground',
          )}
        >
          <AiraIcon size={16} />
          <span className="hidden sm:inline">{t('topbar.askAira')}</span>
        </Link>

        {notifications}

        <span aria-hidden className="mx-0.5 hidden h-6 w-px bg-border sm:block" />

        {userMenu}
      </div>
    </header>
  );
}
