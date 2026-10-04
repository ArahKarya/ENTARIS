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

export function FuelSection({ assetId, canEdit }: VehicleContext) {
  const invalidate = useInvalidateVehicle(assetId);
  const [showModal, setShowModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<FuelLog | null>(null);

  const query = useQuery<FuelLog[]>({
    queryKey: vehicleKeys.fuel(assetId),
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}/fuel-logs`)).data,
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/ga/vehicle/assets/${assetId}/fuel-logs/${id}`),
    onSuccess: () => {
      toast.success('Log BBM dihapus.');
      invalidate(['fuel']);
    },
    onError: (e) => toast.error(apiError(e, 'Gagal hapus log BBM.')),
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
        header: 'Tanggal',
        cell: ({ row }) => (
          <div>
            <p className="num whitespace-nowrap text-foreground">{formatDate(row.original.tanggal)}</p>
            <p className="text-xs text-muted-foreground">
              {[row.original.spbu, row.original.driverName].filter(Boolean).join(' · ') || '-'}
            </p>
          </div>
        ),
      },
      {
        id: 'odometer',
        header: () => <UnitHeader label="Odometer" unit="km" />,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => (row.original.odometer != null ? formatNumber(row.original.odometer) : '-'),
      },
      {
        id: 'liters',
        header: () => <UnitHeader label="Volume" unit="L" />,
        meta: { align: 'right' },
        cell: ({ row }) => formatNumber(row.original.liters, { maxDecimals: 2 }),
      },
      {
        id: 'price',
        header: () => <UnitHeader label="Harga/L" />,
        meta: { align: 'right', hideBelow: 'md' },
        cell: ({ row }) => (row.original.pricePerLiter != null ? formatRupiah(row.original.pricePerLiter, { symbol: false }) : '-'),
      },
      {
        id: 'totalCost',
        header: () => <UnitHeader label="Total" />,
        meta: { align: 'right' },
        cell: ({ row }) => formatRupiah(row.original.totalCost, { symbol: false }),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={`Aksi untuk log BBM ${formatDate(row.original.tanggal)}`}
            actions={[{ label: 'Hapus', icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(row.original) }]}
          />
        ),
      },
    ],
    [canEdit],
  );

  const count = query.data?.length ?? 0;

  return (
    <>
      <Panel
        title="Log Pengisian BBM"
        description={
          count > 0
            ? `${formatNumber(count)} pengisian · ${formatNumber(totals.liters, { maxDecimals: 1 })} L · ${formatRupiah(totals.cost)}`
            : 'Catat setiap pengisian untuk memantau konsumsi dan biaya BBM.'
        }
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" onClick={() => setShowModal(true)}>
              <Plus aria-hidden />
              Isi BBM
            </Button>
          )
        }
      >
        <DataTable
          label="Log pengisian BBM"
          itemLabel="pengisian"
          columns={columns}
          data={query.data}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: 'Belum ada log BBM' }}
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
        title="Hapus Log BBM"
        description={`Hapus log BBM "${deleteTarget ? `${formatDate(deleteTarget.tanggal)} — ${formatNumber(deleteTarget.liters, { maxDecimals: 2 })} L` : ''}"?`}
        confirmLabel="Ya, Hapus"
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
