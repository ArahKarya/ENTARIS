/** Dokumen: GA documents linked to this vehicle (STNK/KIR/polis scans etc.), read via /ga/documents. */
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, FolderOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { Button } from '@/components/ui/button';
import { DataTable, EmptyState, RowActions, StatusBadge } from '@/components/shared';
import { Panel } from '@/components/inventory/dashboard-kit';
import { viewDocument } from '../documents-api';
import type { VehicleContext } from '../types';
import { FLUSH_TABLE } from '../ui-classes';
import { vehicleKeys } from '../vehicle-queries';
import { dueStateOf } from '../vehicle-model';
import { DueDateCell } from '../vehicle-ui';
import { useTranslation } from 'react-i18next';

interface GaDocumentRow {
  id: string;
  code: string;
  title: string;
  status: string;
  issuedNumber?: string | null;
  expiryDate?: string | null;
  type?: { name: string } | null;
  versions?: Array<{ id: string; versionNo: number }>;
}

export function DocumentsSection({ assetId }: VehicleContext) {
  const allowed = can('ga_documents', 'view');
  const { t } = useTranslation('eam');
  const query = useQuery<GaDocumentRow[]>({
    queryKey: vehicleKeys.documents(assetId),
    queryFn: async () => (await api.get('/ga/documents', { params: { assetId } })).data,
    enabled: allowed,
  });

  const columns = useMemo<ColumnDef<GaDocumentRow>[]>(
    () => [
      {
        id: 'title',
        header: t('vehicleSections.documents.document'),
        meta: { cellClassName: 'min-w-48' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium text-foreground">{row.original.title}</p>
            <p className="text-xs text-muted-foreground">
              {row.original.type?.name ?? '—'}
              <span className="num"> · {row.original.issuedNumber || row.original.code}</span>
            </p>
          </div>
        ),
      },
      {
        id: 'expiry',
        header: t('vehicleSections.documents.validUntil'),
        cell: ({ row }) => (
          <DueDateCell date={row.original.expiryDate} state={dueStateOf(row.original.expiryDate, row.original.status === 'ACTIVE')} />
        ),
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
          const latest = row.original.versions?.[0];
          return (
            <RowActions
              label={t('shared.actionsFor', { name: row.original.title })}
              actions={[
                { label: latest ? t('vehicleSections.documents.openVersion', { version: latest.versionNo }) : t('vehicleSections.documents.noFile'), icon: Download, disabled: !latest, onSelect: () => viewDocument(row.original.id, latest?.id) },
              ]}
            />
          );
        },
      },
    ],
    [t],
  );

  return (
    <Panel
      title={t('vehicleSections.documents.title')}
      description={t('vehicleSections.documents.description')}
      bodyClassName="p-0"
      action={
        allowed && (
          <Button size="sm" variant="outline" asChild>
            <Link to="/ga/documents">
              <FolderOpen aria-hidden />
              {t('vehicleSections.documents.manage')}
            </Link>
          </Button>
        )
      }
    >
      {allowed ? (
        <DataTable
          label={t('vehicleSections.documents.tableLabel')}
          itemLabel={t('vehicleSections.documents.itemLabel')}
          columns={columns}
          data={query.data}
          getRowId={(r) => r.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          stickyHeader={false}
          className={FLUSH_TABLE}
          empty={{
            title: t('vehicleSections.documents.emptyTitle'),
            description: t('vehicleSections.documents.emptyDescription'),
          }}
        />
      ) : (
        <EmptyState compact title={t('shared.noAccess')} description={t('vehicleSections.documents.noAccess')} />
      )}
    </Panel>
  );
}
