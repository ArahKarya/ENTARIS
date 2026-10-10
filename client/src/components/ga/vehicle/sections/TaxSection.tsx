/** Pajak & STNK: tax / STNK / KIR records with due state, and tax requests (approval flow). */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Check, ClipboardList, FileCheck2, Pencil, Plus, Trash2, X, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatRupiah, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, DataTable, RowActions, StatusBadge } from '@/components/shared';
import { Panel } from '@/components/inventory/dashboard-kit';
import { TAX_TYPE_LABELS, URGENCY_LABELS } from '../constants';
import { viewDocument } from '../documents-api';
import { TaxModal, TaxRequestModal } from '../modals/TaxInsuranceModals';
import type { TaxRecord, TaxRequest, VehicleContext } from '../types';
import { FLUSH_TABLE } from '../ui-classes';
import { useInvalidateVehicle, vehicleKeys } from '../vehicle-queries';
import { apiError, dueStateOf, taxCost } from '../vehicle-model';
import { DueDateCell, UnitHeader } from '../vehicle-ui';
import { useTranslation } from 'react-i18next';

const money = (v: string | number | null | undefined) => (v == null ? '—' : formatRupiah(toNumber(v) ?? 0, { symbol: false }));

export function TaxSection({ assetId, canEdit, canApprove }: VehicleContext) {
  const invalidate = useInvalidateVehicle(assetId);
  const { t } = useTranslation('eam');
  const [modal, setModal] = useState<TaxRecord | 'new' | null>(null);
  const [showRequest, setShowRequest] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TaxRecord | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TaxRequest | null>(null);

  const taxesQuery = useQuery<TaxRecord[]>({
    queryKey: vehicleKeys.taxes(assetId),
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}/taxes`)).data,
  });
  const requestsQuery = useQuery<TaxRequest[]>({
    queryKey: vehicleKeys.taxRequests(assetId),
    queryFn: async () => (await api.get('/ga/vehicle/tax-requests', { params: { assetId } })).data,
  });

  const afterRequestChange = () => invalidate(['taxRequests', 'taxes']);
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${assetId}/taxes/${id}`),
    onSuccess: () => {
      toast.success(t('vehicleSections.tax.deleted'));
      invalidate(['taxes']);
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.tax.deleteFailed'))),
  });
  const approveReq = useMutation({
    mutationFn: (id: string) => api.patch(`/ga/vehicle/tax-requests/${id}/approve`),
    onSuccess: () => {
      toast.success(t('vehicleSections.tax.approved'));
      afterRequestChange();
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.tax.approveFailed'))),
  });
  const rejectReq = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.patch(`/ga/vehicle/tax-requests/${id}/reject`, { reason }),
    onSuccess: () => {
      toast.success(t('vehicleSections.tax.rejected'));
      afterRequestChange();
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.tax.rejectFailed'))),
  });
  const cancelReq = useMutation({
    mutationFn: (id: string) => api.patch(`/ga/vehicle/tax-requests/${id}/cancel`),
    onSuccess: () => {
      toast.success(t('vehicleSections.tax.cancelled'));
      afterRequestChange();
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.tax.cancelFailed'))),
  });

  const taxColumns = useMemo<ColumnDef<TaxRecord>[]>(
    () => [
      {
        id: 'type',
        header: t('vehicleSections.tax.type'),
        meta: { cellClassName: 'min-w-36' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{TAX_TYPE_LABELS[row.original.type] ?? row.original.type}</p>
            <p className="num text-xs text-muted-foreground">{t('vehicleSections.tax.period', { year: row.original.periodYear })}</p>
          </div>
        ),
      },
      {
        id: 'dueDate',
        header: t('vehicleSections.tax.dueDate'),
        cell: ({ row }) => (
          <DueDateCell date={row.original.dueDate} state={dueStateOf(row.original.dueDate, row.original.status === 'ACTIVE')} />
        ),
      },
      {
        id: 'paidAt',
        header: t('vehicleSections.tax.paidAt'),
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.paidAt),
      },
      {
        id: 'amount',
        header: () => <UnitHeader label={t('vehicleSections.tax.cost')} />,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => money(taxCost(row.original)),
      },
      {
        id: 'status',
        header: t('shared.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const rec = row.original;
          const label = `${TAX_TYPE_LABELS[rec.type] ?? rec.type} ${rec.periodYear}`;
          return (
            <RowActions
              label={t('shared.actionsFor', { name: label })}
              actions={[
                { label: t('vehicleSections.tax.viewDocument'), icon: FileCheck2, hidden: !rec.document, onSelect: () => rec.document && viewDocument(rec.document.id) },
                { label: t('shared.edit'), icon: Pencil, hidden: !canEdit, onSelect: () => setModal(rec) },
                { label: t('shared.delete'), icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(rec) },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, t],
  );

  const requestColumns = useMemo<ColumnDef<TaxRequest>[]>(
    () => [
      {
        id: 'type',
        header: t('vehicleSections.tax.type'),
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{TAX_TYPE_LABELS[row.original.type] ?? row.original.type}</p>
            <p className="num text-xs text-muted-foreground">{t('vehicleSections.tax.period', { year: row.original.periodYear })}</p>
          </div>
        ),
      },
      {
        id: 'dueDate',
        header: t('vehicleSections.tax.dueDate'),
        meta: { cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.dueDate),
      },
      {
        id: 'estimatedAmount',
        header: () => <UnitHeader label={t('vehicleSections.tax.estimate')} />,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => money(row.original.estimatedAmount),
      },
      {
        id: 'urgensi',
        header: t('vehicleSections.tax.urgency'),
        meta: { hideBelow: 'md' },
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
          const open = r.status === 'SUBMITTED' && canEdit;
          return (
            <RowActions
              label={t('vehicleSections.tax.requestActionsFor', { name: `${TAX_TYPE_LABELS[r.type] ?? r.type} ${r.periodYear}` })}
              actions={[
                { label: t('vehicleSections.tax.approve'), icon: Check, hidden: !open || !canApprove, onSelect: () => approveReq.mutate(r.id) },
                { label: t('vehicleSections.tax.reject'), icon: X, tone: 'danger', hidden: !open || !canApprove, onSelect: () => setRejectTarget(r) },
                { label: t('vehicleSections.tax.cancelRequest'), icon: XCircle, tone: 'danger', hidden: !open || canApprove, onSelect: () => cancelReq.mutate(r.id) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, canApprove, t],
  );

  return (
    <div className="space-y-4">
      <Panel
        title={t('vehicleSections.tax.title')}
        description={t('vehicleSections.tax.description')}
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" onClick={() => setModal('new')}>
              <Plus aria-hidden />
              {t('vehicleSections.tax.add')}
            </Button>
          )
        }
      >
        <DataTable
          label={t('vehicleSections.tax.tableLabel')}
          itemLabel={t('vehicleSections.tax.itemLabel')}
          columns={taxColumns}
          data={taxesQuery.data}
          getRowId={(r) => r.id}
          loading={taxesQuery.isLoading}
          error={taxesQuery.error}
          onRetry={() => taxesQuery.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: t('vehicleSections.tax.emptyTitle'), description: t('vehicleSections.tax.emptyDescription') }}
        />
      </Panel>

      <Panel
        title={t('vehicleSections.tax.requestsTitle')}
        description={t('vehicleSections.tax.requestsDescription')}
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" variant="outline" onClick={() => setShowRequest(true)}>
              <ClipboardList aria-hidden />
              {t('vehicleSections.tax.request')}
            </Button>
          )
        }
      >
        <DataTable
          label={t('vehicleSections.tax.requestsTable')}
          itemLabel={t('vehicleSections.tax.requestsItem')}
          columns={requestColumns}
          data={requestsQuery.data}
          getRowId={(r) => r.id}
          loading={requestsQuery.isLoading}
          error={requestsQuery.error}
          onRetry={() => requestsQuery.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: t('vehicleSections.tax.requestsEmpty') }}
        />
      </Panel>

      {modal && (
        <TaxModal
          assetId={assetId}
          editRecord={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            invalidate(['taxes']);
          }}
        />
      )}
      {showRequest && (
        <TaxRequestModal
          assetId={assetId}
          onClose={() => setShowRequest(false)}
          onSaved={() => {
            setShowRequest(false);
            afterRequestChange();
          }}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('vehicleSections.tax.deleteTitle')}
        description={t('vehicleSections.tax.deleteConfirm', { name: deleteTarget ? `${TAX_TYPE_LABELS[deleteTarget.type] ?? deleteTarget.type} ${deleteTarget.periodYear}` : '' })}
        confirmLabel={t('shared.confirmDelete')}
        tone="danger"
        loading={deleteMut.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteMut.mutateAsync(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
      <ConfirmDialog
        open={rejectTarget !== null}
        onOpenChange={(o) => !o && setRejectTarget(null)}
        title={t('vehicleSections.tax.rejectTitle')}
        description={rejectTarget ? `${TAX_TYPE_LABELS[rejectTarget.type] ?? rejectTarget.type} ${rejectTarget.periodYear}` : undefined}
        confirmLabel={t('vehicleSections.tax.reject')}
        tone="danger"
        requireReason={{ label: t('vehicleSections.tax.rejectReason'), minLength: 1 }}
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
