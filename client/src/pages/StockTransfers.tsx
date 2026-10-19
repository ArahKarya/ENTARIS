/**
 * Transfer Stok (/stock-transfers) — list kit page (pattern: pages/SalesInvoices.tsx).
 * Server-side paging/sort/filter on GET /stock-transfers. The detail drawer is
 * URL-addressable: ?transfer=<id>. No KPI cards (no /summary endpoint).
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowRight, Eye, Plus, Printer, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
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
import WarehouseTransferDrawer from '@/components/WarehouseTransferDrawer';
import { StockTransferModal } from '@/components/stock-transfer/StockTransferModal';

interface WarehouseRef {
  id: string;
  code: string;
  name: string;
}

interface StockTransferRow {
  id: string;
  transferNumber: string;
  date: string;
  status: string;
  notes: string | null;
  nomorMobil: string | null;
  driverName: string | null;
  recipientName: string | null;
  printedAt: string | null;
  fromWarehouse?: WarehouseRef | null;
  toWarehouse?: WarehouseRef | null;
  items?: Array<{ id: string }>;
}

const ENDPOINT = '/stock-transfers';
const DETAIL_PARAM = 'transfer';
const FILTER_KEYS = ['status', 'warehouseId', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(['Submitted', 'Cancelled'], 'stock_transfer');

function Route({ row, className }: { row: StockTransferRow; className?: string }) {
  const { t } = useTranslation('inventory');
  return (
    <span className={className}>
      <span className="text-foreground">{row.fromWarehouse?.name ?? '—'}</span>
      <ArrowRight className="mx-1 inline size-3 align-[-1px] text-muted-foreground" aria-hidden />
      <span className="sr-only"> {t('stockTransfers.route.to')} </span>
      <span className="font-medium text-foreground">{row.toWarehouse?.name ?? '—'}</span>
    </span>
  );
}

export const StockTransfers = () => {
  const { t } = useTranslation('inventory');
  const queryClient = useQueryClient();
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<StockTransferRow | null>(null);
  const canEdit = can('stock_transfer', 'edit');
  const canCancel = canEdit && cap('doc.cancel');
  const selectedId = searchParams.get(DETAIL_PARAM);

  const setSelectedId = (id: string | null) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (id) next.set(DETAIL_PARAM, id);
      else next.delete(DETAIL_PARAM);
      return next;
    });

  const listQuery = useQuery({
    queryKey: ['stock-transfers', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<StockTransferRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const warehousesQuery = useQuery({
    queryKey: ['warehouses', 'filter-options'],
    queryFn: async () => (await api.get<{ data: WarehouseRef[] }>('/warehouses')).data.data,
    staleTime: 5 * 60_000,
  });
  const warehouseOptions = useMemo(
    () => (warehousesQuery.data ?? []).map((w) => ({ value: w.id, label: w.name, hint: w.code })),
    [warehousesQuery.data],
  );

  // Same endpoint, toasts and cache invalidation as WarehouseTransferDrawer.
  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`${ENDPOINT}/${id}/cancel`),
    onSuccess: (_res, id) => {
      queryClient.invalidateQueries({ queryKey: ['stock-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['stock-transfer-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['inventory-items'] });
      toast.success(t('stockTransfers.toast.cancelled'));
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message || t('stockTransfers.toast.cancelFailed'));
    },
  });

  const columns = useMemo<ColumnDef<StockTransferRow>[]>(
    () => [
      {
        id: 'transferNumber',
        header: t('stockTransfers.columns.number'),
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.transferNumber}</DocumentLink>
            {/* Mobile: route + date stacked here because their columns are hidden. */}
            <Route row={row.original} className="max-w-52 text-sm sm:hidden" />
            <span className="num text-xs text-muted-foreground md:hidden">{formatDate(row.original.date)}</span>
          </div>
        ),
      },
      {
        id: 'date',
        header: t('stockTransfers.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'route',
        header: t('stockTransfers.columns.route'),
        meta: { hideBelow: 'sm', cellClassName: 'min-w-44' },
        cell: ({ row }) => <Route row={row.original} />,
      },
      {
        id: 'nomorMobil',
        header: t('stockTransfers.columns.vehicle'),
        meta: { hideBelow: 'xl', cellClassName: 'num whitespace-nowrap font-mono text-xs uppercase' },
        cell: ({ row }) => row.original.nomorMobil || <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'driverName',
        header: t('stockTransfers.columns.driver'),
        meta: { hideBelow: 'lg' },
        cell: ({ row }) => row.original.driverName || <span className="text-muted-foreground">—</span>,
      },
      {
        id: 'items',
        header: t('stockTransfers.columns.items'),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex flex-col items-end gap-1">
            <span className="text-foreground">{formatNumber(row.original.items?.length ?? 0)}</span>
            {/* Mobile: status stacked here because its column is hidden. */}
            <StatusBadge status={row.original.status} docType="stock_transfer" className="sm:hidden" />
          </div>
        ),
      },
      {
        id: 'status',
        header: t('stockTransfers.columns.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="stock_transfer" />,
      },
      {
        id: 'printedAt',
        header: () => <abbr title={t('stockTransfers.columns.printedTitle')}>SJG</abbr>,
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.printedAt ? (
            <span className="inline-flex items-center gap-1 text-success-text">
              <Printer className="size-3.5" aria-hidden />
              <span className="sr-only">{t('stockTransfers.columns.printed')}</span>
              {formatDate(row.original.printedAt, 'short')}
            </span>
          ) : (
            <span className="text-muted-foreground">
              -<span className="sr-only"> {t('stockTransfers.columns.notPrinted')}</span>
            </span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('stockTransfers.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const tr = row.original;
          return (
            <RowActions
              label={t('stockTransfers.rowActions.label', { number: tr.transferNumber })}
              actions={[
                { label: t('stockTransfers.rowActions.view'), icon: Eye, onSelect: () => setSelectedId(tr.id) },
                {
                  label: t('stockTransfers.rowActions.cancel'),
                  icon: XCircle,
                  tone: 'danger',
                  hidden: !canCancel || tr.status !== 'Submitted',
                  onSelect: () => setCancelTarget(tr),
                },
              ]}
            />
          );
        },
      },
    ],
    // setSelectedId only wraps the stable setSearchParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canCancel, t],
  );

  const openCreate = () => setIsModalOpen(true);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('stockTransfers.title')}
        description={t('stockTransfers.description')}
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus aria-hidden />
              {t('stockTransfers.create')}
            </Button>
          )
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('stockTransfers.filters.searchLabel')}
          searchPlaceholder={t('stockTransfers.filters.searchPlaceholder')}
          status={{ options: STATUS_FILTER }}
          dateRange
        >
          <ComboboxFilter
            label={t('stockTransfers.filters.warehouse')}
            allLabel={t('stockTransfers.filters.allWarehouses')}
            searchPlaceholder={t('stockTransfers.filters.searchWarehouse')}
            value={list.filters.warehouseId}
            onChange={(v) => list.setFilter('warehouseId', v)}
            options={warehouseOptions}
            loading={warehousesQuery.isLoading}
            className="w-full sm:w-52"
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, listQuery.data?.total)}
          label={t('stockTransfers.table.label')}
          itemLabel={t('stockTransfers.table.itemLabel')}
          columns={columns}
          data={listQuery.data?.data}
          getRowId={(row) => row.id}
          loading={listQuery.isLoading}
          fetching={listQuery.isFetching && listQuery.isPlaceholderData}
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
          onRowClick={(row) => setSelectedId(row.id)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('stockTransfers.empty.title'),
            description: t('stockTransfers.empty.description'),
            action: canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                {t('stockTransfers.empty.action')}
              </Button>
            ) : undefined,
          }}
        />
      </div>

      {isModalOpen && <StockTransferModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />}
      <WarehouseTransferDrawer transferId={selectedId} onClose={() => setSelectedId(null)} />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title={t('stockTransfers.cancelDialog.title')}
        description={t('stockTransfers.cancelDialog.description', { number: cancelTarget?.transferNumber ?? '' })}
        tone="danger"
        confirmLabel={t('stockTransfers.cancelDialog.confirm')}
        loading={cancelMutation.isPending}
        onConfirm={() => {
          if (!cancelTarget) return undefined;
          return cancelMutation
            .mutateAsync(cancelTarget.id)
            .then(() => setCancelTarget(null))
            .catch(() => setCancelTarget(null));
        }}
      />
    </div>
  );
};

export default StockTransfers;
