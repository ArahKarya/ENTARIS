/**
 * Fleet list (Kendaraan): KPI cards from GET /ga/vehicle/fleet-summary and a
 * server-paginated table from GET /ga/vehicle/fleet with search, asset
 * status, due-state and document filters (all in the URL via useListState).
 * Rows open the vehicle detail view (?vehicle=<id>).
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  AlertTriangle,
  BarChart3,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Eye,
  FileWarning,
  Fuel,
  ShieldCheck,
  TriangleAlert,
  Wallet,
  Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ComboboxFilter,
  DataTable,
  DocumentLink,
  FilterBar,
  PageHeader,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import { ASSET_STATUSES, type VehicleSection } from './constants';
import { FuelModal, IncidentModal } from './modals/LogModals';
import { ServiceLogModal } from './modals/ServiceModals';
import { vehicleKeys } from './vehicle-queries';
import {
  FLEET_DOCS,
  FLEET_DOC_LABELS,
  attentionItems,
  vehicleTitle,
  type FleetRow,
  type FleetSummary,
} from './vehicle-model';
import { DueMarker, UnitHeader } from './vehicle-ui';

const FILTER_KEYS = ['status', 'due', 'doc'] as const;
const DUE_FILTER_VALUES = ['attention', 'overdue', 'dueSoon'] as const;
const FILTER_CLASS = 'w-[calc(50%-0.25rem)] sm:w-48';

type QuickModal = { kind: 'service' | 'fuel' | 'incident'; row: FleetRow } | null;

interface FleetListViewProps {
  canEdit: boolean;
  onOpen: (id: string, section?: VehicleSection) => void;
}

function ComplianceCell({ row }: { row: FleetRow }) {
  const { t } = useTranslation('eam');
  const items = attentionItems(row);
  if (items.length === 0) {
    const tracked = FLEET_DOCS.some((d) => row.due[d].state);
    return tracked ? (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-success-text">
        <CheckCircle2 className="size-3.5" aria-hidden />
        {t('fleet.list.allValid')}
      </span>
    ) : (
      <span className="text-xs text-muted-foreground">{t('fleet.list.noData')}</span>
    );
  }
  const shown = items.slice(0, 2);
  return (
    <ul className="flex flex-col items-start gap-0.5">
      {shown.map((i) => (
        <li key={i.doc} className="flex flex-wrap items-center gap-x-1.5">
          <DueMarker state={i.state} prefix={FLEET_DOC_LABELS[i.doc]} short />
          <span className="num text-xs text-muted-foreground group-data-[density=compact]/table:hidden">{formatDate(i.dueDate)}</span>
        </li>
      ))}
      {items.length > shown.length && (
        <li className="text-xs text-muted-foreground">{t('fleet.list.moreItems', { count: items.length - shown.length })}</li>
      )}
    </ul>
  );
}

export function FleetListView({ canEdit, onOpen }: FleetListViewProps) {
  const queryClient = useQueryClient();
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'code', desc: false } });
  const [density, setDensity] = useTableDensity();
  const [quick, setQuick] = useState<QuickModal>(null);
  const { t } = useTranslation('eam');
  const statusFilter = useMemo(() => statusOptions(ASSET_STATUSES, 'ga_asset'), []);
  const dueFilter = useMemo(() => DUE_FILTER_VALUES.map((value) => ({ value, label: t(`fleet.list.dueFilter.${value}`) })), [t]);
  const docFilter = useMemo(() => FLEET_DOCS.map((d) => ({ value: d, label: FLEET_DOC_LABELS[d] })), []);

  const fleetQuery = useQuery({
    queryKey: [...vehicleKeys.fleetList, 'list', list.params],
    queryFn: async () => (await api.get<Paginated<FleetRow>>('/ga/vehicle/fleet', { params: list.params })).data,
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: vehicleKeys.fleetSummary,
    queryFn: async () => (await api.get<FleetSummary>('/ga/vehicle/fleet-summary', { params: { categoryKind: 'vehicle' } })).data,
  });
  const s = summaryQuery.data;
  const kpiLoading = !s && !summaryQuery.isError;

  const refreshAfterQuick = (assetId: string, keys: string[][]) => {
    for (const k of keys) queryClient.invalidateQueries({ queryKey: [...k, assetId] });
    queryClient.invalidateQueries({ queryKey: vehicleKeys.fleetList });
    queryClient.invalidateQueries({ queryKey: vehicleKeys.fleetSummary });
    setQuick(null);
  };

  const columns = useMemo<ColumnDef<FleetRow>[]>(
    () => [
      {
        id: 'noPlat',
        header: t('fleet.list.columns.vehicle'),
        enableSorting: true,
        meta: { cellClassName: 'min-w-40' },
        cell: ({ row }) => {
          const v = row.original;
          const model = [v.brand, v.tipe].filter(Boolean).join(' ') || v.name;
          return (
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              <DocumentLink onClick={() => onOpen(v.id)} className="text-sm">
                {vehicleTitle(v)}
              </DocumentLink>
              <span className="max-w-56 truncate text-sm text-foreground" title={model}>
                {model}
              </span>
              <span className="num text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                {v.code}
                {v.tahunProduksi ? ` · ${v.tahunProduksi}` : ''}
              </span>
              {/* Mobile: status stacked here because its column is hidden. */}
              {v.status !== 'ACTIVE' && <StatusBadge status={v.status} docType="ga_asset" className="sm:hidden" />}
            </div>
          );
        },
      },
      {
        id: 'driver',
        header: t('fleet.list.columns.driver'),
        meta: { hideBelow: 'lg', cellClassName: 'max-w-44' },
        cell: ({ row }) => {
          const d = row.original.driver;
          return d ? (
            <span className="block truncate text-foreground">{d.fullName ?? '—'}</span>
          ) : (
            <span className="text-muted-foreground">{t('fleet.list.unassigned')}</span>
          );
        },
      },
      {
        id: 'odometer',
        header: () => <UnitHeader label={t('fleet.list.columns.odometer')} unit="km" />,
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'md' },
        cell: ({ row }) => (row.original.odometer != null ? formatNumber(row.original.odometer) : <span className="text-muted-foreground">—</span>),
      },
      {
        id: 'nextDue',
        header: t('fleet.list.columns.compliance'),
        enableSorting: true,
        meta: { cellClassName: 'min-w-36' },
        cell: ({ row }) => <ComplianceCell row={row.original} />,
      },
      {
        id: 'incidents',
        header: t('fleet.list.columns.incidents'),
        meta: { align: 'right', hideBelow: 'xl' },
        cell: ({ row }) =>
          row.original.openIncidentCount > 0 ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-text">
              <TriangleAlert className="size-3.5" aria-hidden />
              {t('fleet.list.openCount', { count: formatNumber(row.original.openIncidentCount) })}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'status',
        header: t('fleet.list.columns.status'),
        enableSorting: true,
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="ga_asset" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('fleet.list.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const v = row.original;
          return (
            <RowActions
              label={t('fleet.list.actionsFor', { name: vehicleTitle(v) })}
              actions={[
                { label: t('fleet.list.action.view'), icon: Eye, onSelect: () => onOpen(v.id) },
                { label: t('fleet.list.action.tax'), icon: FileWarning, onSelect: () => onOpen(v.id, 'pajak') },
                { label: t('fleet.list.action.costReport'), icon: BarChart3, onSelect: () => onOpen(v.id, 'laporan') },
                { label: t('fleet.list.action.logService'), icon: Wrench, hidden: !canEdit, onSelect: () => setQuick({ kind: 'service', row: v }) },
                { label: t('fleet.list.action.logFuel'), icon: Fuel, hidden: !canEdit, onSelect: () => setQuick({ kind: 'fuel', row: v }) },
                { label: t('fleet.list.action.reportIncident'), icon: TriangleAlert, hidden: !canEdit, onSelect: () => setQuick({ kind: 'incident', row: v }) },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, onOpen, t],
  );

  const taxDue = s ? s.taxExpired + s.taxExpiringSoon : 0;
  const insDue = s ? s.insuranceExpired + s.insuranceExpiringSoon : 0;
  const inspDue = s ? (s.inspectionOverdue ?? 0) + (s.inspectionDueSoon ?? 0) : 0;
  const monthCost = s ? s.serviceCostThisMonth + s.fuelCostThisMonth : 0;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('fleet.list.title')}
        description={t('fleet.list.description')}
        actions={
          <Button variant="outline" asChild>
            <Link to="/ga/vehicle/report">
              <BarChart3 aria-hidden />
              {t('fleet.list.fleetReport')}
            </Link>
          </Button>
        }
      />

      <section aria-label={t('fleet.list.summaryLabel')} className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard
          label={t('fleet.list.kpi.total')}
          icon={Car}
          loading={kpiLoading}
          value={s ? formatNumber(s.totalVehicles) : '—'}
          hint={s ? t('fleet.list.kpi.openIncidents', { count: formatNumber(s.openIncidents) }) : undefined}
        />
        <StatCard
          label={t('fleet.list.kpi.tax')}
          icon={FileWarning}
          loading={kpiLoading}
          value={s ? formatNumber(taxDue) : '—'}
          hint={s ? t('fleet.list.kpi.overdueSoon', { overdue: formatNumber(s.taxExpired), soon: formatNumber(s.taxExpiringSoon) }) : undefined}
        />
        <StatCard
          label={t('fleet.list.kpi.insurance')}
          icon={ShieldCheck}
          loading={kpiLoading}
          value={s ? formatNumber(insDue) : '—'}
          hint={s ? t('fleet.list.kpi.overdueSoon', { overdue: formatNumber(s.insuranceExpired), soon: formatNumber(s.insuranceExpiringSoon) }) : undefined}
        />
        <StatCard
          label={t('fleet.list.kpi.inspection')}
          icon={ClipboardCheck}
          loading={kpiLoading}
          value={s ? formatNumber(inspDue) : '—'}
          hint={
            s
              ? t('fleet.list.kpi.inspectionHint', { overdue: formatNumber(s.inspectionOverdue ?? 0), never: formatNumber(s.inspectionNeverDone ?? 0) })
              : undefined
          }
        />
        <StatCard
          label={t('fleet.list.kpi.serviceMonth')}
          icon={Wrench}
          loading={kpiLoading}
          value={s ? formatRupiah(s.serviceCostThisMonth, { compact: true }) : '—'}
          valueTitle={s ? formatRupiah(s.serviceCostThisMonth) : undefined}
          hint={t('fleet.list.kpi.serviceMonthHint')}
        />
        <StatCard
          label={t('fleet.list.kpi.costMonth')}
          icon={Wallet}
          loading={kpiLoading}
          value={s ? formatRupiah(monthCost, { compact: true }) : '—'}
          valueTitle={s ? formatRupiah(monthCost) : undefined}
          hint={s ? t('fleet.list.kpi.fuelHint', { amount: formatRupiah(s.fuelCostThisMonth, { compact: true }) }) : undefined}
        />
      </section>
      {summaryQuery.isError && (
        <p role="alert" className="flex items-center gap-1.5 text-sm text-danger-text">
          <AlertTriangle className="size-4" aria-hidden />
          {t('fleet.list.summaryError')}
        </p>
      )}

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('fleet.list.searchLabel')}
          searchPlaceholder={t('fleet.list.searchPlaceholder')}
          status={{ options: statusFilter, label: t('fleet.list.statusFilter') }}
        >
          <ComboboxFilter
            label={t('fleet.list.dueFilterLabel')}
            allLabel={t('fleet.list.dueFilterAll')}
            searchPlaceholder={t('fleet.list.searchShort')}
            value={list.filters.due}
            onChange={(v) => list.setFilter('due', v)}
            options={dueFilter}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label={t('fleet.list.docFilterLabel')}
            allLabel={t('fleet.list.docFilterAll')}
            searchPlaceholder={t('fleet.list.docFilterSearch')}
            value={list.filters.doc}
            onChange={(v) => list.setFilter('doc', v)}
            options={docFilter}
            className={FILTER_CLASS}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, fleetQuery.data?.total)}
          label={t('fleet.list.tableLabel')}
          itemLabel={t('fleet.list.itemLabel')}
          columns={columns}
          data={fleetQuery.data?.data}
          getRowId={(row) => row.id}
          loading={fleetQuery.isLoading}
          fetching={fleetQuery.isFetching && fleetQuery.isPlaceholderData}
          error={fleetQuery.error}
          onRetry={() => fleetQuery.refetch()}
          onRowClick={(row) => onOpen(row.id)}
          rowClassName={(row) => (row.status === 'RETIRED' || row.status === 'LOST' ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('fleet.list.empty.title'),
            description: t('fleet.list.empty.description'),
            action: can('ga_assets', 'view') ? (
              <Button size="sm" variant="outline" asChild>
                <Link to="/ga/assets">{t('fleet.list.empty.action')}</Link>
              </Button>
            ) : undefined,
          }}
        />
      </div>

      {quick?.kind === 'service' && (
        <ServiceLogModal
          assetId={quick.row.id}
          onClose={() => setQuick(null)}
          onSaved={() => refreshAfterQuick(quick.row.id, [['ga-vehicle-services'], ['ga-vehicle']])}
        />
      )}
      {quick?.kind === 'fuel' && (
        <FuelModal
          assetId={quick.row.id}
          onClose={() => setQuick(null)}
          onSaved={() => refreshAfterQuick(quick.row.id, [['ga-vehicle-fuel'], ['ga-vehicle']])}
        />
      )}
      {quick?.kind === 'incident' && (
        <IncidentModal
          assetId={quick.row.id}
          onClose={() => setQuick(null)}
          onSaved={() => refreshAfterQuick(quick.row.id, [['ga-vehicle-incidents']])}
        />
      )}
    </div>
  );
}
