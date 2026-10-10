/** Asuransi: insurance policies with expiry state. */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { FileCheck2, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatRupiah, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, DataTable, RowActions, StatusBadge } from '@/components/shared';
import { Panel } from '@/components/inventory/dashboard-kit';
import { INSURANCE_TYPE_LABELS } from '../constants';
import { viewDocument } from '../documents-api';
import { InsuranceModal } from '../modals/TaxInsuranceModals';
import type { InsuranceRecord, VehicleContext } from '../types';
import { FLUSH_TABLE } from '../ui-classes';
import { useInvalidateVehicle, vehicleKeys } from '../vehicle-queries';
import { apiError, dueStateOf } from '../vehicle-model';
import { DueDateCell, UnitHeader } from '../vehicle-ui';
import { useTranslation } from 'react-i18next';

const money = (v: string | number | null | undefined) => (v == null ? '—' : formatRupiah(toNumber(v) ?? 0, { symbol: false }));

export function InsuranceSection({ assetId, canEdit }: VehicleContext) {
  const invalidate = useInvalidateVehicle(assetId);
  const { t } = useTranslation('eam');
  const [modal, setModal] = useState<InsuranceRecord | 'new' | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InsuranceRecord | null>(null);

  const query = useQuery<InsuranceRecord[]>({
    queryKey: vehicleKeys.insurances(assetId),
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}/insurances`)).data,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${assetId}/insurances/${id}`),
    onSuccess: () => {
      toast.success(t('vehicleSections.insurance.deleted'));
      invalidate(['insurances']);
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.insurance.deleteFailed'))),
  });

  const columns = useMemo<ColumnDef<InsuranceRecord>[]>(
    () => [
      {
        id: 'provider',
        header: t('vehicleSections.insurance.policy'),
        meta: { cellClassName: 'min-w-40' },
        cell: ({ row }) => {
          const i = row.original;
          return (
            <div className="min-w-0">
              <p className="font-medium text-foreground">{i.provider}</p>
              <p className="text-xs text-muted-foreground">
                {INSURANCE_TYPE_LABELS[i.type] ?? i.type}
                {i.policyNumber ? <span className="num"> · {i.policyNumber}</span> : null}
              </p>
            </div>
          );
        },
      },
      {
        id: 'period',
        header: t('vehicleSections.insurance.period'),
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <span className="num whitespace-nowrap text-xs text-muted-foreground">{t('vehicleSections.insurance.starts', { date: formatDate(row.original.startDate) })}</span>
            <DueDateCell date={row.original.endDate} state={dueStateOf(row.original.endDate, row.original.status === 'ACTIVE')} />
          </div>
        ),
      },
      {
        id: 'premium',
        header: () => <UnitHeader label={t('vehicleSections.insurance.premium')} />,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => money(row.original.premium),
      },
      {
        id: 'coverage',
        header: () => <UnitHeader label={t('vehicleSections.insurance.coverage')} />,
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ row }) => money(row.original.coverageValue),
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
          const i = row.original;
          return (
            <RowActions
              label={t('vehicleSections.insurance.actionsFor', { name: i.provider })}
              actions={[
                { label: t('vehicleSections.insurance.viewDocument'), icon: FileCheck2, hidden: !i.document, onSelect: () => i.document && viewDocument(i.document.id) },
                { label: t('shared.edit'), icon: Pencil, hidden: !canEdit, onSelect: () => setModal(i) },
                { label: t('shared.delete'), icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(i) },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, t],
  );

  return (
    <>
      <Panel
        title={t('vehicleSections.insurance.title')}
        description={t('vehicleSections.insurance.description')}
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" onClick={() => setModal('new')}>
              <Plus aria-hidden />
              {t('vehicleSections.insurance.add')}
            </Button>
          )
        }
      >
        <DataTable
          label={t('vehicleSections.insurance.tableLabel')}
          itemLabel={t('vehicleSections.insurance.itemLabel')}
          columns={columns}
          data={query.data}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: t('vehicleSections.insurance.emptyTitle'), description: t('vehicleSections.insurance.emptyDescription') }}
        />
      </Panel>
      {modal && (
        <InsuranceModal
          assetId={assetId}
          editRecord={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            invalidate(['insurances']);
          }}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('vehicleSections.insurance.deleteTitle')}
        description={t('vehicleSections.insurance.deleteConfirm', { name: deleteTarget ? `${deleteTarget.provider} · ${deleteTarget.policyNumber ?? ''}` : '' })}
        confirmLabel={t('shared.confirmDelete')}
        tone="danger"
        loading={deleteMut.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteMut.mutateAsync(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </>
  );
}
