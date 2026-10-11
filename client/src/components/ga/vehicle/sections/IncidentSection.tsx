/** Insiden: accident / incident reports; rows open the edit form. */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatRupiah, toNumber } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { DataTable, RowActions, StatusBadge } from '@/components/shared';
import { Panel } from '@/components/inventory/dashboard-kit';
import { INCIDENT_SEVERITY_META } from '../constants';
import { IncidentModal } from '../modals/LogModals';
import type { Incident, VehicleContext } from '../types';
import { FLUSH_TABLE } from '../ui-classes';
import { useInvalidateVehicle, vehicleKeys } from '../vehicle-queries';
import { ToneBadge, UnitHeader } from '../vehicle-ui';
import { useTranslation } from 'react-i18next';

export function IncidentSection({ assetId, canEdit }: VehicleContext) {
  const invalidate = useInvalidateVehicle(assetId);
  const { t } = useTranslation('eam');
  const [modal, setModal] = useState<{ id?: string } | null>(null);

  const query = useQuery<Incident[]>({
    queryKey: vehicleKeys.incidents(assetId),
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}/incidents`)).data,
  });

  const columns = useMemo<ColumnDef<Incident>[]>(
    () => [
      {
        id: 'tanggal',
        header: t('shared.date'),
        meta: { cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.tanggal),
      },
      {
        id: 'description',
        header: t('vehicleSections.incidents.event'),
        meta: { cellClassName: 'min-w-48 max-w-96' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="text-foreground">{row.original.description}</p>
            <p className="text-xs text-muted-foreground">
              {[row.original.location, row.original.driverName].filter(Boolean).join(' · ') || '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'severity',
        header: t('vehicleSections.incidents.severity'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => {
          const m = INCIDENT_SEVERITY_META[row.original.severity];
          return m ? <ToneBadge label={m.label} tone={m.tone} /> : row.original.severity;
        },
      },
      {
        id: 'status',
        header: t('shared.status'),
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'cost',
        header: () => <UnitHeader label={t('vehicleSections.incidents.cost')} />,
        meta: { align: 'right', hideBelow: 'md' },
        cell: ({ row }) => {
          const i = row.original;
          const actual = toNumber(i.actualCost);
          if (actual !== null) return formatRupiah(actual, { symbol: false });
          const est = toNumber(i.estimatedCost);
          return est !== null ? (
            <span className="text-muted-foreground" title={t('vehicleSections.incidents.estimate')}>
              ±{formatRupiah(est, { symbol: false })}
            </span>
          ) : (
            '—'
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={t('vehicleSections.incidents.actionsFor', { date: formatDate(row.original.tanggal) })}
            actions={[{ label: t('vehicleSections.incidents.viewEdit'), icon: Eye, hidden: !canEdit, onSelect: () => setModal({ id: row.original.id }) }]}
          />
        ),
      },
    ],
    [canEdit, t],
  );

  return (
    <>
      <Panel
        title={t('vehicleSections.incidents.title')}
        description={t('vehicleSections.incidents.description')}
        bodyClassName="p-0"
        action={
          canEdit && (
            <Button size="sm" onClick={() => setModal({})}>
              <Plus aria-hidden />
              {t('vehicleSections.incidents.report')}
            </Button>
          )
        }
      >
        <DataTable
          label={t('vehicleSections.incidents.tableLabel')}
          itemLabel={t('vehicleSections.incidents.itemLabel')}
          columns={columns}
          data={query.data}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          onRowClick={canEdit ? (r) => setModal({ id: r.id }) : undefined}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{ title: t('vehicleSections.incidents.empty') }}
        />
      </Panel>
      {modal && (
        <IncidentModal
          assetId={assetId}
          incidentId={modal.id}
          onClose={() => setModal(null)}
          onSaved={() => {
            setModal(null);
            invalidate(['incidents']);
          }}
        />
      )}
    </>
  );
}
