/**
 * Server-paged work order list; KPI cards use the same filters. Rows open the
 * detail sheet (the page owns ?wo=<id>).
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, CheckCircle2, ClipboardList, Eye, Play, Plus, UserCheck, UserPlus, Wallet, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatNumber, formatRupiah } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ComboboxFilter,
  ConfirmDialog,
  DataTable,
  DocumentLink,
  FilterBar,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import { DueDate } from '@/components/ProjectGuaranteeDueDate';
import { PriorityBadge } from './wo-badges';
import { AssignModal, CompleteModal } from './wo-forms';
import { WO_FILTER_KEYS, useGaAssetOptions } from './queries';
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  TYPE_LABELS,
  WO_STATUSES,
  WO_STATUS_ACTIVE,
  apiErrorMessage,
  woActions,
  woDueState,
  type WoType,
  type WorkOrderRow,
  type WorkOrderSummary,
} from './wo-meta';

const ENDPOINT = '/ga/maintenance/work-orders';

const STATUS_FILTER = [
  { value: WO_STATUS_ACTIVE, label: 'Aktif (belum selesai)' },
  ...statusOptions(WO_STATUSES, 'ga_work_order'),
];
const PRIORITY_FILTER = PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_LABELS[p] }));
const TYPE_FILTER = (Object.keys(TYPE_LABELS) as WoType[]).map((t) => ({ value: t, label: TYPE_LABELS[t] }));
const DUE_FILTER = [
  { value: 'overdue', label: 'Lewat jatuh tempo' },
  { value: 'dueSoon', label: 'Jatuh tempo 7 hari' },
];
const FILTER_CLASS = 'w-[calc(50%-0.25rem)] sm:w-44';

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

type RowForm = { kind: 'assign' | 'complete'; wo: WorkOrderRow } | null;

export interface WorkOrdersTabProps {
  canEdit: boolean;
  onOpen: (wo: WorkOrderRow) => void;
  onCreate: () => void;
}

export function WorkOrdersTab({ canEdit, onOpen, onCreate }: WorkOrdersTabProps) {
  const queryClient = useQueryClient();
  const list = useListState({ filters: WO_FILTER_KEYS });
  const [density, setDensity] = useTableDensity();
  const [rowForm, setRowForm] = useState<RowForm>(null);
  const [cancelTarget, setCancelTarget] = useState<WorkOrderRow | null>(null);
  const assetsQuery = useGaAssetOptions();

  const listQuery = useQuery({
    queryKey: ['ga-work-orders', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<WorkOrderRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: ['ga-work-orders', 'summary', list.filterParams],
    queryFn: async () => (await api.get<WorkOrderSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const invalidate = (id?: string) => {
    queryClient.invalidateQueries({ queryKey: ['ga-work-orders'] });
    if (id) queryClient.invalidateQueries({ queryKey: ['ga-work-order', id] });
  };

  const startMutation = useMutation({
    mutationFn: (wo: WorkOrderRow) => api.patch(`${ENDPOINT}/${wo.id}/start`),
    onSuccess: (_res, wo) => {
      toast.success(`${wo.code} mulai dikerjakan.`);
      invalidate(wo.id);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal memulai work order.')),
  });
  const cancelMutation = useMutation({
    mutationFn: ({ wo, reason }: { wo: WorkOrderRow; reason: string }) =>
      api.patch(`${ENDPOINT}/${wo.id}/cancel`, { reason }),
    onSuccess: (_res, { wo }) => {
      toast.success(`${wo.code} dibatalkan.`);
      invalidate(wo.id);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal membatalkan work order.')),
  });

  const startWorkOrder = startMutation.mutate;

  const assetFilterOptions = useMemo(
    () => (assetsQuery.data ?? []).map((a) => ({ value: a.id, label: a.name, hint: a.code })),
    [assetsQuery.data],
  );

  const columns = useMemo<ColumnDef<WorkOrderRow>[]>(
    () => [
      {
        id: 'code',
        header: 'Kode',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => {
          const wo = row.original;
          const due = woDueState(wo);
          return (
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              <DocumentLink onClick={() => onOpen(wo)}>{wo.code}</DocumentLink>
              {/* Mobile: title, asset, priority and due marker stacked here (their columns are hidden). */}
              <span className="line-clamp-2 max-w-52 break-words text-sm font-medium text-foreground sm:hidden">{wo.title}</span>
              <span className="max-w-52 truncate text-xs text-muted-foreground sm:hidden">{wo.asset?.name ?? '-'}</span>
              <span className="flex flex-wrap items-center gap-1.5 md:hidden">
                <PriorityBadge priority={wo.priority} />
                <DueDate dueState={due} markerOnly />
              </span>
            </div>
          );
        },
      },
      {
        id: 'title',
        header: 'Pekerjaan',
        meta: { hideBelow: 'sm', cellClassName: 'min-w-48 max-w-80' },
        cell: ({ row }) => {
          const wo = row.original;
          return (
            <div className="min-w-0">
              <p className="line-clamp-2 break-words font-medium text-foreground">{wo.title}</p>
              <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                {wo.asset ? `${wo.asset.code} · ${wo.asset.name}` : '-'}
              </p>
            </div>
          );
        },
      },
      {
        id: 'priority',
        header: 'Prioritas',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md' },
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        id: 'dueAt',
        header: 'Jatuh Tempo',
        enableSorting: true,
        meta: { hideBelow: 'md' },
        cell: ({ row }) =>
          row.original.dueAt ? (
            <DueDate date={row.original.dueAt} dueState={woDueState(row.original)} />
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: 'assignee',
        header: 'Teknisi',
        meta: { hideBelow: 'lg', cellClassName: 'max-w-40' },
        cell: ({ row }) =>
          row.original.assignee ? (
            <span className="block truncate text-foreground">{row.original.assignee.fullName ?? 'Ditugaskan'}</span>
          ) : (
            <span className="text-muted-foreground">Belum ada</span>
          ),
      },
      {
        id: 'type',
        header: 'Tipe',
        meta: { hideBelow: 'xl', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => TYPE_LABELS[row.original.type] ?? row.original.type,
      },
      {
        id: 'totalCost',
        header: () => withUnit('Biaya'),
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ row }) => {
          const cost = row.original.totalCost;
          return cost ? (
            <span className="text-foreground">{formatRupiah(cost, { symbol: false })}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="ga_work_order" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const wo = row.original;
          const can = woActions(wo.status);
          return (
            <RowActions
              label={`Aksi untuk ${wo.code}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => onOpen(wo) },
                {
                  label: wo.status === 'ASSIGNED' ? 'Ubah teknisi' : 'Tugaskan teknisi',
                  icon: UserPlus,
                  hidden: !canEdit || !can.assign,
                  onSelect: () => setRowForm({ kind: 'assign', wo }),
                },
                {
                  label: 'Mulai kerjakan',
                  icon: Play,
                  hidden: !canEdit || !can.start,
                  onSelect: () => startWorkOrder(wo),
                },
                {
                  label: 'Selesaikan',
                  icon: CheckCircle2,
                  hidden: !canEdit || !can.complete,
                  onSelect: () => setRowForm({ kind: 'complete', wo }),
                },
                {
                  label: 'Batalkan WO',
                  icon: XCircle,
                  tone: 'danger',
                  hidden: !canEdit || !can.cancel,
                  onSelect: () => setCancelTarget(wo),
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, onOpen, startWorkOrder],
  );

  const summary = summaryQuery.data;
  const kpiLoading = !summary && !summaryQuery.isError;
  const mine = list.filters.mine === 'true';

  return (
    <div className="space-y-5">
      <section aria-label="Ringkasan work order sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="WO Aktif"
          icon={ClipboardList}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.active) : '-'}
          hint={summary ? `dari ${formatNumber(summary.count)} work order` : undefined}
        />
        <StatCard
          label="Lewat Jatuh Tempo"
          icon={CalendarClock}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.overdue) : '-'}
          hint="WO aktif melewati tanggal jatuh tempo"
        />
        <StatCard
          label="Selesai Bulan Ini"
          icon={CheckCircle2}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.doneThisMonth) : '-'}
          hint="status Selesai atau Ditutup"
        />
        <StatCard
          label="Total Biaya"
          icon={Wallet}
          loading={kpiLoading}
          value={summary ? formatRupiah(summary.totalCost, { compact: true }) : '-'}
          valueTitle={summary ? formatRupiah(summary.totalCost) : undefined}
          hint="tenaga + vendor + part"
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari work order"
          searchPlaceholder="Cari kode, judul, komponen, atau aset"
          status={{ options: STATUS_FILTER }}
          dateRange={{ label: 'Rentang tanggal lapor' }}
        >
          <ComboboxFilter
            label="Filter prioritas"
            allLabel="Semua prioritas"
            value={list.filters.priority}
            onChange={(v) => list.setFilter('priority', v)}
            options={PRIORITY_FILTER}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label="Filter tipe"
            allLabel="Semua tipe"
            value={list.filters.type}
            onChange={(v) => list.setFilter('type', v)}
            options={TYPE_FILTER}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label="Filter aset"
            allLabel="Semua aset"
            searchPlaceholder="Cari aset…"
            value={list.filters.assetId}
            onChange={(v) => list.setFilter('assetId', v)}
            options={assetFilterOptions}
            loading={assetsQuery.isLoading}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label="Filter jatuh tempo"
            allLabel="Semua jatuh tempo"
            value={list.filters.due}
            onChange={(v) => list.setFilter('due', v)}
            options={DUE_FILTER}
            className={FILTER_CLASS}
          />
          <Button
            variant={mine ? 'primary' : 'outline'}
            aria-pressed={mine}
            onClick={() => list.setFilter('mine', mine ? '' : 'true')}
            className={cn(FILTER_CLASS, 'h-10 md:h-9')}
          >
            <UserCheck aria-hidden />
            WO Saya
          </Button>
        </FilterBar>

        <DataTable
          {...listTableProps(list, listQuery.data?.total)}
          label="Daftar work order"
          itemLabel="work order"
          columns={columns}
          data={listQuery.data?.data}
          getRowId={(row) => row.id}
          loading={listQuery.isLoading}
          fetching={listQuery.isFetching && listQuery.isPlaceholderData}
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
          onRowClick={onOpen}
          rowClassName={(row) => (row.status === 'CANCELLED' ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada work order',
            description: 'Work order perbaikan dan perawatan aset akan muncul di sini.',
            action: canEdit ? (
              <Button size="sm" onClick={onCreate}>
                <Plus aria-hidden />
                Buat work order pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      {rowForm?.kind === 'assign' && (
        <AssignModal
          id={rowForm.wo.id}
          currentAssigneeId={rowForm.wo.assignedToId}
          onClose={() => setRowForm(null)}
          onDone={() => invalidate(rowForm.wo.id)}
        />
      )}
      {rowForm?.kind === 'complete' && (
        <CompleteModal id={rowForm.wo.id} onClose={() => setRowForm(null)} onDone={() => invalidate(rowForm.wo.id)} />
      )}
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        tone="danger"
        title="Batalkan work order?"
        description={cancelTarget ? `${cancelTarget.code} · ${cancelTarget.title}. WO yang dibatalkan tidak bisa dikembalikan.` : undefined}
        confirmLabel="Batalkan WO"
        requireReason={{ label: 'Alasan pembatalan', minLength: 1 }}
        loading={cancelMutation.isPending}
        onConfirm={(reason) =>
          cancelTarget ? cancelMutation.mutateAsync({ wo: cancelTarget, reason: (reason ?? '').slice(0, 500) }) : undefined
        }
      />
    </div>
  );
}
