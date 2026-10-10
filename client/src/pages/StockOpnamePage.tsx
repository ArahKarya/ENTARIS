/**
 * Stock opname (/stock-opname); detail and count form are URL-addressable (?opname=<id> | ?opname=new).
 * No KPI cards: the endpoint has no /summary and page-subset KPIs mislead.
 */
import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, Eye, Plus, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { can, cap } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ComboboxFilter,
  ConfirmDialog,
  DataTable,
  DocumentLink,
  FilterBar,
  PageHeader,
  RowActions,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import { StockOpnameDetailView } from '@/components/stock-opname/StockOpnameDetailView';
import { StockOpnameCountForm } from '@/components/stock-opname/StockOpnameCountForm';

type Num = string | number;

interface WarehouseRef {
  id: string;
  code: string;
  name: string;
}

interface StockOpnameRow {
  id: string;
  opnameNumber: string;
  date: string;
  status: string;
  notes: string | null;
  createdBy?: { fullName: string } | null;
  _count?: { items: number };
  totalVariance: Num;
  itemsWithDiff: number;
  /** Warehouses touched by the adjustment movements (sent with `page`). */
  warehouses?: WarehouseRef[];
}

const ENDPOINT = '/stock-opname';
const DETAIL_PARAM = 'opname';
const NEW_VALUE = 'new';
const FILTER_KEYS = ['status', 'warehouseId', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(['Submitted', 'Cancelled'], 'stock_opname');
const CANCEL_TITLE = 'Batalkan Stok Opname?';
const CANCEL_MESSAGE = 'Semua penyesuaian stok dan jurnal akan dibalik.';

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

const warehouseLabel = (row: StockOpnameRow) =>
  row.warehouses && row.warehouses.length > 0 ? row.warehouses.map((w) => w.name).join(', ') : '—';

export function StockOpnamePage() {
  const queryClient = useQueryClient();
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [searchParams, setSearchParams] = useSearchParams();
  const [cancelTarget, setCancelTarget] = useState<{ id: string; opnameNumber: string } | null>(null);
  const canEdit = can('stock_opname', 'edit');
  const canCancel = canEdit && cap('doc.cancel');

  const detailParam = searchParams.get(DETAIL_PARAM);
  const creating = detailParam === NEW_VALUE && canEdit;
  const selectedId = detailParam && detailParam !== NEW_VALUE ? detailParam : null;

  const setDetail = (value: string | null) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(DETAIL_PARAM, value);
      else next.delete(DETAIL_PARAM);
      return next;
    });

  const listHref = useMemo(() => {
    const next = new URLSearchParams(searchParams);
    next.delete(DETAIL_PARAM);
    const qs = next.toString();
    return qs ? `/stock-opname?${qs}` : '/stock-opname';
  }, [searchParams]);

  const breadcrumb = (
    <Link
      to={listHref}
      className="inline-flex items-center gap-1 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronLeft className="size-3.5" aria-hidden />
      Stok Opname
    </Link>
  );

  const listQuery = useQuery({
    queryKey: ['stock-opname', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<StockOpnameRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
    enabled: !creating && !selectedId,
  });

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'filter-options'],
    queryFn: async () => (await api.get<{ data: WarehouseRef[] }>('/warehouses')).data.data,
    staleTime: 5 * 60_000,
    enabled: !creating && !selectedId,
  });
  const warehouseOptions = useMemo(
    () => (warehousesQuery.data ?? []).map((w) => ({ value: w.id, label: w.name, hint: w.code })),
    [warehousesQuery.data],
  );

  const invalidateAfterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['stock-opname'] });
    queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await api.put(`${ENDPOINT}/${cancelTarget.id}/cancel`);
      toast.success('Stok opname dibatalkan.');
      invalidateAfterChange();
      queryClient.invalidateQueries({ queryKey: ['stock-opname-detail', cancelTarget.id] });
      if (selectedId === cancelTarget.id) setDetail(null);
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message || 'Gagal membatalkan stok opname.');
    } finally {
      setCancelTarget(null);
    }
  };

  const columns = useMemo<ColumnDef<StockOpnameRow>[]>(
    () => [
      {
        id: 'opnameNumber',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setDetail(row.original.id)}>{row.original.opnameNumber}</DocumentLink>
            {/* Mobile: date + warehouse stacked here because their columns are hidden. */}
            <span className="num text-xs text-muted-foreground md:hidden">{formatDate(row.original.date)}</span>
            <span className="max-w-44 truncate text-xs text-muted-foreground lg:hidden">{warehouseLabel(row.original)}</span>
          </div>
        ),
      },
      {
        id: 'date',
        header: 'Tanggal',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'warehouse',
        header: 'Gudang',
        meta: { hideBelow: 'lg', cellClassName: 'max-w-56' },
        cell: ({ row }) => <span className="block truncate text-foreground">{warehouseLabel(row.original)}</span>,
      },
      {
        id: 'items',
        header: 'Item Dihitung',
        meta: { align: 'right', hideBelow: 'xl', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => formatNumber(row.original._count?.items ?? 0),
      },
      {
        id: 'itemsWithDiff',
        header: 'Item Selisih',
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => formatNumber(row.original.itemsWithDiff ?? 0),
      },
      {
        id: 'totalVariance',
        header: () => withUnit('Nilai Selisih'),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex flex-col items-end gap-1">
            <span className="font-medium text-foreground">
              {formatRupiah(row.original.totalVariance ?? 0, { symbol: false })}
            </span>
            {/* Mobile: status stacked here because its column is hidden. */}
            <StatusBadge status={row.original.status} docType="stock_opname" className="sm:hidden" />
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="stock_opname" />,
      },
      {
        id: 'createdBy',
        header: 'Dibuat Oleh',
        meta: { hideBelow: 'lg', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => row.original.createdBy?.fullName ?? '—',
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const so = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${so.opnameNumber}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => setDetail(so.id) },
                {
                  label: 'Batalkan',
                  icon: XCircle,
                  tone: 'danger',
                  hidden: !canCancel || so.status !== 'Submitted',
                  onSelect: () => setCancelTarget({ id: so.id, opnameNumber: so.opnameNumber }),
                },
              ]}
            />
          );
        },
      },
    ],
    // setDetail only wraps the stable setSearchParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canCancel],
  );

  const cancelDialog = (
    <ConfirmDialog
      open={!!cancelTarget}
      onOpenChange={(open) => !open && setCancelTarget(null)}
      title={CANCEL_TITLE}
      description={
        cancelTarget ? (
          <>
            <span className="num font-medium text-foreground">{cancelTarget.opnameNumber}</span>: {CANCEL_MESSAGE}
          </>
        ) : (
          CANCEL_MESSAGE
        )
      }
      tone="danger"
      confirmLabel="Ya, Batalkan"
      onConfirm={handleCancel}
    />
  );

  if (creating) {
    return (
      <StockOpnameCountForm
        breadcrumb={breadcrumb}
        onBack={() => setDetail(null)}
        onSuccess={() => {
          setDetail(null);
          invalidateAfterChange();
        }}
      />
    );
  }

  if (selectedId) {
    return (
      <>
        <StockOpnameDetailView id={selectedId} breadcrumb={breadcrumb} canCancel={canCancel} onCancel={setCancelTarget} />
        {cancelDialog}
      </>
    );
  }

  const openCreate = () => setDetail(NEW_VALUE);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Stok Opname"
        description="Hitung fisik per gudang; selisih disesuaikan ke stok dan dijurnal otomatis."
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus aria-hidden />
              Buat Stok Opname
            </Button>
          )
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari stok opname"
          searchPlaceholder="Cari nomor, catatan, atau pembuat"
          status={{ options: STATUS_FILTER }}
          dateRange
        >
          <ComboboxFilter
            label="Gudang"
            allLabel="Semua gudang"
            searchPlaceholder="Cari gudang…"
            value={list.filters.warehouseId}
            onChange={(v) => list.setFilter('warehouseId', v)}
            options={warehouseOptions}
            loading={warehousesQuery.isLoading}
            className="w-full sm:w-52"
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, listQuery.data?.total)}
          label="Daftar stok opname"
          itemLabel="stok opname"
          columns={columns}
          data={listQuery.data?.data}
          getRowId={(row) => row.id}
          loading={listQuery.isLoading}
          fetching={listQuery.isFetching && listQuery.isPlaceholderData}
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
          onRowClick={(row) => setDetail(row.id)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada stok opname',
            description: 'Sesi hitung fisik yang Anda simpan akan muncul di sini.',
            action: canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                Buat stok opname pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      {cancelDialog}
    </div>
  );
}
