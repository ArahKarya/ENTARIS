/**
 * Stok & Produksi → tab "Master Item" (?tab=items). List-kit page: KPIs from
 * /inventory/items/summary (same filters), server-side paging/sort/filter of
 * /inventory/items in list mode, stock per warehouse via `warehouseId`.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Boxes, Download, History, PackageX, Pencil, Plus, Trash2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  FilterBar,
  RowActions,
  StatCard,
  StatusBadge,
  fetchAllPages,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import { SelectFilter, WarehouseFilter } from './filters';
import { withUnit } from './list-helpers';
import {
  ITEM_FILTER_KEYS,
  formatQty,
  itemStockStatus,
  toItemExportRows,
  type InventoryItemRow,
  type InventoryItemSummary,
} from './inventory-rows';

const ENDPOINT = '/inventory/items';
const STOCK_FILTER = statusOptions(['low', 'out', 'ok'], 'inventory_item');
const ACTIVE_FILTER = [
  { value: 'true', label: 'Aktif' },
  { value: 'false', label: 'Nonaktif' },
];

interface InventoryItemsTabProps {
  canEdit: boolean;
  onCreate: () => void;
  onEdit: (item: InventoryItemRow) => void;
  onDelete: (item: InventoryItemRow) => void;
  onShowMovements: (item: InventoryItemRow) => void;
}

const stockValue = (i: InventoryItemRow) => (toNumber(i.currentStock) ?? 0) * (toNumber(i.averageCost) ?? 0);

export function InventoryItemsTab({ canEdit, onCreate, onEdit, onDelete, onShowMovements }: InventoryItemsTabProps) {
  const list = useListState({ filters: ITEM_FILTER_KEYS, defaultSort: { id: 'currentStock', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [exporting, setExporting] = useState(false);
  const perWarehouse = !!list.filters.warehouseId;

  const itemsQuery = useQuery({
    queryKey: ['inventory-items', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<InventoryItemRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: ['inventory-items', 'summary', list.filterParams],
    queryFn: async () => (await api.get<InventoryItemSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const total = itemsQuery.data?.total;
  const summary = summaryQuery.data;
  const kpiLoading = !summary && !summaryQuery.isError;
  const categoryOptions = useMemo(
    () => (summary?.categories ?? []).map((c) => ({ value: c, label: c })),
    [summary?.categories],
  );

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = { ...list.filterParams, sort: list.params.sort ?? '-currentStock' };
      // The endpoint caps a page at 200 rows.
      const { rows, truncated } = await fetchAllPages<InventoryItemRow>(ENDPOINT, params, { pageSize: 200 });
      exportToExcel(toItemExportRows(rows), 'master-item');
      if (truncated) toast.warning(`Ekspor dibatasi ${formatNumber(rows.length)} item pertama. Persempit filter.`);
    } catch {
      toast.error('Gagal mengekspor item. Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<InventoryItemRow>[]>(
    () => [
      {
        id: 'code',
        header: 'Kode',
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => <span className="num font-mono text-xs text-foreground">{row.original.code}</span>,
      },
      {
        id: 'name',
        header: 'Nama Item',
        enableSorting: true,
        meta: { cellClassName: 'min-w-36 max-w-80' },
        cell: ({ row }) => {
          const i = row.original;
          return (
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="line-clamp-2 font-medium break-words text-foreground">{i.name}</span>
                {!i.isActive && <StatusBadge status="inactive" dot={false} />}
              </p>
              <p className="num font-mono text-xs text-muted-foreground md:hidden">{i.code}</p>
              {i.description && (
                <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden max-md:hidden">
                  {i.description}
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: 'category',
        header: 'Kategori',
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => row.original.category || '—',
      },
      {
        id: 'currentStock',
        header: perWarehouse ? 'Stok Gudang' : 'Stok',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const i = row.original;
          const status = itemStockStatus(i);
          const warn = status !== 'ok';
          return (
            <div className="flex flex-col items-end gap-1">
              <span className={cn('inline-flex items-center gap-1', warn ? 'font-semibold text-danger-text' : 'text-foreground')}>
                {warn && <AlertTriangle className="size-3.5 shrink-0" aria-hidden />}
                {formatQty(i.currentStock)}
                <span className="text-xs font-normal text-muted-foreground">{i.unit}</span>
              </span>
              {/* Mobile: stock state stacked here because its column is hidden. */}
              {warn && <StatusBadge status={status} docType="inventory_item" className="sm:hidden" />}
            </div>
          );
        },
      },
      {
        id: 'minimumStock',
        header: 'Stok Min.',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'md', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => (toNumber(row.original.minimumStock) ? formatQty(row.original.minimumStock) : '—'),
      },
      {
        id: 'stockValue',
        header: () => withUnit('Nilai Stok'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'xl' },
        cell: ({ row }) => formatRupiah(stockValue(row.original), { symbol: false }),
      },
      {
        id: 'stockStatus',
        header: 'Status Stok',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={itemStockStatus(row.original)} docType="inventory_item" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const i = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${i.code}`}
              actions={[
                { label: 'Riwayat gerakan', icon: History, onSelect: () => onShowMovements(i) },
                { label: 'Edit item', icon: Pencil, hidden: !canEdit, onSelect: () => onEdit(i) },
                { label: 'Hapus item', icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => onDelete(i) },
              ]}
            />
          );
        },
      },
    ],
    [perWarehouse, canEdit, onEdit, onDelete, onShowMovements],
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
          label="Nilai Persediaan"
          icon={Wallet}
          loading={kpiLoading}
          value={summary ? formatRupiah(summary.stockValue, { compact: true }) : '—'}
          valueTitle={summary ? formatRupiah(summary.stockValue) : undefined}
          hint={perWarehouse ? 'stok gudang × harga rata-rata' : 'stok × harga rata-rata'}
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
          hint="stok nol atau minus"
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari item"
          searchPlaceholder="Cari kode atau nama item"
          status={{ options: STOCK_FILTER, key: 'stockStatus', label: 'Status stok', allLabel: 'Semua stok' }}
          actions={
            <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!total}>
              <Download aria-hidden />
              <span className="sr-only sm:not-sr-only">Ekspor Excel</span>
            </Button>
          }
        >
          <SelectFilter
            label="Status item"
            allLabel="Aktif & nonaktif"
            options={ACTIVE_FILTER}
            value={list.filters.isActive}
            onChange={(v) => list.setFilter('isActive', v)}
          />
          {categoryOptions.length > 0 && (
            <SelectFilter
              label="Kategori"
              allLabel="Semua kategori"
              options={categoryOptions}
              value={list.filters.category}
              onChange={(v) => list.setFilter('category', v)}
            />
          )}
          <WarehouseFilter
            value={list.filters.warehouseId}
            onChange={(v) => list.setFilter('warehouseId', v)}
            allLabel="Semua gudang (total)"
            className="w-[calc(50%-0.25rem)] sm:w-56"
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, total)}
          label="Daftar item persediaan"
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
            title: 'Belum ada item persediaan',
            description: 'Tambahkan item atau impor dari Excel untuk mulai mencatat stok.',
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

