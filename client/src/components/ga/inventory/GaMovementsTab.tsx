/**
 * Inventaris Kantor → tab "Pergerakan" (?tab=movements). Server-paged
 * /ga/inventory/movements (`page` mode): search, type, location, date range.
 */
import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Plus, SlidersHorizontal } from 'lucide-react';
import api from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { DataTable, FilterBar, listTableProps, type Paginated } from '@/components/shared';
import { SelectFilter } from '@/components/inventory/filters';
import {
  GA_INVENTORY_KEY,
  MOVEMENTS_ENDPOINT,
  MOVEMENT_FILTER_KEYS,
  MOVEMENT_LABEL,
  MOVEMENT_TYPES,
  formatMovementQty,
  movementRoute,
  type GaMovementRow,
  type GaMovementType,
} from './ga-inventory-model';
import { useGaLocations } from './queries';

const TYPE_FILTER = MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_LABEL[t] }));
const TYPE_ICON: Record<GaMovementType, typeof ArrowDownLeft> = {
  IN: ArrowDownLeft,
  OUT: ArrowUpRight,
  TRANSFER: ArrowLeftRight,
  ADJUSTMENT: SlidersHorizontal,
};

export function MovementType({ type, className }: { type: GaMovementType; className?: string }) {
  const Icon = TYPE_ICON[type];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-foreground', className)}>
      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
      {MOVEMENT_LABEL[type]}
    </span>
  );
}

interface GaMovementsTabProps {
  onCreate?: () => void;
}

export function GaMovementsTab({ onCreate }: GaMovementsTabProps) {
  const list = useListState({ filters: MOVEMENT_FILTER_KEYS, defaultSort: { id: 'createdAt', desc: true } });
  const [density, setDensity] = useTableDensity();
  const { data: locations = [] } = useGaLocations();
  const locationOptions = useMemo(() => locations.map((l) => ({ value: l.id, label: l.name })), [locations]);

  const movementsQuery = useQuery({
    queryKey: [GA_INVENTORY_KEY, 'movements', list.params],
    queryFn: async () => (await api.get<Paginated<GaMovementRow>>(MOVEMENTS_ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<GaMovementRow>[]>(
    () => [
      {
        id: 'createdAt',
        header: 'Tanggal',
        enableSorting: true,
        sortDescFirst: true,
        meta: { cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span>{formatDateTime(row.original.createdAt)}</span>
            {/* Mobile: type stacked here because its column is hidden. */}
            <MovementType type={row.original.type} className="text-xs md:hidden" />
          </div>
        ),
      },
      {
        id: 'type',
        header: 'Tipe',
        meta: { hideBelow: 'md' },
        cell: ({ row }) => <MovementType type={row.original.type} />,
      },
      {
        id: 'item',
        header: 'Item',
        meta: { cellClassName: 'min-w-36 max-w-72' },
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium break-words text-foreground">{m.item?.name ?? '—'}</p>
              {m.item?.sku && <p className="num font-mono text-xs text-muted-foreground">{m.item.sku}</p>}
              <p className="truncate text-xs text-muted-foreground lg:hidden">{movementRoute(m)}</p>
            </div>
          );
        },
      },
      {
        id: 'quantity',
        header: 'Qty',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const m = row.original;
          return (
            <span className="whitespace-nowrap font-medium text-foreground">
              {formatMovementQty(m)} <span className="text-xs font-normal text-muted-foreground">{m.item?.uom}</span>
            </span>
          );
        },
      },
      {
        id: 'route',
        header: 'Lokasi',
        meta: { hideBelow: 'lg', cellClassName: 'max-w-56 truncate text-muted-foreground' },
        cell: ({ row }) => movementRoute(row.original),
      },
      {
        id: 'reference',
        header: 'Referensi',
        meta: { hideBelow: 'xl', cellClassName: 'max-w-56' },
        cell: ({ row }) => {
          const m = row.original;
          if (!m.referenceNo && !m.notes) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="min-w-0 text-xs">
              {m.referenceNo && <p className="num truncate font-mono text-foreground">{m.referenceNo}</p>}
              {m.notes && (
                <p className="truncate text-muted-foreground" title={m.notes}>
                  {m.notes}
                </p>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <FilterBar
        list={list}
        searchLabel="Cari pergerakan"
        searchPlaceholder="Cari item, referensi, atau catatan"
        status={{ options: TYPE_FILTER, key: 'type', label: 'Tipe pergerakan', allLabel: 'Semua tipe' }}
        dateRange={{ label: 'Rentang tanggal pergerakan' }}
      >
        <SelectFilter
          label="Lokasi"
          allLabel="Semua lokasi"
          options={locationOptions}
          value={list.filters.locationId}
          onChange={(v) => list.setFilter('locationId', v)}
        />
      </FilterBar>

      <DataTable
        {...listTableProps(list, movementsQuery.data?.total)}
        label="Riwayat pergerakan inventaris kantor"
        itemLabel="pergerakan"
        columns={columns}
        data={movementsQuery.data?.data}
        getRowId={(row) => row.id}
        loading={movementsQuery.isLoading}
        fetching={movementsQuery.isFetching && movementsQuery.isPlaceholderData}
        error={movementsQuery.error}
        onRetry={() => movementsQuery.refetch()}
        density={density}
        onDensityChange={setDensity}
        empty={{
          title: 'Belum ada pergerakan',
          description: 'Stok masuk, keluar, transfer, dan penyesuaian akan tercatat di sini.',
          action: onCreate ? (
            <Button size="sm" onClick={onCreate}>
              <Plus aria-hidden />
              Catat pergerakan pertama
            </Button>
          ) : undefined,
        }}
      />
    </div>
  );
}
