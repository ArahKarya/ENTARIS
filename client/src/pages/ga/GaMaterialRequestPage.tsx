/** Material requests (/ga/material-requests); KPIs ignore the status filter; ?mr=<id> opens the detail sheet. */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Clock, Eye, PackageCheck, Plus, Wallet, Wrench } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { can } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DocumentLink,
  FilterBar,
  PageHeader,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import { CreateMrModal } from './materialRequest/CreateMrModal';
import { MrDetailDrawer } from './materialRequest/MrDetailDrawer';
import { MR_STATUS_FILTERS, type MrListRow, type MrSummary } from './materialRequest/types';

const ENDPOINT = '/ga/material-requests';
const FILTER_KEYS = ['status', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(MR_STATUS_FILTERS, 'ga_material_request');
const MR_PARAM = 'mr';

export function GaMaterialRequestPage() {
  const canEdit = can('ga_material_request', 'edit');
  const canViewWorkOrder = can('ga_maintenance', 'view');
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'requestedAt', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const detailId = searchParams.get(MR_PARAM);

  const openDetail = useCallback(
    (mr: Pick<MrListRow, 'id'>) =>
      setSearchParams((prev) => {
        const p = new URLSearchParams(prev);
        p.set(MR_PARAM, mr.id);
        return p;
      }),
    [setSearchParams],
  );
  const closeDetail = () =>
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        p.delete(MR_PARAM);
        return p;
      },
      { replace: true },
    );

  const listQuery = useQuery({
    queryKey: ['ga-material-requests', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<MrListRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: ['ga-material-requests', 'summary', list.filterParams],
    queryFn: async () => (await api.get<MrSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const rows = listQuery.data?.data;
  const requesterName = useMemo(
    () => rows?.find((r) => r.id === detailId)?.requester?.fullName ?? null,
    [rows, detailId],
  );

  const columns = useMemo<ColumnDef<MrListRow>[]>(
    () => [
      {
        id: 'code',
        header: 'Kode',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => {
          const mr = row.original;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <DocumentLink onClick={() => openDetail(mr)}>{mr.code}</DocumentLink>
              {/* Mobile: target + date stacked here because their columns are hidden. */}
              <span className="max-w-48 truncate text-xs text-muted-foreground sm:hidden">
                {mr.asset ? mr.asset.name : mr.machineTarget || '—'}
              </span>
              <span className="num text-xs text-muted-foreground md:hidden">{formatDate(mr.requestedAt ?? mr.createdAt)}</span>
            </div>
          );
        },
      },
      {
        id: 'requestedAt',
        header: 'Tanggal',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.requestedAt ?? row.original.createdAt),
      },
      {
        id: 'target',
        header: 'Aset / Mesin',
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => {
          const mr = row.original;
          return (
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{mr.asset ? mr.asset.name : mr.machineTarget || '—'}</p>
              <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                {mr.asset ? mr.asset.code : ''}
                {mr.items.length > 0 && `${mr.asset ? ' · ' : ''}${mr.items.map((i) => i.itemName).join(', ')}`}
              </p>
            </div>
          );
        },
      },
      {
        id: 'workOrder',
        header: 'WO',
        meta: { hideBelow: 'lg' },
        cell: ({ row }) =>
          row.original.workOrder ? (
            <span className="num inline-flex items-center gap-1 font-mono text-xs text-foreground">
              <Wrench className="size-3 text-muted-foreground" aria-hidden />
              {row.original.workOrder.code}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'requester',
        header: 'Pemohon',
        meta: { hideBelow: 'xl', cellClassName: 'max-w-40 truncate' },
        cell: ({ row }) => row.original.requester?.fullName ?? '—',
      },
      {
        id: 'items',
        header: 'Item',
        meta: { align: 'right', hideBelow: 'md' },
        cell: ({ row }) => formatNumber(row.original._count?.items ?? row.original.items.length),
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="ga_material_request" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={`Aksi untuk ${row.original.code}`}
            actions={[{ label: 'Lihat detail', icon: Eye, onSelect: () => openDetail(row.original) }]}
          />
        ),
      },
    ],
    [openDetail],
  );

  const s = summaryQuery.data;
  const kpiLoading = !s && !summaryQuery.isError;
  const n = (v: number | undefined) => (v === undefined ? '—' : formatNumber(v));

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Permintaan Barang"
        description="Permintaan barang & pengadaan sparepart pemeliharaan, dari permintaan sampai barang masuk stok."
        actions={
          canEdit && (
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus aria-hidden />
              Buat Permintaan
            </Button>
          )
        }
      />

      <section aria-label="Ringkasan permintaan barang" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Menunggu Persetujuan" icon={Clock} loading={kpiLoading} value={n(s?.byStatus.SUBMITTED)} hint={s ? `${formatNumber(s.byStatus.DRAFT)} masih draf` : undefined} />
        <StatCard label="Proses Pengadaan" icon={PackageCheck} loading={kpiLoading} value={n(s?.byStatus.APPROVED)} hint="disetujui, menunggu barang" />
        <StatCard label="Selesai" icon={CheckCircle2} loading={kpiLoading} value={n(s?.byStatus.FULFILLED)} hint="semua barang diterima" />
        <StatCard label="Dibayar" icon={Wallet} loading={kpiLoading} value={n(s?.byStatus.PAID)} hint={s ? `dari ${formatNumber(s.total)} permintaan` : undefined} />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari permintaan barang"
          searchPlaceholder="Cari kode, aset, WO, atau nama barang"
          status={{ options: STATUS_FILTER }}
          dateRange={{ label: 'Rentang tanggal permintaan' }}
        />
        <DataTable
          {...listTableProps(list, listQuery.data?.total)}
          label="Daftar permintaan barang"
          itemLabel="permintaan"
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          loading={listQuery.isLoading}
          fetching={listQuery.isFetching && listQuery.isPlaceholderData}
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
          onRowClick={openDetail}
          rowClassName={(row) => (row.status === 'CANCELLED' ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada permintaan barang',
            description: 'Permintaan sparepart dari work order atau permintaan mandiri akan muncul di sini.',
            action: canEdit ? (
              <Button size="sm" onClick={() => setIsCreateOpen(true)}>
                <Plus aria-hidden />
                Buat permintaan pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      {isCreateOpen && <CreateMrModal onClose={() => setIsCreateOpen(false)} />}
      <MrDetailDrawer
        id={detailId}
        canEdit={canEdit}
        canViewWorkOrder={canViewWorkOrder}
        requesterName={requesterName}
        onClose={closeDetail}
      />
    </div>
  );
}
