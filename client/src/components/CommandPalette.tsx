import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Command } from 'cmdk';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Clock,
  CreditCard,
  FileText,
  List,
  Loader2,
  Monitor,
  Moon,
  Search,
  Sun,
  Users,
  type LucideIcon,
} from 'lucide-react';
import api from '@/lib/api';
import i18n from '@/i18n';
import { LOCALE } from '@/lib/format';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useDebounce } from '@/hooks/useDebounce';
import { useGoToShortcuts } from '@/hooks/useHotkeys';
import { useReturnFocus } from '@/hooks/useReturnFocus';
import { GO_TO_SHORTCUTS, comboKeycaps } from '@/hooks/shortcuts';
import { useTheme, type ThemeId } from '@/contexts/ThemeContext';
import { AiraIcon } from '@/components/shell/AiraIcon';
import { overlayClass } from '@/components/ui/styles';
import {
  accessibleRoutes,
  getSection,
  matchRoute,
  searchRoutes,
  type CanView,
  type RouteEntry,
} from '@/app/routes';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle?: string | null;
  url: string;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

type RecordTypeKey = 'party' | 'sales' | 'purchase' | 'payment' | 'journal' | 'account';

/** Record types returned by GET /api/search (labels follow the sidebar names, `shell:commandPalette.recordTypes.*`). */
const RECORD_TYPES: Record<string, { key: RecordTypeKey; icon: LucideIcon }> = {
  party: { key: 'party', icon: Users },
  sales: { key: 'sales', icon: FileText },
  purchase: { key: 'purchase', icon: FileText },
  payment: { key: 'payment', icon: CreditCard },
  journal: { key: 'journal', icon: BookOpen },
  account: { key: 'account', icon: List },
};

/** Label of a record type in the given (default: current) language. */
function recordTypeLabel(key: RecordTypeKey | undefined, lng?: string): string {
  return key
    ? i18n.t(`commandPalette.recordTypes.${key}`, { ns: 'shell', lng })
    : i18n.t('commandPalette.recordTypes.other', { ns: 'shell', lng });
}

/** Theme actions; `label` is `shell:commandPalette.theme.<id>`. Keywords stay bilingual for search. */
const THEME_ACTIONS: { id: ThemeId; icon: LucideIcon; keywords: string }[] = [
  { id: 'light', icon: Sun, keywords: 'tema terang light mode tampilan theme' },
  { id: 'dark', icon: Moon, keywords: 'tema gelap dark mode tampilan malam theme' },
  { id: 'system', icon: Monitor, keywords: 'tema sistem otomatis system tampilan theme' },
];

const MIN_RECORD_QUERY = 2;
const RECORD_LIMIT = 15;
const PAGE_LIMIT = 8;
const RECENT_LIMIT = 5;
const RECENT_KEY = 'palette.recent';

const canView: CanView = (m) => can(m, 'view');

const fold = (s: string) => s.toLocaleLowerCase(LOCALE).normalize('NFD').replace(/[̀-ͯ]/g, '');

const SHORTCUT_BY_PATH = new Map(GO_TO_SHORTCUTS.map((s) => [s.path, s.combos[0]]));

