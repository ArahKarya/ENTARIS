import { useId, type ReactNode } from 'react';
import { RotateCcw, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ListState } from '@/hooks/useListState';
import { cn } from '@/lib/utils';
import { DateInput } from './date-input';
import { useTranslation } from 'react-i18next';

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterBarProps<K extends string> {
  /** State from useListState(); the bar reads and writes it directly. */
  list: ListState<K>;
  /** Placeholder that says what is searched, e.g. "Cari nomor faktur atau pelanggan". */
  searchPlaceholder?: string;
  /** Accessible label of the search box (default "Cari"). */
  searchLabel?: string;
  /** Status select bound to filter `key` (default "status"). Options exclude "all". */
  status?: { options: FilterOption[]; key?: K; label?: string; allLabel?: string };
  /** Date range bound to `startKey`/`endKey` (default startDate/endDate). */
  dateRange?: boolean | { startKey?: K; endKey?: K; label?: string };
  /** Extra filters (e.g. a party select) rendered after the built-in ones. */
  children?: ReactNode;
  /** Right-aligned tools (e.g. <DensityToggle/>, column menu). */
  actions?: ReactNode;
  className?: string;
}

const ALL = '__all__';

/**
 * Search + status + date range + slot + Reset, wrapping on small screens.
 * Every control has a (visually hidden) label.
 */
export function FilterBar<K extends string>({
  list,
  searchPlaceholder,
  searchLabel,
  status,
  dateRange,
  children,
  actions,
  className,
}: FilterBarProps<K>) {
  const { t } = useTranslation('common');
  const id = useId();
  const statusKey = (status?.key ?? 'status') as K;
  const range = dateRange ? (dateRange === true ? {} : dateRange) : null;
  const startKey = (range?.startKey ?? 'startDate') as K;
  const endKey = (range?.endKey ?? 'endDate') as K;
  const startValue = range ? list.filters[startKey] ?? '' : '';
  const endValue = range ? list.filters[endKey] ?? '' : '';

  return (
    <div
      role="search"
      aria-label={t('filters.label')}
      className={cn('flex flex-wrap items-center gap-2', className)}
    >
      <div className="relative w-full sm:w-auto sm:min-w-60 sm:max-w-sm sm:flex-1">
        <label htmlFor={`${id}-q`} className="sr-only">
          {searchLabel ?? t('actions.search')}
        </label>
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id={`${id}-q`}
          type="search"
          value={list.searchInput}
          onChange={(e) => list.setSearch(e.target.value)}
          placeholder={searchPlaceholder ?? t('filters.searchPlaceholder')}
          autoComplete="off"
          className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
        />
        {list.searchInput && (
          <button
            type="button"
            onClick={() => list.setSearch('')}
            aria-label={t('filters.clearSearch')}
            className="absolute right-1.5 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {status && (
        <div className="w-[calc(50%-0.25rem)] sm:w-44">
          <label htmlFor={`${id}-status`} className="sr-only">
            {status.label ?? t('labels.status')}
          </label>
          <Select
            value={list.filters[statusKey] || ALL}
            onValueChange={(v) => list.setFilter(statusKey, v === ALL ? '' : v)}
          >
            <SelectTrigger id={`${id}-status`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{status.allLabel ?? t('filters.allStatuses')}</SelectItem>
              {status.options.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {children}

      {range && (
        <fieldset className="flex w-full items-center gap-1.5 sm:w-auto">
          <legend className="sr-only">{range.label ?? t('filters.dateRange')}</legend>
          <label htmlFor={`${id}-from`} className="sr-only">
            {t('filters.dateFrom')}
          </label>
          <DateInput
            id={`${id}-from`}
            value={startValue}
            max={endValue || undefined}
            onChange={(v) => list.setFilter(startKey, v)}
            className="min-w-0 flex-1 sm:w-36 sm:flex-none"
          />
          <span className="text-muted-foreground" aria-hidden>
            –
          </span>
          <label htmlFor={`${id}-to`} className="sr-only">
            {t('filters.dateTo')}
          </label>
          <DateInput
            id={`${id}-to`}
            value={endValue}
            min={startValue || undefined}
            onChange={(v) => list.setFilter(endKey, v)}
            className="min-w-0 flex-1 sm:w-36 sm:flex-none"
          />
        </fieldset>
      )}

      <Button
        variant="ghost"
        size="md"
        onClick={list.resetFilters}
        disabled={!list.hasActiveFilters}
        className={cn('text-muted-foreground hover:text-foreground', !list.hasActiveFilters && 'hidden sm:inline-flex')}
      >
        <RotateCcw aria-hidden />
        {t('actions.reset')}
      </Button>

      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
    </div>
  );
}
