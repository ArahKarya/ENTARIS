/**
 * "Daftar Aset" tab of /fixed-assets — server-paginated register built on the
 * Phase 3 list kit (see pages/SalesInvoices.tsx for the reference pattern).
 *
 * List: GET /fixed-assets?page=… ({ data, total, page, limit }).
 * KPI cards: GET /fixed-assets/summary/by-category — the existing endpoint,
 * which covers every ACTIVE asset (the same totals the page showed before);
 * they intentionally do not follow the list filters.
 */
import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { BookOpen, Building2, Eye, Pencil, Plus, Trash2, TrendingDown, Wallet } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import type { ListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ComboboxFilter,
  DataTable,
  DocumentLink,
  FilterBar,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import {
  ACTIVE_STATUS,
  FIXED_ASSET_ENDPOINT,
  type CategorySummaryRow,
  type FixedAssetFilterKey,
  type FixedAssetRow,
} from './types';

const STATUS_FILTER = statusOptions(['Active', 'Disposed'], 'fixed_asset');

interface FixedAssetRegisterProps {
  list: ListState<FixedAssetFilterKey>;
  canEdit: boolean;
  onOpen: (asset: FixedAssetRow) => void;
  onEdit: (asset: FixedAssetRow) => void;
  onDispose: (asset: FixedAssetRow) => void;
  onCreate: () => void;
}

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

const num = (v: unknown) => toNumber(v as string | number | null) ?? 0;
const money = (v: unknown) => formatRupiah(num(v), { symbol: false });

export function FixedAssetRegister({ list, canEdit, onOpen, onEdit, onDispose, onCreate }: FixedAssetRegisterProps) {
  const [density, setDensity] = useTableDensity();

  const assetsQuery = useQuery({
    queryKey: ['fixed-assets', 'list', list.params],
    queryFn: async () =>
      (await api.get<Paginated<FixedAssetRow>>(FIXED_ASSET_ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ['fixed-assets', 'summary-by-category'],
    queryFn: async () => (await api.get<CategorySummaryRow[]>(`${FIXED_ASSET_ENDPOINT}/summary/by-category`)).data,
  });

  const categoriesQuery = useQuery({
    queryKey: ['fixed-assets', 'categories'],
    queryFn: async () => (await api.get<string[]>(`${FIXED_ASSET_ENDPOINT}/categories`)).data,
    staleTime: 5 * 60_000,
  });
  const categoryOptions = useMemo(
    () => (categoriesQuery.data ?? []).map((c) => ({ value: c, label: c })),
    [categoriesQuery.data],
  );

  const totals = useMemo(() => {
    const rows = summaryQuery.data;
    if (!rows) return null;
    return rows.reduce(
      (acc, r) => ({
        count: acc.count + num(r.count),
        cost: acc.cost + num(r.total_cost),
        accumulated: acc.accumulated + num(r.total_accumulated),
        bookValue: acc.bookValue + num(r.total_book_value),
      }),
      { count: 0, cost: 0, accumulated: 0, bookValue: 0 },
    );
  }, [summaryQuery.data]);
  const kpiLoading = !totals && !summaryQuery.isError;
  const kpiMoney = (v: number | undefined) => (v === undefined ? '-' : formatRupiah(v, { compact: true }));

  const columns = useMemo<ColumnDef<FixedAssetRow>[]>(
    () => [
      {
        id: 'assetNumber',
        header: 'No. Aset',
        enableSorting: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => onOpen(row.original)}>{row.original.assetNumber}</DocumentLink>
            {/* Mobile: name + category stacked here because their columns are hidden. */}
            <span className="line-clamp-2 max-w-44 text-sm font-medium break-words text-foreground sm:hidden">
              {row.original.name}
            </span>
            <span className="text-xs text-muted-foreground sm:hidden">{row.original.category}</span>
          </div>
        ),
      },
      {
        id: 'name',
        header: 'Nama Aset',
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-44 max-w-80' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground" title={row.original.name}>
              {row.original.name}
            </p>
            <p
              className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden"
              title={row.original.description ?? undefined}
            >
              {row.original.category}
              {row.original.description ? ` · ${row.original.description}` : ''}
            </p>
          </div>
        ),
      },
      {
        id: 'acquisitionDate',
        header: 'Tgl. Perolehan',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.acquisitionDate),
      },
      {
        id: 'acquisitionCost',
        header: () => withUnit('Harga Perolehan'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'md' },
        cell: ({ row }) => money(row.original.acquisitionCost),
      },
      {
        id: 'accumulatedDepreciation',
        header: () => withUnit('Akm. Penyusutan'),
        enableSorting: true,
        sortDescFirst: true,
        // Wide screens only (≥1536px): derivable as cost − book value, and shown in the detail sheet.
        meta: {
          align: 'right',
          headerClassName: 'hidden 2xl:table-cell',
          cellClassName: 'hidden text-muted-foreground 2xl:table-cell',
        },
        cell: ({ row }) => money(row.original.accumulatedDepreciation),
      },
      {
        id: 'bookValue',
        header: () => withUnit('Nilai Buku'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex flex-col items-end gap-1">
            <span className="font-semibold text-foreground">{money(row.original.bookValue)}</span>
            {/* Mobile: status stacked here because its column is hidden. */}
            <StatusBadge status={row.original.status} docType="fixed_asset" className="sm:hidden" />
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="fixed_asset" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const a = row.original;
          const writable = canEdit && a.status === ACTIVE_STATUS;
          return (
            <RowActions
              label={`Aksi untuk ${a.assetNumber}`}
              actions={[
                { label: 'Lihat detail & jadwal', icon: Eye, onSelect: () => onOpen(a) },
                { label: 'Edit data', icon: Pencil, hidden: !writable, onSelect: () => onEdit(a) },
                {
                  label: 'Lepas aset',
                  icon: Trash2,
                  tone: 'danger',
                  hidden: !writable,
                  onSelect: () => onDispose(a),
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, onOpen, onEdit, onDispose],
  );

  return (
    <div className="space-y-5">
      <section aria-label="Ringkasan aset tetap aktif" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Aset Aktif"
          icon={Building2}
          loading={kpiLoading}
          value={totals ? formatNumber(totals.count) : '-'}
          hint="tidak termasuk dilepas"
        />
        <StatCard
          label="Harga Perolehan"
          icon={Wallet}
          loading={kpiLoading}
          value={kpiMoney(totals?.cost)}
          valueTitle={totals ? formatRupiah(totals.cost) : undefined}
          hint={totals ? formatRupiah(totals.cost) : undefined}
        />
        <StatCard
          label="Akm. Penyusutan"
          icon={TrendingDown}
          loading={kpiLoading}
          value={kpiMoney(totals?.accumulated)}
          valueTitle={totals ? formatRupiah(totals.accumulated) : undefined}
          hint={totals ? formatRupiah(totals.accumulated) : undefined}
        />
        <StatCard
          label="Nilai Buku"
          icon={BookOpen}
          loading={kpiLoading}
          value={kpiMoney(totals?.bookValue)}
          valueTitle={totals ? formatRupiah(totals.bookValue) : undefined}
          hint={totals ? formatRupiah(totals.bookValue) : undefined}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari aset tetap"
          searchPlaceholder="Cari nomor, nama, atau kategori aset"
          status={{ options: STATUS_FILTER }}
          dateRange={{ label: 'Rentang tanggal perolehan' }}
        >
          <ComboboxFilter
            label="Kategori"
            allLabel="Semua kategori"
            searchPlaceholder="Cari kategori…"
            value={list.filters.category}
            onChange={(v) => list.setFilter('category', v)}
            options={categoryOptions}
            loading={categoriesQuery.isLoading}
            className="w-[calc(50%-0.25rem)] sm:w-48"
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, assetsQuery.data?.total)}
          label="Daftar aset tetap"
          itemLabel="aset"
          columns={columns}
          data={assetsQuery.data?.data}
          getRowId={(row) => row.id}
          loading={assetsQuery.isLoading}
          fetching={assetsQuery.isFetching && assetsQuery.isPlaceholderData}
          error={assetsQuery.error}
          onRetry={() => assetsQuery.refetch()}
          onRowClick={onOpen}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada aset tetap',
            description: 'Aset yang Anda tambahkan atau impor akan muncul di sini beserta jadwal penyusutannya.',
            action: canEdit ? (
              <Button size="sm" onClick={onCreate}>
                <Plus aria-hidden />
                Tambah aset pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>
    </div>
  );
}
