import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { cn } from '@/lib/utils';
import { can } from '@/lib/permissions';
import { activeNavPath, matchRoute, navSections, type NavSection, type RouteEntry, type SectionId } from '@/app/routes';
import { BrandMark, Wordmark } from '@/components/shared/brand-mark';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SidebarProps {
  /** Drawer layout: full width, no rail toggle. */
  mobile?: boolean;
  /** Called after a nav link is clicked (closes the mobile drawer). */
  onNavigate?: () => void;
}

const RAIL_KEY = 'sidebar.collapsed';
const OPEN_KEY = 'sidebar.openSections';

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage blocked: state lasts for this session only */
  }
}

const ICON = { size: 16, strokeWidth: 1.75 } as const;

const itemBase =
  'relative flex items-center rounded-md text-sm font-medium text-sidebar-foreground transition-colors ' +
  'hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring';
const itemActive =
  'bg-sidebar-accent font-semibold text-sidebar-accent-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground ' +
  'before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:rounded-full before:bg-sidebar-primary';

function ShortChip({ text }: { text: string }) {
  return (
    <span className="ml-auto shrink-0 rounded-sm border border-sidebar-border px-1 py-px text-xs leading-4 font-medium text-muted-foreground">
      {text}
    </span>
  );
}

export function Sidebar({ mobile = false, onNavigate }: SidebarProps) {
  const { pathname } = useLocation();
  const baseId = useId();
  const [railStored, setRailStored] = useState<boolean>(() => readJSON<boolean>(RAIL_KEY, false) === true);
  const rail = !mobile && railStored;
  // Permissions come from the stored user, refreshed by ProtectedRoute before mount.
  const sections = useMemo<NavSection[]>(() => navSections((m) => can(m, 'view')), []);
  const activePath = activeNavPath(pathname);
  const activeSection = activePath ? matchRoute(activePath)?.section ?? null : null;

  const [open, setOpen] = useState<SectionId[]>(() => {
    const v = readJSON<unknown>(OPEN_KEY, []);
    const stored = Array.isArray(v) ? (v as SectionId[]) : [];
    return activeSection && !stored.includes(activeSection) ? [...stored, activeSection] : stored;
  });

  // Open the section of the current page when navigation moves into it
  // (adjusting state during render instead of in an effect).
  const [seenSection, setSeenSection] = useState(activeSection);
  if (activeSection !== seenSection) {
    setSeenSection(activeSection);
    if (activeSection && !open.includes(activeSection)) setOpen([...open, activeSection]);
  }

  useEffect(() => {
    writeJSON(OPEN_KEY, open);
  }, [open]);

  const toggleSection = useCallback((id: SectionId) => {
    setOpen((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }, []);

  const toggleRail = () => {
    setRailStored((prev) => {
      writeJSON(RAIL_KEY, !prev);
      return !prev;
    });
  };

  const renderLink = (item: RouteEntry) => {
    const active = item.path === activePath;
    const Icon = item.icon;
    const link = (
      <Link
        to={item.path}
        onClick={onNavigate}
        aria-current={active ? 'page' : undefined}
        aria-label={rail ? item.label : undefined}
        className={cn(
          itemBase,
          rail ? 'mx-auto size-10 justify-center' : 'h-9 gap-2.5 px-2.5',
          active ? itemActive : '',
        )}
      >
        <Icon {...ICON} className={cn('shrink-0', !active && 'opacity-80')} />
        {!rail && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
        {!rail && item.shortLabel && <ShortChip text={item.shortLabel} />}
      </Link>
    );
    if (!rail) return <li key={item.path}>{link}</li>;
    return (
      <li key={item.path}>
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{item.label}</TooltipContent>
        </Tooltip>
      </li>
    );
  };

  /** Rail: one icon per section opening a flyout with its pages. */
  const renderRailSection = (section: NavSection, index: number) => {
    const Icon = section.icon!;
    const hasActive = section.items.some((i) => i.path === activePath);
    // One divider separates the top block (Dasbor, AIRA) from the sections.
    const firstSection = index === sections.findIndex((s) => s.id !== 'main');
    return (
      <li key={section.id} className={cn(firstSection && index > 0 && 'mx-1 mt-1 border-t border-sidebar-border pt-2')}>
        <DropdownMenu modal={false}>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger
                aria-label={section.label}
                aria-current={hasActive ? 'true' : undefined}
                className={cn(itemBase, 'mx-auto size-10 justify-center', hasActive && itemActive)}
              >
                <Icon {...ICON} className={cn('shrink-0', !hasActive && 'opacity-80')} />
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent side="right">{section.label}</TooltipContent>
          </Tooltip>
          <DropdownMenuContent side="right" align="start" sideOffset={8} className="w-60">
            <DropdownMenuLabel className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </DropdownMenuLabel>
            {section.items.map((item) => {
              const active = item.path === activePath;
              const ItemIcon = item.icon;
              return (
                <DropdownMenuItem
                  key={item.path}
                  asChild
                  className={cn(active && 'bg-primary-subtle font-semibold text-primary-subtle-foreground')}
                >
                  <Link to={item.path} onClick={onNavigate} aria-current={active ? 'page' : undefined}>
                    <ItemIcon {...ICON} />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    {item.shortLabel && <ShortChip text={item.shortLabel} />}
                  </Link>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </li>
    );
  };

  const renderSection = (section: NavSection) => {
    if (section.id === 'main') {
      return (
        <ul key="main" className="flex flex-col gap-0.5">
          {section.items.map(renderLink)}
        </ul>
      );
    }
    const id = section.id as SectionId;
    const listId = `${baseId}-${id}`;
    const isOpen = open.includes(id);
    const hasActive = id === activeSection;
    return (
      <div key={id} className="mt-3">
        <button
          type="button"
          onClick={() => toggleSection(id)}
          aria-expanded={isOpen}
          aria-controls={listId}
          className={cn(
            'flex h-7 w-full items-center gap-2 rounded-md px-2.5 text-left text-xs font-semibold uppercase tracking-wider',
            'text-muted-foreground transition-colors hover:text-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring',
            hasActive && 'text-foreground',
          )}
        >
          <span className="min-w-0 flex-1 truncate">{section.label}</span>
          {!isOpen && hasActive && <span className="size-1.5 rounded-full bg-sidebar-primary" aria-hidden />}
          <ChevronDown
            size={14}
            strokeWidth={1.75}
            aria-hidden
            className={cn('shrink-0 transition-transform', !isOpen && '-rotate-90')}
          />
        </button>
        <ul id={listId} hidden={!isOpen} className="mt-0.5 flex flex-col gap-0.5">
          {section.items.map(renderLink)}
        </ul>
      </div>
    );
  };

  return (
    <aside
      data-no-print
      className={cn(
        'flex h-full flex-col bg-sidebar text-sidebar-foreground',
        !mobile && 'border-r border-sidebar-border transition-[width] duration-200 ease-out',
        mobile ? 'w-full' : rail ? 'w-16' : 'w-64',
      )}
    >
      <div className={cn('flex h-14 shrink-0 items-center border-b border-sidebar-border', rail ? 'justify-center' : 'px-4')}>
        <Link
          to="/"
          onClick={onNavigate}
          aria-label={rail ? 'Entaris, ke Dasbor' : undefined}
          className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
        >
          {rail ? <BrandMark variant="auto" size={28} title="" /> : <Wordmark size="md" product="ERP" />}
        </Link>
      </div>

      <TooltipProvider delayDuration={200}>
        <nav aria-label="Navigasi utama" className={cn('flex-1 overflow-y-auto overscroll-contain py-3', rail ? 'px-2' : 'px-3')}>
          {rail ? (
            <ul className="flex flex-col gap-1">
              {sections.map((s, i) =>
                s.id === 'main'
                  ? s.items.map(renderLink)
                  : renderRailSection(s, i),
              )}
            </ul>
          ) : (
            sections.map(renderSection)
          )}
        </nav>
      </TooltipProvider>

      {!mobile && (
        <div className={cn('shrink-0 border-t border-sidebar-border p-2', rail && 'flex justify-center')}>
          <button
            type="button"
            onClick={toggleRail}
            aria-label={rail ? 'Lebarkan sidebar' : 'Ciutkan sidebar'}
            className={cn(
              itemBase,
              'text-muted-foreground',
              rail ? 'size-10 justify-center' : 'h-9 w-full gap-2.5 px-2.5',
            )}
          >
            {rail ? <PanelLeftOpen {...ICON} aria-hidden /> : <PanelLeftClose {...ICON} aria-hidden />}
            {!rail && <span>Ciutkan</span>}
          </button>
        </div>
      )}
    </aside>
  );
}
