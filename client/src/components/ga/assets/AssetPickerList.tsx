/**
 * Left-hand asset list of the master-detail pages (Gedung & Sewa, Peralatan &
 * Kalibrasi): local search, selection (aria-current) and a per-asset marker
 * slot (rental expiry / calibration due).
 */
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared';
import { cn } from '@/lib/utils';
import { LOCALE } from '@/lib/format';
import { useTranslation } from 'react-i18next';

export interface PickerAsset {
  id: string;
  code: string;
  name: string;
  category?: { name?: string } | null;
  branch?: { name?: string } | null;
  location?: string | null;
}

interface AssetPickerListProps<T extends PickerAsset> {
  /** Accessible name of the list, e.g. "Daftar gedung". */
  label: string;
  assets: readonly T[];
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  selectedId: string | null;
  onSelect: (asset: T) => void;
  renderMarker?: (asset: T) => ReactNode;
  /** Shown when there are no assets at all. */
  empty: { title: string; description: ReactNode; action?: ReactNode };
  searchPlaceholder: string;
}

function filterPickerAssets<T extends PickerAsset>(assets: readonly T[], search: string): T[] {
  const q = search.trim().toLocaleLowerCase(LOCALE);
  if (!q) return [...assets];
  return assets.filter((a) =>
    [a.code, a.name, a.location, a.branch?.name, a.category?.name].some((f) => !!f && f.toLocaleLowerCase(LOCALE).includes(q)),
  );
}

export function AssetPickerList<T extends PickerAsset>({
  label,
  assets,
  loading,
  error,
  onRetry,
  selectedId,
  onSelect,
  renderMarker,
  empty,
  searchPlaceholder,
}: AssetPickerListProps<T>) {
  const { t } = useTranslation('eam');
  const id = useId();
  const [search, setSearch] = useState('');
  const visible = useMemo(() => filterPickerAssets(assets, search), [assets, search]);

  let body: ReactNode;
  if (loading) {
    body = (
      <div className="space-y-2 p-3" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  } else if (error) {
    body = (
      <EmptyState
        kind="error"
        compact
        action={
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t('assets.picker.retry')}
          </Button>
        }
      />
    );
  } else if (assets.length === 0) {
    body = <EmptyState compact title={empty.title} description={empty.description} action={empty.action} className="px-4" />;
  } else if (visible.length === 0) {
    body = (
      <EmptyState
        kind="no-results"
        compact
        description={t('assets.picker.tryOther')}
        action={
          <Button variant="outline" size="sm" onClick={() => setSearch('')}>
            {t('assets.picker.clearSearch')}
          </Button>
        }
      />
    );
  } else {
    body = (
      <ul aria-label={label} className="max-h-[22rem] divide-y divide-border overflow-y-auto lg:max-h-[calc(100dvh-16rem)]">
        {visible.map((a) => {
          const active = a.id === selectedId;
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => onSelect(a)}
                aria-current={active ? 'true' : undefined}
                className={cn(
                  'flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
                  active ? 'bg-primary-subtle' : 'hover:bg-surface-hover',
                )}
              >
                <span className={cn('num font-mono text-xs', active ? 'text-primary-subtle-foreground' : 'text-muted-foreground')}>{a.code}</span>
                <span className="w-full truncate text-sm font-medium text-foreground">{a.name}</span>
                {(a.branch?.name || a.category?.name) && (
                  <span className="w-full truncate text-xs text-muted-foreground">
                    {[a.category?.name, a.branch?.name].filter(Boolean).join(' · ')}
                  </span>
                )}
                {renderMarker?.(a)}
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <section aria-label={label} className="h-fit overflow-hidden rounded-lg border border-border bg-card">
      <div role="search" className="border-b border-border p-3">
        <label htmlFor={`${id}-q`} className="sr-only">
          {t('assets.picker.search')}
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            id={`${id}-q`}
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            autoComplete="off"
            className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label={t('assets.picker.clearSearch')}
              className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-4" aria-hidden />
            </button>
          )}
        </div>
        {!loading && !error && assets.length > 0 && (
          <p className="num mt-2 text-xs text-muted-foreground" aria-live="polite">
            {visible.length === assets.length ? t('assets.picker.count', { count: assets.length }) : t('assets.picker.countFiltered', { shown: visible.length, count: assets.length })}
          </p>
        )}
      </div>
      {body}
    </section>
  );
}
