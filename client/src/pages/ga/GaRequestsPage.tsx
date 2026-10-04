/**
 * Pengajuan tab of the Pemeliharaan page: one inbox for vehicle service and
 * tax/STNK/KIR requests (submit from here without opening the vehicle page),
 * with approve / reject (reason) / cancel for users with ga_vehicle edit.
 *
 * GET /ga/vehicle/service-requests and /tax-requests return every request, so
 * the two lists are merged and searched, filtered, sorted and paged in memory
 * on the same URL state as the server-paged lists. KPI cards count all
 * requests (not the visible page).
 */
import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';
import { AlertTriangle, Ban, Check, CheckCircle2, Clock, ListChecks, Plus, ReceiptText, Wrench, X } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ComboboxFilter,
  ConfirmDialog,
  DataTable,
  FilterBar,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
} from '@/components/shared';
import { compareNullable, includesText, pageRows, sortRows, type Comparators } from '@/components/ga/maintenance/local-list';
import {
  REQUEST_FILTER_KEYS,
  REQ_STATUS_FILTERS,
  SERVICE_TYPE_LABELS,
  TAX_TYPE_LABELS,
  URGENSI_LABELS,
  URGENSI_TONE,
  apiErrorMessage,
  type ReqStatus,
  type ServiceRequestRow,
  type TaxRequestRow,
  type UnifiedRow,
  type Urgensi,
} from './requests/types';


const STATUS_FILTER = statusOptions(REQ_STATUS_FILTERS);
const KIND_FILTER = [
  { value: 'SERVICE', label: 'Servis' },
  { value: 'TAX', label: 'Pajak / STNK / KIR' },
];
const URGENSI_ORDER: Urgensi[] = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'];
const URGENSI_FILTER = URGENSI_ORDER.map((u) => ({ value: u, label: URGENSI_LABELS[u] }));
const FILTER_CLASS = 'w-[calc(50%-0.25rem)] sm:w-44';

const STATUS_RANK: Record<ReqStatus, number> = { SUBMITTED: 0, APPROVED: 1, REJECTED: 2, COMPLETED: 3, CANCELLED: 4 };
const URGENSI_RANK: Record<Urgensi, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

