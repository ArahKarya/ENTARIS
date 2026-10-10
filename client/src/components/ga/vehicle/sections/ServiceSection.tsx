/** Servis: service history (cost buckets, GL posting) and service requests (approval flow). */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, ClipboardList, FileCheck2, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, DataTable, DateInput, RowActions, StatusBadge } from '@/components/shared';
import { Panel } from '@/components/inventory/dashboard-kit';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SERVICE_TYPE_LABELS, URGENCY_LABELS } from '../constants';
import { ServiceLogModal, ServiceRequestModal } from '../modals/ServiceModals';
import type { ServiceLog, ServiceRequest, VehicleContext } from '../types';
import { useInvalidateVehicle, vehicleKeys } from '../vehicle-queries';
import {
  SERVICE_BUCKET_LABELS,
  apiError,
  buildServiceCostSummary,
  filterServiceLogs,
  type ServiceBucket,
} from '../vehicle-model';
import { UnitHeader } from '../vehicle-ui';
import { FLUSH_TABLE } from '../ui-classes';

const ALL = '__all__';
const money = (v: string | number | null | undefined) => formatRupiah(toNumber(v) ?? 0, { symbol: false });

export function ServiceSection({ assetId, canEdit, canApprove }: VehicleContext) {
  const invalidate = useInvalidateVehicle(assetId);
  const [showLogModal, setShowLogModal] = useState(false);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [deleteLog, setDeleteLog] = useState<ServiceLog | null>(null);
  const [rejectTarget, setRejectTarget] = useState<ServiceRequest | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [bucket, setBucket] = useState<ServiceBucket | ''>('');

  const logsQuery = useQuery<ServiceLog[]>({
    queryKey: vehicleKeys.services(assetId),
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}/services`)).data,
  });
  const requestsQuery = useQuery<ServiceRequest[]>({
    queryKey: vehicleKeys.requests(assetId),
    queryFn: async () => (await api.get('/ga/vehicle/service-requests', { params: { assetId } })).data,
  });

  const logs = useMemo(() => logsQuery.data ?? [], [logsQuery.data]);
  const filtered = useMemo(() => filterServiceLogs(logs, { startDate, endDate, bucket }), [logs, startDate, endDate, bucket]);
  const summary = useMemo(() => buildServiceCostSummary(filtered), [filtered]);
  const filtering = !!(startDate || endDate || bucket);

  const postJournal = useMutation({
    mutationFn: (id: string) => api.post(`/ga/vehicle/assets/${assetId}/services/${id}/journal`, {}),
    onSuccess: (r) => {
      toast.success((r?.data as { message?: string } | undefined)?.message || 'Jurnal dibuat.');
      invalidate(['services'], { fleet: false });
    },
    onError: (e) => toast.error(apiError(e, 'Gagal posting jurnal.')),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${assetId}/services/${id}`),
    onSuccess: () => {
      toast.success('Service log dihapus.');
      invalidate(['services']);
    },
    onError: (e) => toast.error(apiError(e, 'Gagal hapus service log.')),
  });
  const approveReq = useMutation({
    mutationFn: (id: string) => api.patch(`/ga/vehicle/service-requests/${id}/approve`),
    onSuccess: () => {
      toast.success('Pengajuan disetujui.');
      invalidate(['requests'], { fleet: false });
    },
    onError: (e) => toast.error(apiError(e, 'Gagal approve.')),
  });
  const rejectReq = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch(`/ga/vehicle/service-requests/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success('Pengajuan ditolak.');
      invalidate(['requests'], { fleet: false });
    },
    onError: (e) => toast.error(apiError(e, 'Gagal reject.')),
  });

  const canPost = (l: ServiceLog) => canEdit && !l.journalEntry && (!l.source || l.source === 'EAM') && Number(l.biaya ?? 0) > 0;

  const logColumns = useMemo<ColumnDef<ServiceLog>[]>(
    () => [
      {
        id: 'tanggal',
        header: 'Tanggal',
        meta: { cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.tanggal),
      },
      {
        id: 'deskripsi',
        header: 'Pekerjaan',
        meta: { cellClassName: 'min-w-48 max-w-96' },
        cell: ({ row }) => {
          const l = row.original;
          return (
            <div className="min-w-0">
              <p className="text-foreground">{l.deskripsi}</p>
              <p className="text-xs text-muted-foreground">
                {SERVICE_TYPE_LABELS[l.jenisService] ?? l.jenisService}
                {l.bengkel ? ` · ${l.bengkel}` : ''}
              </p>
            </div>
          );
        },
      },
      {
        id: 'odometer',
        header: () => <UnitHeader label="Odometer" unit="km" />,
        meta: { align: 'right', hideBelow: 'md' },
        cell: ({ row }) => (row.original.odometer != null ? formatNumber(row.original.odometer) : '—'),
      },
      {
        id: 'biaya',
        header: () => <UnitHeader label="Biaya" />,
        meta: { align: 'right' },
        cell: ({ row }) => (row.original.biaya != null ? money(row.original.biaya) : '—'),
      },
      {
        id: 'jurnal',
        header: 'Jurnal',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => {
          const l = row.original;
          if (l.journalEntry) {
            return (
              <span className="num text-xs font-medium text-success-text" title={`${l.account?.accountNumber ?? ''} ${l.account?.name ?? ''}`.trim()}>
                {l.journalEntry.entryNumber}
              </span>
            );
          }
          if (l.source && l.source !== 'EAM') {
            return <StatusBadge label="Historis" tone="neutral" dot={false} />;
          }
          return <span className="text-xs text-muted-foreground">Belum diposting</span>;
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const l = row.original;
          return (
            <RowActions
              label={`Aksi untuk servis ${formatDate(l.tanggal)}`}
              actions={[
                { label: 'Posting ke jurnal', icon: FileCheck2, hidden: !canPost(l), disabled: postJournal.isPending, onSelect: () => postJournal.mutate(l.id) },
                { label: 'Hapus', icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteLog(l) },
              ]}
            />
          );
        },
      },
    ],
    // canPost depends on canEdit only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, postJournal.isPending],
  );

  const requestColumns = useMemo<ColumnDef<ServiceRequest>[]>(
    () => [
      {
        id: 'deskripsi',
        header: 'Pengajuan',
        meta: { cellClassName: 'min-w-48 max-w-96' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="text-foreground">{row.original.deskripsi}</p>
            <p className="text-xs text-muted-foreground">{SERVICE_TYPE_LABELS[row.original.jenisService] ?? row.original.jenisService}</p>
          </div>
        ),
      },
      {
        id: 'urgensi',
        header: 'Urgensi',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => URGENCY_LABELS[row.original.urgensi] ?? row.original.urgensi,
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <StatusBadge status={row.original.status} />
            {row.original.status === 'REJECTED' && row.original.rejectedReason && (
              <span className="text-xs text-danger-text">{row.original.rejectedReason}</span>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const r = row.original;
          const pending = r.status === 'SUBMITTED' && canEdit && canApprove;
          return (
            <RowActions
              label={`Aksi untuk pengajuan ${r.deskripsi}`}
              actions={[
                { label: 'Setujui', icon: Check, hidden: !pending, onSelect: () => approveReq.mutate(r.id) },
                { label: 'Tolak', icon: X, tone: 'danger', hidden: !pending, onSelect: () => setRejectTarget(r) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, canApprove],
  );

  const bucketKeys = Object.keys(SERVICE_BUCKET_LABELS) as ServiceBucket[];

  return (
    <div className="space-y-4">
      <Panel
        title="Riwayat Servis"
        description={filtering ? `${formatNumber(filtered.length)} dari ${formatNumber(logs.length)} catatan sesuai filter` : `${formatNumber(logs.length)} catatan`}
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" onClick={() => setShowLogModal(true)}>
              <Plus aria-hidden />
              Catat servis
            </Button>
          )
        }
      >
        <div className="space-y-3 border-b border-border p-4">
          <div role="group" aria-label="Filter riwayat servis" className="flex flex-wrap items-center gap-2">
            <fieldset className="flex w-full items-center gap-1.5 sm:w-auto">
              <legend className="sr-only">Rentang tanggal servis</legend>
              <label htmlFor="svc-from" className="sr-only">Dari tanggal</label>
              <DateInput id="svc-from" value={startDate} max={endDate || undefined} onChange={setStartDate} className="min-w-0 flex-1 sm:w-36 sm:flex-none" />
              <span className="text-muted-foreground" aria-hidden>–</span>
              <label htmlFor="svc-to" className="sr-only">Sampai tanggal</label>
              <DateInput id="svc-to" value={endDate} min={startDate || undefined} onChange={setEndDate} className="min-w-0 flex-1 sm:w-36 sm:flex-none" />
            </fieldset>
            <label htmlFor="svc-bucket" className="sr-only">Jenis biaya</label>
            <Select value={bucket || ALL} onValueChange={(v) => setBucket(v === ALL ? '' : (v as ServiceBucket))}>
              <SelectTrigger id="svc-bucket" className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Semua jenis biaya</SelectItem>
                {bucketKeys.map((k) => (
                  <SelectItem key={k} value={k}>
                    {SERVICE_BUCKET_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {filtering && (
              <Button
                variant="ghost"
                size="md"
                className="text-muted-foreground"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                  setBucket('');
                }}
              >
                <RotateCcw aria-hidden />
                Reset
              </Button>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">Total</dt>
              <dd className="num text-sm font-semibold text-foreground" title={formatRupiah(summary.total)}>
                {formatRupiah(summary.total, { compact: true })}
              </dd>
            </div>
            {bucketKeys.map((k) => (
              <div key={k} className="rounded-md border border-border px-3 py-2">
                <dt className="truncate text-xs text-muted-foreground">{SERVICE_BUCKET_LABELS[k]}</dt>
                <dd className="num text-sm text-foreground" title={`${formatRupiah(summary.buckets[k].amount)} · ${summary.buckets[k].count} catatan`}>
                  {formatRupiah(summary.buckets[k].amount, { compact: true })}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <DataTable
          label="Riwayat servis kendaraan"
          itemLabel="catatan"
          columns={logColumns}
          data={filtered}
          getRowId={(r) => r.id}
          loading={logsQuery.isLoading}
          error={logsQuery.error}
          onRetry={() => logsQuery.refetch()}
          filtered={filtering}
          onClearFilters={() => {
            setStartDate('');
            setEndDate('');
            setBucket('');
          }}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: 'Belum ada riwayat servis', description: 'Servis yang dicatat untuk kendaraan ini akan muncul di sini.' }}
        />
      </Panel>

      <Panel
        title="Pengajuan Servis"
        description="Pengajuan menunggu persetujuan sebelum dikerjakan."
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" variant="outline" onClick={() => setShowRequestModal(true)}>
              <ClipboardList aria-hidden />
              Ajukan servis
            </Button>
          )
        }
      >
        <DataTable
          label="Pengajuan servis kendaraan"
          itemLabel="pengajuan"
          columns={requestColumns}
          data={requestsQuery.data}
          getRowId={(r) => r.id}
          loading={requestsQuery.isLoading}
          error={requestsQuery.error}
          onRetry={() => requestsQuery.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: 'Belum ada pengajuan servis' }}
        />
      </Panel>

      {showLogModal && (
        <ServiceLogModal
          assetId={assetId}
          onClose={() => setShowLogModal(false)}
          onSaved={() => {
            setShowLogModal(false);
            invalidate(['services', 'vehicle']);
          }}
        />
      )}
      {showRequestModal && (
        <ServiceRequestModal
          assetId={assetId}
          onClose={() => setShowRequestModal(false)}
          onSaved={() => {
            setShowRequestModal(false);
            invalidate(['requests'], { fleet: false });
          }}
        />
      )}
      <ConfirmDialog
        open={deleteLog !== null}
        onOpenChange={(o) => !o && setDeleteLog(null)}
        title="Hapus Service Log"
        description={`Hapus service log "${deleteLog ? `${formatDate(deleteLog.tanggal)} · ${deleteLog.deskripsi}` : ''}"?`}
        confirmLabel="Ya, Hapus"
        tone="danger"
        loading={deleteMut.isPending}
        onConfirm={async () => {
          if (!deleteLog) return;
          await deleteMut.mutateAsync(deleteLog.id);
          setDeleteLog(null);
        }}
      />
      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(o) => !o && setRejectTarget(null)}
        title="Tolak Pengajuan Servis"
        description={rejectTarget?.deskripsi}
        confirmLabel="Tolak"
        tone="danger"
        requireReason={{ label: 'Alasan penolakan', minLength: 1 }}
        loading={rejectReq.isPending}
        onConfirm={async (reason) => {
          if (!rejectTarget || !reason) return;
          await rejectReq.mutateAsync({ id: rejectTarget.id, reason });
          setRejectTarget(null);
        }}
      />
    </div>
  );
}
