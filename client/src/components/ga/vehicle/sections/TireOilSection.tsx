/** Ban & Oli: active tire positions (anti tire-swap), tire history, oil life and oil change history. */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Clock, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, DataTable, RowActions, StatusBadge } from '@/components/shared';
import { Panel, PanelState } from '@/components/inventory/dashboard-kit';
import { TIRE_POSITION_LABELS, TIRE_STATUS_LABELS } from '../constants';
import { OilModal, TireModal } from '../modals/LogModals';
import type { OilLog, Tire, VehicleContext } from '../types';
import { FLUSH_TABLE } from '../ui-classes';
import { useInvalidateVehicle, vehicleKeys } from '../vehicle-queries';
import { apiError, oilLife } from '../vehicle-model';
import { DetailItem, UnitHeader } from '../vehicle-ui';
import { useTranslation } from 'react-i18next';

interface TireOilSectionProps extends VehicleContext {
  odometer: number | null;
}

function TireSlot({ tire, label, canEdit, onEdit }: { tire?: Tire; label: string; canEdit: boolean; onEdit: (t: Tire) => void }) {
  const { t } = useTranslation('eam');
  return (
    <div
      className={cn(
        'flex min-h-28 min-w-0 flex-col items-center justify-between gap-1 rounded-md border p-2.5 text-center',
        tire ? 'border-border-strong bg-card' : 'border-dashed border-border bg-muted/40',
      )}
    >
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
      {tire ? (
        <div className="w-full min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{tire.brand}</p>
          <p className="num truncate text-xs text-foreground" title={t('vehicleSections.tireOil.serialTitle')}>
            {t('vehicleSections.tireOil.sn', { serial: tire.serialNumber })}
          </p>
          {tire.installedOdometer != null && (
            <p className="num text-xs text-muted-foreground">{t('vehicleSections.tireOil.fromKm', { km: formatNumber(tire.installedOdometer) })}</p>
          )}
        </div>
      ) : (
        <span className="my-auto text-xs text-muted-foreground">{t('vehicleSections.tireOil.empty')}</span>
      )}
      {canEdit && tire && (
        <Button variant="link" size="sm" className="h-auto text-xs" onClick={() => onEdit(tire)} aria-label={t('vehicleSections.tireOil.editSlot', { name: label })}>
          {t('vehicleSections.tireOil.editRemove')}
        </Button>
      )}
    </div>
  );
}