// Recent pages (per-viewer convenience; storage may be unavailable)
function readRecent(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

function pushRecent(path: string): void {
  try {
    const next = [path, ...readRecent().filter((p) => p !== path)].slice(0, RECENT_LIMIT + 1);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: recent list just stays empty */
  }
}

/** Remembers the registry page of every visited URL for the "Terakhir dibuka" group. */
function useTrackRecentPages() {
  const { pathname } = useLocation();
  useEffect(() => {
    const entry = matchRoute(pathname);
    if (entry) pushRecent(entry.path);
  }, [pathname]);
}

/**
 * Global command palette (⌘K / Ctrl+K). Pages use the same RBAC filter as the
 * sidebar. Also mounts the `g <key>` shortcuts since it is always inside the router.
 */
export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { t } = useTranslation('shell');
  useTrackRecentPages();
  useGoToShortcuts(!isOpen);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useReturnFocus();

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className={cn(overlayClass, 'z-[var(--z-palette)]')} />
        <DialogPrimitive.Content
          data-testid="command-palette"
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            returnFocus.capture();
            inputRef.current?.focus();
          }}
          onCloseAutoFocus={returnFocus.onCloseAutoFocus}
          className={cn(
            'fixed left-1/2 top-3 z-[var(--z-palette)] flex w-[calc(100vw-1.5rem)] max-w-[640px] -translate-x-1/2 flex-col overflow-hidden',
            'rounded-xl border border-border bg-popover text-popover-foreground shadow-[var(--shadow-3)] sm:top-[12vh]',
            'duration-150 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          )}
        >
          <DialogPrimitive.Title className="sr-only">{t('commandPalette.title')}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            {t('commandPalette.description')}
          </DialogPrimitive.Description>
          <PaletteBody inputRef={inputRef} onClose={onClose} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

interface PaletteBodyProps {
  inputRef: React.RefObject<HTMLInputElement | null>;
  onClose: () => void;
}

/** Mounted only while open, so the query and results start fresh each time. */
function PaletteBody({ inputRef, onClose }: PaletteBodyProps) {
  const { t } = useTranslation(['shell', 'common']);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { theme, setTheme } = useTheme();
  const [query, setQuery] = useState('');
  const trimmed = query.trim();
  const debounced = useDebounce(trimmed, 250);
  const recordQuery = debounced.length >= MIN_RECORD_QUERY ? debounced : '';

  // Same visibility rule as the sidebar: a page shows when can(module, 'view').
  const pages = useMemo(() => searchRoutes(trimmed, canView, PAGE_LIMIT), [trimmed]);
  const recent = useMemo(() => {
    if (trimmed) return [];
    const allowed = new Map(accessibleRoutes(canView).map((e) => [e.path, e]));
    const current = matchRoute(pathname)?.path;
    return readRecent()
      .filter((p) => p !== current)
      .map((p) => allowed.get(p))
      .filter((e): e is RouteEntry => !!e)
      .slice(0, RECENT_LIMIT);
  }, [trimmed, pathname]);
  const recentPaths = new Set(recent.map((e) => e.path));
  const pageItems = trimmed ? pages : pages.filter((e) => !recentPaths.has(e.path));

  const records = useQuery({
    queryKey: ['global-search', recordQuery],
    queryFn: async ({ signal }) => {
      const res = await api.get<SearchResult[]>('/search', { params: { q: recordQuery, limit: RECORD_LIMIT }, signal });
      return Array.isArray(res.data) ? res.data : [];
    },
    enabled: recordQuery.length > 0,
    staleTime: 30_000,
    retry: false,
  });
  // Hide records whose page the user cannot open (the link would be refused anyway).
  const recordItems = (recordQuery ? records.data ?? [] : []).filter((r) => {
    const route = matchRoute(r.url);
    return !route?.module || canView(route.module);
  });
  const waitingForRecords = trimmed.length >= MIN_RECORD_QUERY && (trimmed !== debounced || records.isFetching);

  const actions = useMemo(() => {
    const q = fold(trimmed);
    return THEME_ACTIONS.map((a) => ({ ...a, label: t(`commandPalette.theme.${a.id}`) })).filter(
      (a) => a.id !== theme && (!q || fold(`${a.label} ${a.keywords}`).includes(q)),
    );
  }, [trimmed, theme, t]);

  const go = (to: string, state?: unknown) => {
    onClose();
    navigate(to, state ? { state } : undefined);
  };

  const nothingFound =
    trimmed.length > 0 && pageItems.length === 0 && actions.length === 0 && recordItems.length === 0 && !waitingForRecords;

  return (
    <Command label={t('commandPalette.label')} shouldFilter={false} loop vimBindings={false} className="flex min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4 focus-within:shadow-[inset_0_-2px_0_var(--ring)]">
        <Search size={18} strokeWidth={1.75} className="shrink-0 text-muted-foreground" aria-hidden />
        <Command.Input
          ref={inputRef}
          value={query}
          onValueChange={setQuery}
          placeholder={t('commandPalette.placeholder')}
          className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground md:text-sm"
        />
        {waitingForRecords && (
          <Loader2 size={16} className="shrink-0 animate-spin text-muted-foreground" aria-hidden />
        )}
        <DialogPrimitive.Close
          className="hidden h-6 shrink-0 items-center rounded border border-border bg-muted px-1.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:inline-flex"
          aria-label={t('commandPalette.closeEsc')}
        >
          Esc
        </DialogPrimitive.Close>
        <DialogPrimitive.Close
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-sm text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
        >
          {t('common:actions.cancel')}
        </DialogPrimitive.Close>
      </div>

      <div role="status" aria-live="polite" className="empty:hidden">
        {nothingFound && (
          <p className="px-4 pt-4 pb-1 text-sm text-muted-foreground">
            {t('commandPalette.nothingFound', { query: trimmed })}
          </p>
        )}
        {trimmed.length === 1 && (
          <p className="px-4 pt-3 text-xs text-muted-foreground">{t('commandPalette.minChars', { count: MIN_RECORD_QUERY })}</p>
        )}
      </div>

      <Command.List
        aria-busy={waitingForRecords || undefined}
        className="max-h-[min(26rem,calc(100dvh-9rem))] overflow-y-auto overscroll-contain p-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground"
      >
        {recent.length > 0 && (
          <Command.Group heading={t('commandPalette.groups.recent')}>
            {recent.map((e) => (
              <PageItem key={e.path} entry={e} recent onSelect={() => go(e.path)} />
            ))}
          </Command.Group>
        )}

        {pageItems.length > 0 && (
          <Command.Group heading={t('commandPalette.groups.pages')}>
            {pageItems.map((e) => (
              <PageItem key={e.path} entry={e} onSelect={() => go(e.path)} />
            ))}
          </Command.Group>
        )}

        {(recordItems.length > 0 || (records.isError && recordQuery)) && (
          <Command.Group heading={t('commandPalette.groups.records')}>
            {records.isError ? (
              <p className="px-2 py-2 text-sm text-danger-text">{t('commandPalette.recordsError')}</p>
            ) : (
              recordItems.map((r) => {
                const type = RECORD_TYPES[r.type];
                const Icon = type?.icon ?? FileText;
                const typeLabel = recordTypeLabel(type?.key);
                // The server sends the Indonesian type name as subtitle; hide it in either language.
                const redundant = r.subtitle === typeLabel || r.subtitle === recordTypeLabel(type?.key, 'id');
                return (
                  <Item
                    key={`${r.type}-${r.id}`}
                    value={`record:${r.type}:${r.id}`}
                    icon={<Icon size={16} strokeWidth={1.75} aria-hidden />}
                    title={r.title}
                    subtitle={redundant ? null : r.subtitle}
                    trailing={<span className="text-xs text-muted-foreground">{typeLabel}</span>}
                    onSelect={() => go(r.url)}
                  />
                );
              })
            )}
          </Command.Group>
        )}

        {actions.length > 0 && (
          <Command.Group heading={t('commandPalette.groups.actions')}>
            {actions.map((a) => (
              <Item
                key={a.id}
                value={`action:theme:${a.id}`}
                icon={<a.icon size={16} strokeWidth={1.75} aria-hidden />}
                title={a.label}
                onSelect={() => {
                  setTheme(a.id);
                  onClose();
                }}
              />
            ))}
          </Command.Group>
        )}

        <Command.Group heading={t('commandPalette.groups.assistant')}>
          <Item
            value="action:aira"
            icon={<AiraIcon size={16} />}
            title={trimmed ? t('commandPalette.askAiraAbout', { query: trimmed }) : t('commandPalette.askAira')}
            subtitle={t('commandPalette.openAira')}
            onSelect={() => go('/aira', trimmed ? { prompt: trimmed } : undefined)}
          />
        </Command.Group>
      </Command.List>

      <div className="hidden shrink-0 items-center gap-4 border-t border-border px-4 py-2 text-xs text-muted-foreground sm:flex">
        <Hint keys={['↑', '↓']}>{t('commandPalette.hints.move')}</Hint>
        <Hint keys={['Enter']}>{t('commandPalette.hints.open')}</Hint>
        <Hint keys={['Esc']}>{t('commandPalette.hints.close')}</Hint>
      </div>
    </Command>
  );
}

function PageItem({ entry, recent, onSelect }: { entry: RouteEntry; recent?: boolean; onSelect: () => void }) {
  const Icon = recent ? Clock : entry.icon;
  const section = getSection(entry.section)?.label;
  const combo = SHORTCUT_BY_PATH.get(entry.path);
  return (
    <Item
      value={`${recent ? 'recent' : 'page'}:${entry.path}`}
      icon={<Icon size={16} strokeWidth={1.75} aria-hidden />}
      title={entry.label}
      chip={entry.shortLabel}
      trailing={
        combo ? (
          <Keycaps combo={combo} />
        ) : section ? (
          <span className="hidden text-xs text-muted-foreground sm:inline">{section}</span>
        ) : null
      }
      onSelect={onSelect}
    />
  );
}

interface ItemProps {
  value: string;
  icon: ReactNode;
  title: string;
  subtitle?: string | null;
  chip?: string;
  trailing?: ReactNode;
  onSelect: () => void;
}

function Item({ value, icon, title, subtitle, chip, trailing, onSelect }: ItemProps) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className={cn(
        'flex min-h-10 cursor-pointer select-none items-center gap-3 rounded-md px-2 py-1.5 text-sm text-foreground outline-none',
        'data-[selected=true]:bg-accent data-[selected=true]:shadow-[inset_2px_0_0_var(--primary)] data-[selected=true]:text-accent-foreground',
        '[&_svg]:shrink-0 [&_svg]:text-muted-foreground',
      )}
    >
      {icon}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium">{title}</span>
          {chip && (
            <span className="shrink-0 rounded border border-border px-1 text-[11px] leading-4 font-medium text-muted-foreground">
              {chip}
            </span>
          )}
        </span>
        {subtitle && <span className="block truncate text-xs text-muted-foreground">{subtitle}</span>}
      </span>
      {trailing}
    </Command.Item>
  );
}

function Keycaps({ combo }: { combo: string }) {
  return (
    <span className="hidden shrink-0 items-center gap-1 sm:flex" aria-hidden>
      {comboKeycaps(combo)
        .flat()
        .map((k, i) => (
          <kbd key={i} className="rounded border border-border bg-muted px-1 font-mono text-[11px] leading-4 text-muted-foreground">
            {k}
          </kbd>
        ))}
    </span>
  );
}

function Hint({ keys, children }: { keys: string[]; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1">
      {keys.map((k) => (
        <kbd key={k} className="rounded border border-border bg-muted px-1 font-mono leading-4">
          {k}
        </kbd>
      ))}
      <span>{children}</span>
    </span>
  );
}
