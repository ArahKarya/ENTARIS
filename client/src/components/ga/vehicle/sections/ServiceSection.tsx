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
import { useTranslation } from 'react-i18next';

const ALL = '__all__';
const money = (v: string | number | null | undefined) => formatRupiah(toNumber(v) ?? 0, { symbol: false });

export function ServiceSection({ assetId, canEdit, canApprove }: VehicleContext) {
  const invalidate = useInvalidateVehicle(assetId);
  const { t } = useTranslation('eam');
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
      toast.success((r?.data as { message?: string } | undefined)?.message || t('vehicleSections.service.journalCreated'));
      invalidate(['services'], { fleet: false });
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.service.journalFailed'))),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${assetId}/services/${id}`),
    onSuccess: () => {
      toast.success(t('vehicleSections.service.logDeleted'));
      invalidate(['services']);
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.service.logDeleteFailed'))),
  });
  const approveReq = useMutation({
    mutationFn: (id: string) => api.patch(`/ga/vehicle/service-requests/${id}/approve`),
    onSuccess: () => {
      toast.success(t('vehicleSections.service.approved'));
      invalidate(['requests'], { fleet: false });
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.service.approveFailed'))),
  });
  const rejectReq = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.patch(`/ga/vehicle/service-requests/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success(t('vehicleSections.service.rejected'));
      invalidate(['requests'], { fleet: false });
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.service.rejectFailed'))),
  });

  const canPost = (l: ServiceLog) => canEdit && !l.journalEntry && (!l.source || l.source === 'EAM') && Number(l.biaya ?? 0) > 0;

  const logColumns = useMemo<ColumnDef<ServiceLog>[]>(
    () => [
      {
        id: 'tanggal',
        header: t('shared.date'),
        meta: { cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.tanggal),
      },
      {
        id: 'deskripsi',
        header: t('vehicleSections.service.work'),
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
        header: () => <UnitHeader label={t('vehicleSections.service.odometer')} unit="km" />,
        meta: { align: 'right', hideBelow: 'md' },
        cell: ({ row }) => (row.original.odometer != null ? formatNumber(row.original.odometer) : '—'),
      },
      {
        id: 'biaya',
        header: () => <UnitHeader label={t('vehicleSections.service.cost')} />,
        meta: { align: 'right' },
        cell: ({ row }) => (row.original.biaya != null ? money(row.original.biaya) : '—'),
      },
      {
        id: 'jurnal',
        header: t('vehicleSections.service.journal'),
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
            return <StatusBadge label={t('vehicleSections.service.historical')} tone="neutral" dot={false} />;
          }
          return <span className="text-xs text-muted-foreground">{t('vehicleSections.service.notPosted')}</span>;
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const l = row.original;
          return (
            <RowActions
              label={t('vehicleSections.service.actionsFor', { date: formatDate(l.tanggal) })}
              actions={[
                { label: t('vehicleSections.service.postJournal'), icon: FileCheck2, hidden: !canPost(l), disabled: postJournal.isPending, onSelect: () => postJournal.mutate(l.id) },
                { label: t('shared.delete'), icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteLog(l) },
              ]}
            />
          );
        },
      },
    ],
    // canPost depends on canEdit only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, postJournal.isPending, t],
  );

  const requestColumns = useMemo<ColumnDef<ServiceRequest>[]>(
    () => [
      {
        id: 'deskripsi',
        header: t('vehicleSections.service.request'),
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
        header: t('vehicleSections.service.urgency'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => URGENCY_LABELS[row.original.urgensi] ?? row.original.urgensi,
      },
      {
        id: 'status',
        header: t('shared.status'),
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
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const r = row.original;
          const pending = r.status === 'SUBMITTED' && canEdit && canApprove;
          return (
            <RowActions
              label={t('vehicleSections.service.requestActionsFor', { name: r.deskripsi })}
              actions={[
                { label: t('vehicleSections.service.approve'), icon: Check, hidden: !pending, onSelect: () => approveReq.mutate(r.id) },
                { label: t('vehicleSections.service.reject'), icon: X, tone: 'danger', hidden: !pending, onSelect: () => setRejectTarget(r) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, canApprove, t],
  );

  const bucketKeys = Object.keys(SERVICE_BUCKET_LABELS) as ServiceBucket[];

  return (
    <div className="space-y-4">
      <Panel
        title={t('vehicleSections.service.historyTitle')}
        description={filtering ? t('vehicleSections.service.filteredCount', { shown: formatNumber(filtered.length), total: formatNumber(logs.length) }) : t('vehicleSections.service.count', { count: logs.length, n: formatNumber(logs.length) })}
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" onClick={() => setShowLogModal(true)}>
              <Plus aria-hidden />
              {t('vehicleSections.service.logService')}
            </Button>
          )
        }
      >
        <div className="space-y-3 border-b border-border p-4">
          <div role="group" aria-label={t('vehicleSections.service.filterLabel')} className="flex flex-wrap items-center gap-2">
            <fieldset className="flex w-full items-center gap-1.5 sm:w-auto">
              <legend className="sr-only">{t('vehicleSections.service.dateRange')}</legend>
              <label htmlFor="svc-from" className="sr-only">{t('vehicleSections.service.from')}</label>
              <DateInput id="svc-from" value={startDate} max={endDate || undefined} onChange={setStartDate} className="min-w-0 flex-1 sm:w-36 sm:flex-none" />
              <span className="text-muted-foreground" aria-hidden>–</span>
              <label htmlFor="svc-to" className="sr-only">{t('vehicleSections.service.to')}</label>
              <DateInput id="svc-to" value={endDate} min={startDate || undefined} onChange={setEndDate} className="min-w-0 flex-1 sm:w-36 sm:flex-none" />
            </fieldset>
            <label htmlFor="svc-bucket" className="sr-only">{t('vehicleSections.service.costType')}</label>
            <Select value={bucket || ALL} onValueChange={(v) => setBucket(v === ALL ? '' : (v as ServiceBucket))}>
              <SelectTrigger id="svc-bucket" className="w-full sm:w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('vehicleSections.service.allCostTypes')}</SelectItem>
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
                {t('vehicleSections.service.reset')}
              </Button>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
              <dt className="text-xs text-muted-foreground">{t('vehicleSections.service.total')}</dt>
              <dd className="num text-sm font-semibold text-foreground" title={formatRupiah(summary.total)}>
                {formatRupiah(summary.total, { compact: true })}
              </dd>
            </div>
            {bucketKeys.map((k) => (
              <div key={k} className="rounded-md border border-border px-3 py-2">
                <dt className="truncate text-xs text-muted-foreground">{SERVICE_BUCKET_LABELS[k]}</dt>
                <dd className="num text-sm text-foreground" title={t('vehicleSections.service.bucketTitle', { amount: formatRupiah(summary.buckets[k].amount), count: summary.buckets[k].count })}>
                  {formatRupiah(summary.buckets[k].amount, { compact: true })}
                </dd>
              </div>
            ))}
          </dl>
        </div>
        <DataTable
          label={t('vehicleSections.service.historyTable')}
          itemLabel={t('vehicleSections.service.itemLabel')}
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
          empty={{ title: t('vehicleSections.service.emptyTitle'), description: t('vehicleSections.service.emptyDescription') }}
        />
      </Panel>

      <Panel
        title={t('vehicleSections.service.requestsTitle')}
        description={t('vehicleSections.service.requestsDescription')}
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" variant="outline" onClick={() => setShowRequestModal(true)}>
              <ClipboardList aria-hidden />
              {t('vehicleSections.service.requestService')}
            </Button>
          )
        }
      >
        <DataTable
          label={t('vehicleSections.service.requestsTable')}
          itemLabel={t('vehicleSections.service.requestsItem')}
          columns={requestColumns}
          data={requestsQuery.data}
          getRowId={(r) => r.id}
          loading={requestsQuery.isLoading}
          error={requestsQuery.error}
          onRetry={() => requestsQuery.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: t('vehicleSections.service.requestsEmpty') }}
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
        title={t('vehicleSections.service.deleteTitle')}
        description={t('vehicleSections.service.deleteConfirm', { name: deleteLog ? `${formatDate(deleteLog.tanggal)} · ${deleteLog.deskripsi}` : '' })}
        confirmLabel={t('shared.confirmDelete')}
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
        title={t('vehicleSections.service.rejectTitle')}
        description={rejectTarget?.deskripsi}
        confirmLabel={t('vehicleSections.service.reject')}
        tone="danger"
        requireReason={{ label: t('vehicleSections.service.rejectReason'), minLength: 1 }}
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