export function TireOilSection({ assetId, canEdit, odometer }: TireOilSectionProps) {
  const invalidate = useInvalidateVehicle(assetId);
  const { t } = useTranslation('eam');
  const [tireModal, setTireModal] = useState<Tire | 'new' | null>(null);
  const [showOil, setShowOil] = useState(false);
  const [deleteTire, setDeleteTire] = useState<Tire | null>(null);
  const [deleteOil, setDeleteOil] = useState<OilLog | null>(null);

  const tiresQuery = useQuery<Tire[]>({
    queryKey: vehicleKeys.tires(assetId),
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}/tires`)).data,
  });
  const oilQuery = useQuery<OilLog[]>({
    queryKey: vehicleKeys.oil(assetId),
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}/oil-logs`)).data,
  });

  const deleteTireMut = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${assetId}/tires/${id}`),
    onSuccess: () => {
      toast.success(t('vehicleSections.tireOil.tireDeleted'));
      invalidate(['tires'], { fleet: false });
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.tireOil.tireDeleteFailed'))),
  });
  const deleteOilMut = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${assetId}/oil-logs/${id}`),
    onSuccess: () => {
      toast.success(t('vehicleSections.tireOil.oilDeleted'));
      invalidate(['oil'], { fleet: false });
    },
    onError: (e) => toast.error(apiError(e, t('vehicleSections.tireOil.oilDeleteFailed'))),
  });

  const tires = useMemo(() => tiresQuery.data ?? [], [tiresQuery.data]);
  const active = useMemo(() => new Map(tires.filter((t) => t.status === 'ACTIVE').map((t) => [t.position, t])), [tires]);
  const slot = (pos: string, label: string) => (
    <TireSlot tire={active.get(pos)} label={label} canEdit={canEdit} onEdit={(t) => setTireModal(t)} />
  );
  const dualLeft = active.has('BELAKANG_KIRI_LUAR') || active.has('BELAKANG_KIRI_DALAM');
  const dualRight = active.has('BELAKANG_KANAN_LUAR') || active.has('BELAKANG_KANAN_DALAM');

  const latestOil = oilQuery.data?.[0] ?? null;
  const life = latestOil ? oilLife(latestOil.odometer, latestOil.nextOdometerDue, odometer ?? 0) : null;
  const lifeState = life ? (life.overdue ? 'overdue' : life.pct < 20 ? 'soon' : 'ok') : null;

  const tireColumns = useMemo<ColumnDef<Tire>[]>(
    () => [
      {
        id: 'position',
        header: t('vehicleSections.tireOil.position'),
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{TIRE_POSITION_LABELS[row.original.position] ?? row.original.position}</p>
            <p className="num text-xs text-muted-foreground">{t('vehicleSections.tireOil.sn', { serial: row.original.serialNumber })}</p>
          </div>
        ),
      },
      {
        id: 'brand',
        header: t('vehicleSections.tireOil.brand'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => [row.original.brand, row.original.model, row.original.size].filter(Boolean).join(' · '),
      },
      {
        id: 'installedAt',
        header: t('vehicleSections.tireOil.installed'),
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.installedAt),
      },
      {
        id: 'installedOdometer',
        header: () => <UnitHeader label={t('vehicleSections.tireOil.odoInstalled')} unit="km" />,
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ row }) => (row.original.installedOdometer != null ? formatNumber(row.original.installedOdometer) : '—'),
      },
      {
        id: 'status',
        header: t('shared.status'),
        cell: ({ row }) => (
          <StatusBadge
            label={TIRE_STATUS_LABELS[row.original.status] ?? row.original.status}
            tone={row.original.status === 'ACTIVE' ? 'success' : 'neutral'}
          />
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={t('vehicleSections.tireOil.tireActionsFor', { name: row.original.serialNumber })}
            actions={[
              { label: t('vehicleSections.tireOil.editRemove'), icon: Pencil, hidden: !canEdit, onSelect: () => setTireModal(row.original) },
              { label: t('shared.delete'), icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTire(row.original) },
            ]}
          />
        ),
      },
    ],
    [canEdit, t],
  );

  const oilColumns = useMemo<ColumnDef<OilLog>[]>(
    () => [
      {
        id: 'tanggal',
        header: t('shared.date'),
        cell: ({ row }) => (
          <div>
            <p className="num whitespace-nowrap text-foreground">{formatDate(row.original.tanggal)}</p>
            <p className="text-xs text-muted-foreground">{row.original.brand}</p>
          </div>
        ),
      },
      {
        id: 'volume',
        header: () => <UnitHeader label={t('vehicleSections.tireOil.volume')} unit="L" />,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => formatNumber(row.original.volume, { maxDecimals: 2 }),
      },
      {
        id: 'odometer',
        header: () => <UnitHeader label={t('vehicleSections.tireOil.odoChanged')} unit="km" />,
        meta: { align: 'right' },
        cell: ({ row }) => formatNumber(row.original.odometer),
      },
      {
        id: 'next',
        header: () => <UnitHeader label={t('vehicleSections.tireOil.target')} unit="km" />,
        meta: { align: 'right' },
        cell: ({ row }) => formatNumber(row.original.nextOdometerDue),
      },
      {
        id: 'notes',
        header: t('shared.notes'),
        meta: { hideBelow: 'lg', cellClassName: 'max-w-64 truncate text-muted-foreground' },
        cell: ({ row }) => row.original.notes || '—',
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={t('vehicleSections.tireOil.oilActionsFor', { date: formatDate(row.original.tanggal) })}
            actions={[{ label: t('shared.delete'), icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteOil(row.original) }]}
          />
        ),
      },
    ],
    [canEdit, t],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title={t('vehicleSections.tireOil.mountedTitle')}
          description={t('vehicleSections.tireOil.mountedDescription')}
          action={
            canEdit && (
              <Button size="sm" onClick={() => setTireModal('new')}>
                <Plus aria-hidden />
                {t('vehicleSections.tireOil.mount')}
              </Button>
            )
          }
        >
          <PanelState loading={tiresQuery.isLoading} error={tiresQuery.error} onRetry={() => tiresQuery.refetch()}>
            <div className="mx-auto max-w-sm space-y-3 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-6 sm:gap-12">
                {slot('DEPAN_KIRI', t('vehicleSections.tireOil.slot.frontLeft'))}
                {slot('DEPAN_KANAN', t('vehicleSections.tireOil.slot.frontRight'))}
              </div>
              <div className="mx-auto h-6 w-1.5 rounded-full bg-border" aria-hidden />
              <div className="grid grid-cols-2 gap-6 sm:gap-12">
                <div className="space-y-2">
                  {dualLeft ? (
                    <>
                      {slot('BELAKANG_KIRI_LUAR', t('vehicleSections.tireOil.slot.rearLeftOuter'))}
                      {slot('BELAKANG_KIRI_DALAM', t('vehicleSections.tireOil.slot.rearLeftInner'))}
                    </>
                  ) : (
                    slot('BELAKANG_KIRI', t('vehicleSections.tireOil.slot.rearLeft'))
                  )}
                </div>
                <div className="space-y-2">
                  {dualRight ? (
                    <>
                      {slot('BELAKANG_KANAN_LUAR', t('vehicleSections.tireOil.slot.rearRightOuter'))}
                      {slot('BELAKANG_KANAN_DALAM', t('vehicleSections.tireOil.slot.rearRightInner'))}
                    </>
                  ) : (
                    slot('BELAKANG_KANAN', t('vehicleSections.tireOil.slot.rearRight'))
                  )}
                </div>
              </div>
              <div className="mx-auto max-w-40 border-t border-border pt-3">{slot('CADANGAN', t('vehicleSections.tireOil.slot.spare'))}</div>
            </div>
          </PanelState>
        </Panel>

        <Panel
          title={t('vehicleSections.tireOil.oilLifeTitle')}
          description={t('vehicleSections.tireOil.oilLifeDescription')}
          action={
            canEdit && (
              <Button size="sm" onClick={() => setShowOil(true)}>
                <Plus aria-hidden />
                {t('vehicleSections.tireOil.changeOil')}
              </Button>
            )
          }
        >
          <PanelState
            loading={oilQuery.isLoading}
            error={oilQuery.error}
            onRetry={() => oilQuery.refetch()}
            empty={!latestOil}
            emptyTitle={t('vehicleSections.tireOil.oilEmpty')}
          >
            {latestOil && life && (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-3">
                  <DetailItem label={t('vehicleSections.tireOil.oilBrand')}>{latestOil.brand}</DetailItem>
                  <DetailItem label={t('vehicleSections.tireOil.volume')}>
                    <span className="num">{formatNumber(latestOil.volume, { maxDecimals: 2 })} L</span>
                  </DetailItem>
                  <DetailItem label={t('vehicleSections.tireOil.odometerChanged')}>
                    <span className="num">{formatNumber(latestOil.odometer)} km</span>
                  </DetailItem>
                  <DetailItem label={t('vehicleSections.tireOil.nextTarget')}>
                    <span className="num font-medium">{formatNumber(latestOil.nextOdometerDue)} km</span>
                  </DetailItem>
                </dl>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      {t('vehicleSections.tireOil.lastOdometer')} <strong className="num text-foreground">{formatNumber(odometer ?? 0)} km</strong>
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 font-medium',
                        lifeState === 'overdue' ? 'text-danger-text' : lifeState === 'soon' ? 'text-warning-text' : 'text-success-text',
                      )}
                    >
                      {lifeState === 'overdue' ? (
                        <AlertTriangle className="size-3.5" aria-hidden />
                      ) : lifeState === 'soon' ? (
                        <Clock className="size-3.5" aria-hidden />
                      ) : (
                        <CheckCircle2 className="size-3.5" aria-hidden />
                      )}
                      {life.overdue
                        ? t('vehicleSections.tireOil.pastTarget', { km: formatNumber(Math.abs(life.remainingKm)) })
                        : t('vehicleSections.tireOil.remaining', { km: formatNumber(life.remainingKm) })}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label={t('vehicleSections.tireOil.oilLifeBar')}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(life.pct)}
                    className="h-2 w-full overflow-hidden rounded-sm bg-muted"
                  >
                    <div
                      className={cn('h-full', lifeState === 'overdue' ? 'bg-danger' : lifeState === 'soon' ? 'bg-warning' : 'bg-success')}
                      style={{ width: `${life.pct}%` }}
                    />
                  </div>
                </div>
              </div>
            )}
          </PanelState>
        </Panel>
      </div>

      <Panel title={t('vehicleSections.tireOil.tireHistory')} bodyClassName="p-0">
        <DataTable
          label={t('vehicleSections.tireOil.tireHistory')}
          itemLabel={t('vehicleSections.tireOil.tireItem')}
          columns={tireColumns}
          data={tiresQuery.data}
          getRowId={(r) => r.id}
          loading={tiresQuery.isLoading}
          error={tiresQuery.error}
          onRetry={() => tiresQuery.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: t('vehicleSections.tireOil.tireEmpty') }}
        />
      </Panel>

      <Panel title={t('vehicleSections.tireOil.oilHistory')} bodyClassName="p-0">
        <DataTable
          label={t('vehicleSections.tireOil.oilHistory')}
          itemLabel={t('vehicleSections.tireOil.oilItem')}
          columns={oilColumns}
          data={oilQuery.data}
          getRowId={(r) => r.id}
          loading={oilQuery.isLoading}
          error={oilQuery.error}
          onRetry={() => oilQuery.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: t('vehicleSections.tireOil.oilHistoryEmpty') }}
        />
      </Panel>

      {tireModal && (
        <TireModal
          assetId={assetId}
          editRecord={tireModal === 'new' ? null : tireModal}
          onClose={() => setTireModal(null)}
          onSaved={() => {
            setTireModal(null);
            invalidate(['tires'], { fleet: false });
          }}
        />
      )}
      {showOil && (
        <OilModal
          assetId={assetId}
          onClose={() => setShowOil(false)}
          onSaved={() => {
            setShowOil(false);
            invalidate(['oil', 'vehicle']);
          }}
        />
      )}
      <ConfirmDialog
        open={deleteTire !== null}
        onOpenChange={(o) => !o && setDeleteTire(null)}
        title={t('vehicleSections.tireOil.deleteTireTitle')}
        description={t('vehicleSections.tireOil.deleteTireConfirm', { name: deleteTire ? `${TIRE_POSITION_LABELS[deleteTire.position] ?? deleteTire.position} (SN: ${deleteTire.serialNumber})` : '' })}
        confirmLabel={t('shared.confirmDelete')}
        tone="danger"
        loading={deleteTireMut.isPending}
        onConfirm={async () => {
          if (!deleteTire) return;
          await deleteTireMut.mutateAsync(deleteTire.id);
          setDeleteTire(null);
        }}
      />
      <ConfirmDialog
        open={deleteOil !== null}
        onOpenChange={(o) => !o && setDeleteOil(null)}
        title={t('vehicleSections.tireOil.deleteOilTitle')}
        description={t('vehicleSections.tireOil.deleteOilConfirm', { name: deleteOil ? `${formatDate(deleteOil.tanggal)} · Odo ${formatNumber(deleteOil.odometer)}` : '' })}
        confirmLabel={t('shared.confirmDelete')}
        tone="danger"
        loading={deleteOilMut.isPending}
        onConfirm={async () => {
          if (!deleteOil) return;
          await deleteOilMut.mutateAsync(deleteOil.id);
          setDeleteOil(null);
        }}
      />
    </div>
  );
}
