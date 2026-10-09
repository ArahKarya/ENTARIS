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

interface TireOilSectionProps extends VehicleContext {
  odometer: number | null;
}

function TireSlot({ tire, label, canEdit, onEdit }: { tire?: Tire; label: string; canEdit: boolean; onEdit: (t: Tire) => void }) {
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
          <p className="num truncate text-xs text-foreground" title="Nomor seri ban (DOT/pabrik)">
            SN {tire.serialNumber}
          </p>
          {tire.installedOdometer != null && (
            <p className="num text-xs text-muted-foreground">Mulai {formatNumber(tire.installedOdometer)} km</p>
          )}
        </div>
      ) : (
        <span className="my-auto text-xs text-muted-foreground">Kosong</span>
      )}
      {canEdit && tire && (
        <Button variant="link" size="sm" className="h-auto text-xs" onClick={() => onEdit(tire)} aria-label={`Ubah atau lepas ban ${label}`}>
          Ubah / lepas
        </Button>
      )}
    </div>
  );
}

export function TireOilSection({ assetId, canEdit, odometer }: TireOilSectionProps) {
  const invalidate = useInvalidateVehicle(assetId);
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
      toast.success('Data ban dihapus.');
      invalidate(['tires'], { fleet: false });
    },
    onError: (e) => toast.error(apiError(e, 'Gagal hapus data ban.')),
  });
  const deleteOilMut = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${assetId}/oil-logs/${id}`),
    onSuccess: () => {
      toast.success('Log oli dihapus.');
      invalidate(['oil'], { fleet: false });
    },
    onError: (e) => toast.error(apiError(e, 'Gagal hapus log oli.')),
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
        header: 'Posisi',
        cell: ({ row }) => (
          <div>
            <p className="font-medium text-foreground">{TIRE_POSITION_LABELS[row.original.position] ?? row.original.position}</p>
            <p className="num text-xs text-muted-foreground">SN {row.original.serialNumber}</p>
          </div>
        ),
      },
      {
        id: 'brand',
        header: 'Merek',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => [row.original.brand, row.original.model, row.original.size].filter(Boolean).join(' · '),
      },
      {
        id: 'installedAt',
        header: 'Dipasang',
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.installedAt),
      },
      {
        id: 'installedOdometer',
        header: () => <UnitHeader label="Odo pasang" unit="km" />,
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ row }) => (row.original.installedOdometer != null ? formatNumber(row.original.installedOdometer) : '-'),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <StatusBadge
            label={TIRE_STATUS_LABELS[row.original.status] ?? row.original.status}
            tone={row.original.status === 'ACTIVE' ? 'success' : 'neutral'}
          />
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={`Aksi untuk ban ${row.original.serialNumber}`}
            actions={[
              { label: 'Ubah / lepas', icon: Pencil, hidden: !canEdit, onSelect: () => setTireModal(row.original) },
              { label: 'Hapus', icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTire(row.original) },
            ]}
          />
        ),
      },
    ],
    [canEdit],
  );

  const oilColumns = useMemo<ColumnDef<OilLog>[]>(
    () => [
      {
        id: 'tanggal',
        header: 'Tanggal',
        cell: ({ row }) => (
          <div>
            <p className="num whitespace-nowrap text-foreground">{formatDate(row.original.tanggal)}</p>
            <p className="text-xs text-muted-foreground">{row.original.brand}</p>
          </div>
        ),
      },
      {
        id: 'volume',
        header: () => <UnitHeader label="Volume" unit="L" />,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => formatNumber(row.original.volume, { maxDecimals: 2 }),
      },
      {
        id: 'odometer',
        header: () => <UnitHeader label="Odo ganti" unit="km" />,
        meta: { align: 'right' },
        cell: ({ row }) => formatNumber(row.original.odometer),
      },
      {
        id: 'next',
        header: () => <UnitHeader label="Target" unit="km" />,
        meta: { align: 'right' },
        cell: ({ row }) => formatNumber(row.original.nextOdometerDue),
      },
      {
        id: 'notes',
        header: 'Catatan',
        meta: { hideBelow: 'lg', cellClassName: 'max-w-64 truncate text-muted-foreground' },
        cell: ({ row }) => row.original.notes || '-',
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={`Aksi untuk ganti oli ${formatDate(row.original.tanggal)}`}
            actions={[{ label: 'Hapus', icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteOil(row.original) }]}
          />
        ),
      },
    ],
    [canEdit],
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel
          title="Posisi Ban Terpasang"
          description="Nomor seri per posisi mencegah tukar ban tanpa catatan."
          action={
            canEdit && (
              <Button size="sm" onClick={() => setTireModal('new')}>
                <Plus aria-hidden />
                Pasang ban
              </Button>
            )
          }
        >
          <PanelState loading={tiresQuery.isLoading} error={tiresQuery.error} onRetry={() => tiresQuery.refetch()}>
            <div className="mx-auto max-w-sm space-y-3 rounded-lg border border-border bg-muted/30 p-3 sm:p-4">
              <div className="grid grid-cols-2 gap-6 sm:gap-12">
                {slot('DEPAN_KIRI', 'Depan kiri')}
                {slot('DEPAN_KANAN', 'Depan kanan')}
              </div>
              <div className="mx-auto h-6 w-1.5 rounded-full bg-border" aria-hidden />
              <div className="grid grid-cols-2 gap-6 sm:gap-12">
                <div className="space-y-2">
                  {dualLeft ? (
                    <>
                      {slot('BELAKANG_KIRI_LUAR', 'Blk kiri luar')}
                      {slot('BELAKANG_KIRI_DALAM', 'Blk kiri dalam')}
                    </>
                  ) : (
                    slot('BELAKANG_KIRI', 'Belakang kiri')
                  )}
                </div>
                <div className="space-y-2">
                  {dualRight ? (
                    <>
                      {slot('BELAKANG_KANAN_LUAR', 'Blk kanan luar')}
                      {slot('BELAKANG_KANAN_DALAM', 'Blk kanan dalam')}
                    </>
                  ) : (
                    slot('BELAKANG_KANAN', 'Belakang kanan')
                  )}
                </div>
              </div>
              <div className="mx-auto max-w-40 border-t border-border pt-3">{slot('CADANGAN', 'Cadangan')}</div>
            </div>
          </PanelState>
        </Panel>

        <Panel
          title="Umur Oli"
          description="Sisa jarak sampai penggantian berikutnya, dari odometer terakhir."
          action={
            canEdit && (
              <Button size="sm" onClick={() => setShowOil(true)}>
                <Plus aria-hidden />
                Ganti oli
              </Button>
            )
          }
        >
          <PanelState
            loading={oilQuery.isLoading}
            error={oilQuery.error}
            onRetry={() => oilQuery.refetch()}
            empty={!latestOil}
            emptyTitle="Belum ada histori ganti oli"
          >
            {latestOil && life && (
              <div className="space-y-4">
                <dl className="grid grid-cols-2 gap-3">
                  <DetailItem label="Merek oli">{latestOil.brand}</DetailItem>
                  <DetailItem label="Volume">
                    <span className="num">{formatNumber(latestOil.volume, { maxDecimals: 2 })} L</span>
                  </DetailItem>
                  <DetailItem label="Odometer ganti">
                    <span className="num">{formatNumber(latestOil.odometer)} km</span>
                  </DetailItem>
                  <DetailItem label="Target berikutnya">
                    <span className="num font-medium">{formatNumber(latestOil.nextOdometerDue)} km</span>
                  </DetailItem>
                </dl>
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="text-muted-foreground">
                      Odometer terakhir <strong className="num text-foreground">{formatNumber(odometer ?? 0)} km</strong>
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
                        ? `Lewat target ${formatNumber(Math.abs(life.remainingKm))} km`
                        : `Sisa ${formatNumber(life.remainingKm)} km`}
                    </span>
                  </div>
                  <div
                    role="progressbar"
                    aria-label="Sisa umur oli"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(life.pct)}
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
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

      <Panel title="Histori Ban" bodyClassName="p-0">
        <DataTable
          label="Histori ban"
          itemLabel="ban"
          columns={tireColumns}
          data={tiresQuery.data}
          getRowId={(r) => r.id}
          loading={tiresQuery.isLoading}
          error={tiresQuery.error}
          onRetry={() => tiresQuery.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: 'Belum ada data ban' }}
        />
      </Panel>

      <Panel title="Riwayat Ganti Oli" bodyClassName="p-0">
        <DataTable
          label="Riwayat ganti oli"
          itemLabel="penggantian"
          columns={oilColumns}
          data={oilQuery.data}
          getRowId={(r) => r.id}
          loading={oilQuery.isLoading}
          error={oilQuery.error}
          onRetry={() => oilQuery.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: 'Belum ada riwayat ganti oli' }}
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
        title="Hapus Data Ban"
        description={`Hapus data ban "${deleteTire ? `${TIRE_POSITION_LABELS[deleteTire.position] ?? deleteTire.position} (SN: ${deleteTire.serialNumber})` : ''}"?`}
        confirmLabel="Ya, Hapus"
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
        title="Hapus Log Oli"
        description={`Hapus log ganti oli "${deleteOil ? `${formatDate(deleteOil.tanggal)} · Odo ${formatNumber(deleteOil.odometer)}` : ''}"?`}
        confirmLabel="Ya, Hapus"
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