/** Default inbox order: waiting first, most urgent first, newest first. */
const inboxOrder = (a: UnifiedRow, b: UnifiedRow) =>
  STATUS_RANK[a.status] - STATUS_RANK[b.status] ||
  URGENSI_RANK[a.urgensi] - URGENSI_RANK[b.urgensi] ||
  (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

const COMPARATORS: Comparators<UnifiedRow> = {
  createdAt: (a, b) => compareNullable(a.createdAt, b.createdAt),
  urgensi: (a, b) => URGENSI_RANK[b.urgensi] - URGENSI_RANK[a.urgensi],
  nominal: (a, b) => compareNullable(a.nominal, b.nominal),
};

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

function toUnified(svc: ServiceRequestRow[] = [], tax: TaxRequestRow[] = []): UnifiedRow[] {
  const s: UnifiedRow[] = svc.map((r) => ({
    kind: 'SERVICE',
    id: r.id,
    status: r.status,
    urgensi: r.urgensi,
    jenis: SERVICE_TYPE_LABELS[r.jenisService] ?? r.jenisService,
    keterangan: r.deskripsi,
    assetLabel: r.asset ? `${r.asset.code} — ${r.asset.name}` : '-',
    nominal: null,
    createdAt: r.createdAt,
    tindakLanjut: r.workOrder ? `WO ${r.workOrder.code}` : r.rejectedReason ? `Ditolak: ${r.rejectedReason}` : null,
  }));
  const t: UnifiedRow[] = tax.map((r) => ({
    kind: 'TAX',
    id: r.id,
    status: r.status,
    urgensi: r.urgensi,
    jenis: `${TAX_TYPE_LABELS[r.type] ?? r.type} ${r.periodYear}`,
    keterangan: r.deskripsi || `Jatuh tempo ${formatDate(r.dueDate)}`,
    assetLabel: r.asset ? `${r.asset.code} — ${r.asset.name}` : '-',
    nominal: r.estimatedAmount != null ? Number(r.estimatedAmount) : null,
    createdAt: r.createdAt,
    tindakLanjut: r.tax ? `Pajak ${r.tax.periodYear} (${r.tax.status})` : r.rejectedReason ? `Ditolak: ${r.rejectedReason}` : null,
  }));
  return [...s, ...t].sort(inboxOrder);
}

const basePath = (r: UnifiedRow) =>
  r.kind === 'SERVICE' ? '/ga/vehicle/service-requests' : '/ga/vehicle/tax-requests';

export interface RequestsTabProps {
  /** ga_vehicle edit: submit, approve, reject, cancel. */
  canEdit: boolean;
  onCreate: (mode: 'SERVICE' | 'TAX') => void;
}

export function RequestsTab({ canEdit, onCreate }: RequestsTabProps) {
  const queryClient = useQueryClient();
  const list = useListState({ filters: REQUEST_FILTER_KEYS });
  const [density, setDensity] = useTableDensity();
  const [rejectTarget, setRejectTarget] = useState<UnifiedRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<UnifiedRow | null>(null);

  const svcQuery = useQuery<ServiceRequestRow[]>({
    queryKey: ['ga-service-requests', 'all'],
    queryFn: async () => (await api.get('/ga/vehicle/service-requests')).data,
  });
  const taxQuery = useQuery<TaxRequestRow[]>({
    queryKey: ['ga-tax-requests', 'all'],
    queryFn: async () => (await api.get('/ga/vehicle/tax-requests')).data,
  });

  const isLoading = svcQuery.isLoading || taxQuery.isLoading;
  const error = svcQuery.error ?? taxQuery.error;
  const all = useMemo(() => toUnified(svcQuery.data, taxQuery.data), [svcQuery.data, taxQuery.data]);

  const { status, kind, urgensi } = list.filters;
  const filtered = useMemo(
    () =>
      all.filter(
        (r) =>
          (!status || r.status === status) &&
          (!kind || r.kind === kind) &&
          (!urgensi || r.urgensi === urgensi) &&
          includesText([r.jenis, r.assetLabel, r.keterangan, r.tindakLanjut], list.search),
      ),
    [all, status, kind, urgensi, list.search],
  );
  const sorted = useMemo(() => sortRows(filtered, list.sort, COMPARATORS), [filtered, list.sort]);
  const rows = pageRows(sorted, list.page, list.pageSize);

  const counts = useMemo(() => {
    const waiting = all.filter((r) => r.status === 'SUBMITTED');
    return {
      submitted: waiting.length,
      urgent: waiting.filter((r) => r.urgensi === 'URGENT' || r.urgensi === 'HIGH').length,
      approved: all.filter((r) => r.status === 'APPROVED').length,
      total: all.length,
    };
  }, [all]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['ga-service-requests'] });
    queryClient.invalidateQueries({ queryKey: ['ga-tax-requests'] });
    queryClient.invalidateQueries({ queryKey: ['ga-work-orders'] });
  };

  const approve = useMutation({
    mutationFn: (r: UnifiedRow) => api.patch(`${basePath(r)}/${r.id}/approve`),
    onSuccess: (_res, r) => {
      toast.success(r.kind === 'SERVICE' ? 'Pengajuan disetujui; work order dibuat.' : 'Pengajuan disetujui.');
      refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Gagal menyetujui pengajuan.')),
  });
  const reject = useMutation({
    mutationFn: ({ row, reason }: { row: UnifiedRow; reason: string }) =>
      api.patch(`${basePath(row)}/${row.id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Pengajuan ditolak.');
      refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Gagal menolak pengajuan.')),
  });
  const cancel = useMutation({
    mutationFn: (r: UnifiedRow) => api.patch(`${basePath(r)}/${r.id}/cancel`),
    onSuccess: () => {
      toast.success('Pengajuan dibatalkan.');
      refresh();
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Gagal membatalkan pengajuan.')),
  });

  const approveRow = approve.mutate;
  const actionsFor = useCallback(
    (r: UnifiedRow) => [
      { label: 'Setujui', icon: Check, hidden: !canEdit || r.status !== 'SUBMITTED', onSelect: () => approveRow(r) },
      { label: 'Tolak…', icon: X, hidden: !canEdit || r.status !== 'SUBMITTED', onSelect: () => setRejectTarget(r) },
      {
        label: 'Batalkan pengajuan',
        icon: Ban,
        tone: 'danger' as const,
        hidden: !canEdit || (r.status !== 'SUBMITTED' && r.status !== 'APPROVED'),
        onSelect: () => setCancelTarget(r),
      },
    ],
    [canEdit, approveRow],
  );

  const columns = useMemo<ColumnDef<UnifiedRow>[]>(
    () => [
      {
        id: 'jenis',
        header: 'Pengajuan',
        meta: { cellClassName: 'min-w-44 max-w-72' },
        cell: ({ row }) => {
          const r = row.original;
          const Icon = r.kind === 'SERVICE' ? Wrench : ReceiptText;
          return (
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="sr-only">{r.kind === 'SERVICE' ? 'Servis:' : 'Pajak:'}</span>
                <span className="truncate">{r.jenis}</span>
              </p>
              <p className="truncate text-xs text-muted-foreground">{r.assetLabel}</p>
              {/* Mobile: date + urgency stacked here because their columns are hidden. */}
              <p className="mt-1 flex flex-wrap items-center gap-1.5 sm:hidden">
                <span className="num text-xs text-muted-foreground">{formatDate(r.createdAt)}</span>
                <StatusBadge label={URGENSI_LABELS[r.urgensi]} tone={URGENSI_TONE[r.urgensi]} />
              </p>
            </div>
          );
        },
      },
      {
        id: 'createdAt',
        header: 'Tanggal',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'sm', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      {
        id: 'keterangan',
        header: 'Keterangan',
        meta: { hideBelow: 'lg', cellClassName: 'max-w-72' },
        cell: ({ row }) => (
          <span className="line-clamp-2 text-muted-foreground" title={row.original.keterangan}>
            {row.original.keterangan}
          </span>
        ),
      },
      {
        id: 'nominal',
        header: () => withUnit('Estimasi'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'xl' },
        cell: ({ row }) =>
          row.original.nominal != null ? (
            formatRupiah(row.original.nominal, { symbol: false })
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: 'urgensi',
        header: 'Urgensi',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => (
          <StatusBadge label={URGENSI_LABELS[row.original.urgensi]} tone={URGENSI_TONE[row.original.urgensi]} />
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'tindakLanjut',
        header: 'Tindak Lanjut',
        meta: { hideBelow: 'xl', cellClassName: 'max-w-52' },
        cell: ({ row }) => (
          <span className="block truncate text-muted-foreground" title={row.original.tindakLanjut ?? ''}>
            {row.original.tindakLanjut ?? '-'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions label={`Aksi untuk pengajuan ${row.original.jenis}`} actions={actionsFor(row.original)} />
        ),
      },
    ],
    [actionsFor],
  );

  return (
    <div className="space-y-5">
      <section aria-label="Ringkasan pengajuan" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Menunggu Persetujuan" value={formatNumber(counts.submitted)} icon={Clock} loading={isLoading} hint="status Diajukan" />
        <StatCard label="Mendesak" value={formatNumber(counts.urgent)} icon={AlertTriangle} loading={isLoading} hint="menunggu, urgensi Tinggi/Mendesak" />
        <StatCard label="Disetujui" value={formatNumber(counts.approved)} icon={CheckCircle2} loading={isLoading} hint="sedang ditindaklanjuti" />
        <StatCard label="Total Pengajuan" value={formatNumber(counts.total)} icon={ListChecks} loading={isLoading} hint="servis + pajak/KIR" />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari pengajuan"
          searchPlaceholder="Cari jenis, kendaraan, atau keterangan"
          status={{ options: STATUS_FILTER }}
        >
          <ComboboxFilter
            label="Filter jenis pengajuan"
            allLabel="Semua jenis"
            value={list.filters.kind}
            onChange={(v) => list.setFilter('kind', v)}
            options={KIND_FILTER}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label="Filter urgensi"
            allLabel="Semua urgensi"
            value={list.filters.urgensi}
            onChange={(v) => list.setFilter('urgensi', v)}
            options={URGENSI_FILTER}
            className={FILTER_CLASS}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, filtered.length)}
          label="Daftar pengajuan servis dan pajak kendaraan"
          itemLabel="pengajuan"
          columns={columns}
          data={svcQuery.data && taxQuery.data ? rows : undefined}
          getRowId={(row) => `${row.kind}-${row.id}`}
          loading={isLoading}
          error={error}
          onRetry={() => {
            svcQuery.refetch();
            taxQuery.refetch();
          }}
          rowClassName={(row) => (row.status === 'CANCELLED' ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada pengajuan',
            description: 'Pengajuan servis kendaraan dan pajak/STNK/KIR akan muncul di sini.',
            action: canEdit ? (
              <Button size="sm" onClick={() => onCreate('SERVICE')}>
                <Plus aria-hidden />
                Ajukan servis
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => !open && setRejectTarget(null)}
        tone="danger"
        title="Tolak pengajuan?"
        description={rejectTarget ? `${rejectTarget.jenis} — ${rejectTarget.assetLabel}` : undefined}
        confirmLabel="Tolak"
        requireReason={{ label: 'Alasan penolakan', minLength: 1 }}
        onConfirm={(reason) => (rejectTarget && reason ? reject.mutateAsync({ row: rejectTarget, reason }) : undefined)}
        loading={reject.isPending}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        tone="danger"
        title="Batalkan pengajuan?"
        description={cancelTarget ? `${cancelTarget.jenis} — ${cancelTarget.assetLabel}` : undefined}
        confirmLabel="Batalkan pengajuan"
        cancelLabel="Kembali"
        onConfirm={() => (cancelTarget ? cancel.mutateAsync(cancelTarget) : undefined)}
        loading={cancel.isPending}
      />
    </div>
  );
}
