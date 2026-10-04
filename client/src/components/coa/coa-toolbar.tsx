/**
 * Toolbar of the Bagan Akun tree: search (FilterBar), root-type chips,
 * "akun bersaldo saja" toggle and Buka/Tutup semua.
 */
import { ChevronsDownUp, ChevronsUpDown } from 'lucide-react';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { FilterBar } from '@/components/shared';
import { ROOT_TYPES, rootTypeLabel } from './coa-tree';
import type { CoaView } from './use-coa-view';

export interface CoaToolbarProps {
  view: CoaView;
  counts: Record<string, number>;
  total: number;
  disabled?: boolean;
}

export function CoaToolbar({ view, counts, total, disabled }: CoaToolbarProps) {
  const chips = [
    { value: '', label: 'Semua', count: total },
    ...ROOT_TYPES.map((t) => ({
      value: t,
      label: rootTypeLabel(t),
      count: counts[t] ?? 0,
    })),
  ];

  return (
    <div className="space-y-3">
      <FilterBar
        list={view.list}
        searchLabel="Cari akun"
        searchPlaceholder="Cari nomor atau nama akun"
        actions={
          <>
            <Button variant="outline" size="sm" onClick={view.expandAll} disabled={disabled}>
              <ChevronsUpDown aria-hidden />
              Buka semua
            </Button>
            <Button variant="outline" size="sm" onClick={view.collapseAll} disabled={disabled}>
              <ChevronsDownUp aria-hidden />
              Tutup semua
            </Button>
          </>
        }
      >
        <label className="inline-flex h-10 items-center gap-2 rounded-md px-1 text-sm text-foreground md:h-9">
          <input
            type="checkbox"
            checked={view.nonZeroOnly}
            onChange={(e) => view.setNonZeroOnly(e.target.checked)}
            className="size-4 rounded accent-primary"
          />
          Hanya akun bersaldo
        </label>
      </FilterBar>

      <div role="group" aria-label="Filter tipe akun" className="flex flex-wrap gap-1.5">
        {chips.map((chip) => {
          const active = view.rootType === chip.value;
          return (
            <button
              key={chip.value || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => view.setRootType(chip.value)}
              className={cn(
                'inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                active
                  ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              {chip.label}
              <span className={cn('num rounded-full px-1.5 text-[11px]', active ? 'bg-card/70' : 'bg-muted')}>
                {formatNumber(chip.count)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
