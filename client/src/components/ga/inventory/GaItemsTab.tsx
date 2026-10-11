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
import { useTranslation } from 'react-i18next';


const STOCK_STATES = ['out', 'low', 'ok'] as const;

interface GaItemsTabProps {
  canEdit: boolean;
  onCreate: () => void;
  onEdit: (item: GaItemRow) => void;
  onMove: (item: GaItemRow) => void;
  onOpname: (item: GaItemRow) => void;
  onPreview: (item: Pick<GaItemRow, 'id' | 'name' | 'imagePath'>) => void;
}

export function GaItemsTab({ canEdit, onCreate, onEdit, onMove, onOpname, onPreview }: GaItemsTabProps) {
  const { t } = useTranslation('eam');
  const list = useListState({ filters: ITEM_FILTER_KEYS });
  const [density, setDensity] = useTableDensity();
  const { data: categories = [] } = useGaCategories();
  const { data: locations = [] } = useGaLocations();
  const locationName = locations.find((l) => l.id === list.filters.locationId)?.name;
  const tableLabel = locationName
    ? t('gaInventory.items.tableLabelAt', { location: locationName })
    : t('gaInventory.items.tableLabel');

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
        header: () => <span className="sr-only">{t('gaInventory.items.photo')}</span>,
        meta: { headerClassName: 'w-14', cellClassName: 'w-14 py-1.5' },
        cell: ({ row }) => <ItemThumb item={row.original} onPreview={onPreview} />,
      },
      {
        id: 'name',
        header: t('gaInventory.items.item'),
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
        header: t('gaInventory.items.category'),
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => row.original.category?.name ?? '—',
      },
      {
        id: 'totalStock',
        header: atLocation ? t('gaInventory.items.stockAtLocation') : t('gaInventory.items.stock'),
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
                  {t('gaInventory.items.totalQty', { qty: formatQty(it.totalStock), uom: it.uom })}
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
        header: t('gaInventory.items.minStock'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'md', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => (row.original.minStock ? `${formatQty(row.original.minStock)} ${row.original.uom}` : '—'),
      },
      {
        id: 'stockStatus',
        header: t('gaInventory.items.stockStatus'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={gaStockState(row.original)} docType="inventory_item" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const it = row.original;
          return (
            <RowActions
              label={t('shared.actionsFor', { name: it.sku })}
              actions={[
                { label: t('gaInventory.items.edit'), icon: Pencil, hidden: !canEdit, onSelect: () => onEdit(it) },
                { label: t('gaInventory.items.recordMovement'), icon: ArrowLeftRight, hidden: !canEdit, onSelect: () => onMove(it) },
                { label: t('gaInventory.items.stockCount'), icon: ClipboardCheck, hidden: !canEdit, onSelect: () => onOpname(it) },
              ]}
            />
          );
        },
      },
    ],
    [atLocation, canEdit, onEdit, onMove, onOpname, onPreview, t],
  );

  return (
    <div className="space-y-5">
      <section aria-label={t('gaInventory.items.summaryLabel')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('gaInventory.items.kpiCount')}
          icon={Boxes}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.count) : '—'}
          hint={summary ? t('gaInventory.items.kpiCountHint', { active: formatNumber(summary.activeCount) }) : undefined}
        />
        <StatCard
          label={t('gaInventory.items.kpiOk')}
          icon={CheckCircle2}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.okCount) : '—'}
          hint={t('gaInventory.items.kpiOkHint')}
        />
        <StatCard
          label={t('gaInventory.items.kpiLow')}
          icon={AlertTriangle}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.lowCount) : '—'}
          hint={t('gaInventory.items.kpiLowHint')}
        />
        <StatCard
          label={t('gaInventory.items.kpiOut')}
          icon={PackageX}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.outCount) : '—'}
          hint={t('gaInventory.items.kpiOutHint')}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('gaInventory.items.searchLabel')}
          searchPlaceholder={t('gaInventory.items.searchPlaceholder')}
          status={{ options: statusOptions(STOCK_STATES, 'inventory_item'), key: 'stockStatus', label: t('gaInventory.items.stockStatusFilter'), allLabel: t('gaInventory.items.allStock') }}
        >
          <SelectFilter
            label={t('gaInventory.items.category')}
            allLabel={t('gaInventory.items.allCategories')}
            options={categoryOptions}
            value={list.filters.categoryId}
            onChange={(v) => list.setFilter('categoryId', v)}
          />
          <SelectFilter
            label={t('gaInventory.items.location')}
            allLabel={t('gaInventory.items.allLocations')}
            options={locationOptions}
            value={list.filters.locationId}
            onChange={(v) => list.setFilter('locationId', v)}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, itemsQuery.data?.total)}
          label={tableLabel}
          itemLabel={t('gaInventory.items.itemLabel')}
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
            title: t('gaInventory.items.emptyTitle'),
            description: t('gaInventory.items.emptyDescription'),
            action: canEdit ? (
              <Button size="sm" onClick={onCreate}>
                <Plus aria-hidden />
                {t('gaInventory.items.addFirst')}
              </Button>
            ) : undefined,
          }}
        />
      </div>
    </div>
  );
}
