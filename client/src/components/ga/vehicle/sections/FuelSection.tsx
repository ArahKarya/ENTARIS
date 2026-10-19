/** BBM: fuel log with totals and average consumption. */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, DataTable, RowActions } from '@/components/shared';
import { Panel } from '@/components/inventory/dashboard-kit';
import { FuelModal } from '../modals/LogModals';
import type { FuelLog, VehicleContext } from '../types';
import { FLUSH_TABLE } from '../ui-classes';
import { useInvalidateVehicle, vehicleKeys } from '../vehicle-queries';
import { apiError } from '../vehicle-model';
import { UnitHeader } from '../vehicle-ui';
import { useTranslation } from 'react-i18next';

export function FuelSection({ assetId, canEdit }: VehicleContext) {
  const invalidate = useInvalidateVehicle(assetId);
  const { t } = useTranslation('eam');
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FuelLog | null>(null);

  const query = useQuery<FuelLog[]>({
    queryKey: vehicleKeys.fuel(assetId),
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}/fuel-logs`)).data,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${assetId}/fuel-logs/${id}`),
    onSuccess: () => {
      toast.success(t('vehicleSections.fuel.deleted'));
      invalidate(['fuel']);
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.fuel.deleteFailed'))),
  });

  const totals = useMemo(() => {
    const rows = query.data ?? [];
    return rows.reduce(
      (acc, f) => ({ liters: acc.liters + (toNumber(f.liters) ?? 0), cost: acc.cost + (toNumber(f.totalCost) ?? 0) }),
      { liters: 0, cost: 0 },
    );
  }, [query.data]);

  const columns = useMemo<ColumnDef<FuelLog>[]>(
    () => [
      {
        id: 'tanggal',
        header: t('shared.date'),
        cell: ({ row }) => (
          <div>
            <p className="num whitespace-nowrap text-foreground">{formatDate(row.original.tanggal)}</p>
            <p className="text-xs text-muted-foreground">
              {[row.original.spbu, row.original.driverName].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'odometer',
        header: () => <UnitHeader label={t('vehicleSections.fuel.odometer')} unit="km" />,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => (row.original.odometer != null ? formatNumber(row.original.odometer) : '—'),
      },
      {
        id: 'liters',
        header: () => <UnitHeader label={t('vehicleSections.fuel.volume')} unit="L" />,
        meta: { align: 'right' },
        cell: ({ row }) => formatNumber(row.original.liters, { maxDecimals: 2 }),
      },
      {
        id: 'price',
        header: () => <UnitHeader label={t('vehicleSections.fuel.pricePerLiter')} />,
        meta: { align: 'right', hideBelow: 'md' },
        cell: ({ row }) => (row.original.pricePerLiter != null ? formatRupiah(row.original.pricePerLiter, { symbol: false }) : '—'),
      },
      {
        id: 'totalCost',
        header: () => <UnitHeader label={t('vehicleSections.fuel.total')} />,
        meta: { align: 'right' },
        cell: ({ row }) => formatRupiah(row.original.totalCost, { symbol: false }),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={t('vehicleSections.fuel.actionsFor', { date: formatDate(row.original.tanggal) })}
            actions={[{ label: t('shared.delete'), icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(row.original) }]}
          />
        ),
      },
    ],
    [canEdit, t],
  );

  const count = query.data?.length ?? 0;

  return (
    <>
      <Panel
        title={t('vehicleSections.fuel.title')}
        description={
          count > 0
            ? t('vehicleSections.fuel.summary', { count, n: formatNumber(count), liters: formatNumber(totals.liters, { maxDecimals: 1 }), cost: formatRupiah(totals.cost) })
            : t('vehicleSections.fuel.descriptionEmpty')
        }
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus aria-hidden />
              {t('vehicleSections.fuel.add')}
            </Button>
          )
        }
      >
        <DataTable
          label={t('vehicleSections.fuel.tableLabel')}
          itemLabel={t('vehicleSections.fuel.itemLabel')}
          columns={columns}
          data={query.data}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: t('vehicleSections.fuel.empty') }}
        />
      </Panel>
      {showModal && (
        <FuelModal
          assetId={assetId}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            invalidate(['fuel', 'vehicle']);
          }}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title={t('vehicleSections.fuel.deleteTitle')}
        description={t('vehicleSections.fuel.deleteConfirm', { name: deleteTarget ? `${formatDate(deleteTarget.tanggal)} · ${formatNumber(deleteTarget.liters, { maxDecimals: 2 })} L` : '' })}
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
