/**
 * Inventaris Kantor → tab "Item" (?tab=items). List-kit page: KPIs from
 * /ga/inventory/items/summary (same filters), server-side paging/sort/filter
 * of /ga/inventory/items in paged mode (`paginated=1`). With a location
 * filter the stock column shows the quantity at that location.
 */
import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, ArrowLeftRight, Boxes, CheckCircle2, ClipboardCheck, PackageX, Pencil, Plus } from 'lucide-react';
import api from '@/lib/api';
import { formatNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { DataTable, FilterBar, RowActions, StatCard, StatusBadge, listTableProps, type Paginated } from '@/components/shared';
import { SelectFilter } from '@/components/inventory/filters';
import { ItemThumb } from './ItemImage';
import {
  GA_INVENTORY_KEY,
  ITEMS_ENDPOINT,
  ITEM_FILTER_KEYS,
  formatQty,
  gaStockState,
  type GaItemRow,
  type GaItemSummary,
} from './ga-inventory-model';
import { useGaCategories, useGaLocations } from './queries';

const STOCK_FILTER = statusOptions(['out', 'low', 'ok'], 'inventory_item');

interface GaItemsTabProps {
  canEdit: boolean;
  onCreate: () => void;
  onEdit: (item: GaItemRow) => void;
  onMove: (item: GaItemRow) => void;
  onOpname: (item: GaItemRow) => void;
  onPreview: (item: Pick<GaItemRow, 'id' | 'name' | 'imagePath'>) => void;
}

export function GaItemsTab({ canEdit, onCreate, onEdit, onMove, onOpname, onPreview }: GaItemsTabProps) {
  const list = useListState({ filters: ITEM_FILTER_KEYS });
  const [density, setDensity] = useTableDensity();
  const { data: categories = [] } = useGaCategories();
  const { data: locations = [] } = useGaLocations();
  const location = locations.find((l) => l.id === list.filters.locationId);

  const itemsQuery = useQuery({
    queryKey: [GA_INVENTORY_KEY, 'items', list.params],
    queryFn: async () =>
      (await api.get<Paginated<GaItemRow>>(ITEMS_ENDPOINT, { params: { ...list.params, paginated: 1 } })).data,
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: [GA_INVENTORY_KEY, 'items-summary', list.filterParams],
    queryFn: async () => (await api.get<GaItemSummary>(`${ITEMS_ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const summary = summaryQuery.data;
  const kpiLoading = !summary && !summaryQuery.isError;
  const categoryOptions = useMemo(() => categories.map((c) => ({ value: c.id, label: c.name })), [categories]);
  const locationOptions = useMemo(() => locations.map((l) => ({ value: l.id, label: l.name })), [locations]);
  const atLocation = !!list.filters.locationId;

  const columns = useMemo<ColumnDef<GaItemRow>[]>(
    () => [
      {
        id: 'photo',
        header: () => <span className="sr-only">Foto</span>,
        meta: { headerClassName: 'w-14', cellClassName: 'w-14 py-1.5' },
        cell: ({ row }) => <ItemThumb item={row.original} onPreview={onPreview} />,
      },
      {
        id: 'name',
        header: 'Item',
        enableSorting: true,
        meta: { cellClassName: 'min-w-36 max-w-80' },
        cell: ({ row }) => {
          const it = row.original;
          return (
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="line-clamp-2 font-medium break-words text-foreground">{it.name}</span>
                {!it.isActive && <StatusBadge status="inactive" dot={false} />}
              </p>
              <p className="num font-mono text-xs text-muted-foreground">{it.sku}</p>
              {/* Mobile: category stacked here because its column is hidden. */}
              <p className="truncate text-xs text-muted-foreground lg:hidden">{it.category?.name ?? '—'}</p>
            </div>
          );
        },
      },
      {
        id: 'category',
        header: 'Kategori',
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => row.original.category?.name ?? '—',
      },
      {
        id: 'totalStock',
        header: atLocation ? 'Stok di Lokasi' : 'Stok',
        enableSorting: !atLocation,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const it = row.original;
          const state = gaStockState(it);
          const warn = state !== 'ok';
          const qty = atLocation ? it.locationStock ?? 0 : it.totalStock;
          return (
            <div className="flex flex-col items-end gap-1">
              <span className={cn('inline-flex items-center gap-1', warn ? 'font-semibold text-danger-text' : 'text-foreground')}>
                {warn && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
                {formatQty(qty)}
                <span className="text-xs font-normal text-muted-foreground">{it.uom}</span>
              </span>
              {atLocation && (
                <span className="text-xs text-muted-foreground">
                  total {formatQty(it.totalStock)} {it.uom}
                </span>
              )}
              {/* Mobile: stock state stacked here because its column is hidden. */}
              {warn && <StatusBadge status={state} docType="inventory_item" className="sm:hidden" />}
            </div>
          );
        },
      },
      {
        id: 'minStock',
        header: 'Stok Min.',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'md', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => (row.original.minStock ? `${formatQty(row.original.minStock)} ${row.original.uom}` : '—'),
      },
      {
        id: 'stockStatus',
        header: 'Status Stok',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={gaStockState(row.original)} docType="inventory_item" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const it = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${it.sku}`}
              actions={[
                { label: 'Edit item', icon: Pencil, hidden: !canEdit, onSelect: () => onEdit(it) },
                { label: 'Catat pergerakan', icon: ArrowLeftRight, hidden: !canEdit, onSelect: () => onMove(it) },
                { label: 'Stok opname', icon: ClipboardCheck, hidden: !canEdit, onSelect: () => onOpname(it) },
              ]}
            />
          );
        },
      },
    ],
    [atLocation, canEdit, onEdit, onMove, onOpname, onPreview],
  );

  return (
    <div className="space-y-5">
      <section aria-label="Ringkasan item sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jumlah Item"
          icon={Boxes}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.count) : '—'}
          hint={summary ? `${formatNumber(summary.activeCount)} aktif` : undefined}
        />
        <StatCard
          label="Stok Aman"
          icon={CheckCircle2}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.okCount) : '—'}
          hint="di atas stok minimum"
        />
        <StatCard
          label="Stok Menipis"
          icon={AlertTriangle}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.lowCount) : '—'}
          hint="di bawah stok minimum"
        />
        <StatCard
          label="Stok Habis"
          icon={PackageX}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.outCount) : '—'}
          hint="stok nol"
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari item"
          searchPlaceholder="Cari SKU atau nama item"
          status={{ options: STOCK_FILTER, key: 'stockStatus', label: 'Status stok', allLabel: 'Semua stok' }}
        >
          <SelectFilter
            label="Kategori"
            allLabel="Semua kategori"
            options={categoryOptions}
            value={list.filters.categoryId}
            onChange={(v) => list.setFilter('categoryId', v)}
          />
          <SelectFilter
            label="Lokasi"
            allLabel="Semua lokasi"
            options={locationOptions}
            value={list.filters.locationId}
            onChange={(v) => list.setFilter('locationId', v)}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, itemsQuery.data?.total)}
          label={location ? `Daftar item inventaris di ${location.name}` : 'Daftar item inventaris kantor'}
          itemLabel="item"
          columns={columns}
          data={itemsQuery.data?.data}
          getRowId={(row) => row.id}
          loading={itemsQuery.isLoading}
          fetching={itemsQuery.isFetching && itemsQuery.isPlaceholderData}
          error={itemsQuery.error}
          onRetry={() => itemsQuery.refetch()}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada item inventaris',
            description: 'Tambahkan item ATK, sparepart, atau perlengkapan kantor untuk mulai mencatat stok.',
            action: canEdit ? (
              <Button size="sm" onClick={onCreate}>
                <Plus aria-hidden />
                Tambah item pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>
    </div>
  );
}
