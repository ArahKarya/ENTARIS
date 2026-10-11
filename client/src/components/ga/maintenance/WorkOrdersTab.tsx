/**
 * Server-paged work order list; KPI cards use the same filters. Rows open the
 * detail sheet (the page owns ?wo=<id>).
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, CheckCircle2, ClipboardList, Eye, Play, Plus, UserCheck, UserPlus, Wallet, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatNumber, formatRupiah } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ComboboxFilter,
  ConfirmDialog,
  DataTable,
  DocumentLink,
  FilterBar,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import { DueDate } from '@/components/ProjectGuaranteeDueDate';
import { PriorityBadge } from './wo-badges';
import { AssignModal, CompleteModal } from './wo-forms';
import { WO_FILTER_KEYS, useGaAssetOptions } from './queries';
import { useTranslation } from 'react-i18next';
import {
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  TYPE_LABELS,
  WO_STATUSES,
  WO_STATUS_ACTIVE,
  apiErrorMessage,
  woActions,
  woDueState,
  type WoType,
  type WorkOrderRow,
  type WorkOrderSummary,
} from './wo-meta';

const ENDPOINT = '/ga/maintenance/work-orders';

const DUE_FILTER_VALUES = ['overdue', 'dueSoon'] as const;
const FILTER_CLASS = 'w-[calc(50%-0.25rem)] sm:w-44';

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

type RowForm = { kind: 'assign' | 'complete'; wo: WorkOrderRow } | null;

export interface WorkOrdersTabProps {
  canEdit: boolean;
  onOpen: (wo: WorkOrderRow) => void;
  onCreate: () => void;
}

export function WorkOrdersTab({ canEdit, onOpen, onCreate }: WorkOrdersTabProps) {
  const queryClient = useQueryClient();
  const list = useListState({ filters: WO_FILTER_KEYS });
  const [density, setDensity] = useTableDensity();
  const [rowForm, setRowForm] = useState<RowForm>(null);
  const [cancelTarget, setCancelTarget] = useState<WorkOrderRow | null>(null);
  const assetsQuery = useGaAssetOptions();
  const { t } = useTranslation('eam');
  const filters = useMemo(
    () => ({
      status: [{ value: WO_STATUS_ACTIVE, label: t('workOrder.tab.statusActive') }, ...statusOptions(WO_STATUSES, 'ga_work_order')],
      priority: PRIORITY_ORDER.map((p) => ({ value: p, label: PRIORITY_LABELS[p] })),
      type: (Object.keys(TYPE_LABELS) as WoType[]).map((type) => ({ value: type, label: TYPE_LABELS[type] })),
      due: DUE_FILTER_VALUES.map((value) => ({ value, label: t(`workOrder.tab.dueFilter.${value}`) })),
    }),
    [t],
  );

  const listQuery = useQuery({
    queryKey: ['ga-work-orders', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<WorkOrderRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: ['ga-work-orders', 'summary', list.filterParams],
    queryFn: async () => (await api.get<WorkOrderSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const invalidate = (id?: string) => {
    queryClient.invalidateQueries({ queryKey: ['ga-work-orders'] });
    if (id) queryClient.invalidateQueries({ queryKey: ['ga-work-order', id] });
  };

  const startMutation = useMutation({
    mutationFn: (wo: WorkOrderRow) => api.patch(`${ENDPOINT}/${wo.id}/start`),
    onSuccess: (_res, wo) => {
      toast.success(t('workOrder.tab.started', { code: wo.code }));
      invalidate(wo.id);
    },
    onError: (err) => toast.error(apiErrorMessage(err, t('workOrder.tab.startFailed'))),
  });
  const cancelMutation = useMutation({
    mutationFn: ({ wo, reason }: { wo: WorkOrderRow; reason: string }) =>
      api.patch(`${ENDPOINT}/${wo.id}/cancel`, { reason }),
    onSuccess: (_res, { wo }) => {
      toast.success(t('workOrder.tab.cancelled', { code: wo.code }));
      invalidate(wo.id);
    },
    onError: (err) => toast.error(apiErrorMessage(err, t('workOrder.tab.cancelFailed'))),
  });

  const startWorkOrder = startMutation.mutate;

  const assetFilterOptions = useMemo(
    () => (assetsQuery.data ?? []).map((a) => ({ value: a.id, label: a.name, hint: a.code })),
    [assetsQuery.data],
  );

  const columns = useMemo<ColumnDef<WorkOrderRow>[]>(
    () => [
      {
        id: 'code',
        header: t('workOrder.tab.code'),
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => {
          const wo = row.original;
          const due = woDueState(wo);
          return (
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              <DocumentLink onClick={() => onOpen(wo)}>{wo.code}</DocumentLink>
              {/* Mobile: title, asset, priority and due marker stacked here (their columns are hidden). */}
              <span className="line-clamp-2 max-w-52 break-words text-sm font-medium text-foreground sm:hidden">{wo.title}</span>
              <span className="max-w-52 truncate text-xs text-muted-foreground sm:hidden">{wo.asset?.name ?? '—'}</span>
              <span className="flex flex-wrap items-center gap-1.5 md:hidden">
                <PriorityBadge priority={wo.priority} />
                <DueDate dueState={due} markerOnly />
              </span>
            </div>
          );
        },
      },
      {
        id: 'title',
        header: t('workOrder.tab.work'),
        meta: { hideBelow: 'sm', cellClassName: 'min-w-48 max-w-80' },
        cell: ({ row }) => {
          const wo = row.original;
          return (
            <div className="min-w-0">
              <p className="line-clamp-2 break-words font-medium text-foreground">{wo.title}</p>
              <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                {wo.asset ? `${wo.asset.code} · ${wo.asset.name}` : '—'}
              </p>
            </div>
          );
        },
      },
      {
        id: 'priority',
        header: t('workOrder.tab.priority'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md' },
        cell: ({ row }) => <PriorityBadge priority={row.original.priority} />,
      },
      {
        id: 'dueAt',
        header: t('workOrder.tab.dueDate'),
        enableSorting: true,
        meta: { hideBelow: 'md' },
        cell: ({ row }) =>
          row.original.dueAt ? (
            <DueDate date={row.original.dueAt} dueState={woDueState(row.original)} />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'assignee',
        header: t('workOrder.tab.technician'),
        meta: { hideBelow: 'lg', cellClassName: 'max-w-40' },
        cell: ({ row }) =>
          row.original.assignee ? (
            <span className="block truncate text-foreground">{row.original.assignee.fullName ?? t('workOrder.tab.assigned')}</span>
          ) : (
            <span className="text-muted-foreground">{t('workOrder.tab.none')}</span>
          ),
      },
      {
        id: 'type',
        header: t('workOrder.tab.type'),
        meta: { hideBelow: 'xl', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => TYPE_LABELS[row.original.type] ?? row.original.type,
      },
      {
        id: 'totalCost',
        header: () => withUnit(t('workOrder.tab.cost')),
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ row }) => {
          const cost = row.original.totalCost;
          return cost ? (
            <span className="text-foreground">{formatRupiah(cost, { symbol: false })}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'status',
        header: t('shared.status'),
        enableSorting: true,
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="ga_work_order" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const wo = row.original;
          const can = woActions(wo.status);
          return (
            <RowActions
              label={t('shared.actionsFor', { name: wo.code })}
              actions={[
                { label: t('workOrder.tab.viewDetail'), icon: Eye, onSelect: () => onOpen(wo) },
                {
                  label: wo.status === 'ASSIGNED' ? t('workOrder.tab.changeTechnician') : t('workOrder.tab.assignTechnician'),
                  icon: UserPlus,
                  hidden: !canEdit || !can.assign,
                  onSelect: () => setRowForm({ kind: 'assign', wo }),
                },
                {
                  label: t('workOrder.tab.start'),
                  icon: Play,
                  hidden: !canEdit || !can.start,
                  onSelect: () => startWorkOrder(wo),
                },
                {
                  label: t('workOrder.tab.complete'),
                  icon: CheckCircle2,
                  hidden: !canEdit || !can.complete,
                  onSelect: () => setRowForm({ kind: 'complete', wo }),
                },
                {
                  label: t('workOrder.tab.cancelWo'),
                  icon: XCircle,
                  tone: 'danger',
                  hidden: !canEdit || !can.cancel,
                  onSelect: () => setCancelTarget(wo),
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, onOpen, startWorkOrder, t],
  );

  const summary = summaryQuery.data;
  const kpiLoading = !summary && !summaryQuery.isError;
  const mine = list.filters.mine === 'true';

  return (
    <div className="space-y-5">
      <section aria-label={t('workOrder.tab.summaryLabel')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('workOrder.tab.kpiActive')}
          icon={ClipboardList}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.active) : '—'}
          hint={summary ? t('workOrder.tab.kpiActiveHint', { total: formatNumber(summary.count) }) : undefined}
        />
        <StatCard
          label={t('workOrder.tab.kpiOverdue')}
          icon={CalendarClock}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.overdue) : '—'}
          hint={t('workOrder.tab.kpiOverdueHint')}
        />
        <StatCard
          label={t('workOrder.tab.kpiDone')}
          icon={CheckCircle2}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.doneThisMonth) : '—'}
          hint={t('workOrder.tab.kpiDoneHint')}
        />
        <StatCard
          label={t('workOrder.tab.kpiCost')}
          icon={Wallet}
          loading={kpiLoading}
          value={summary ? formatRupiah(summary.totalCost, { compact: true }) : '—'}
          valueTitle={summary ? formatRupiah(summary.totalCost) : undefined}
          hint={t('workOrder.tab.kpiCostHint')}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('workOrder.tab.searchLabel')}
          searchPlaceholder={t('workOrder.tab.searchPlaceholder')}
          status={{ options: filters.status }}
          dateRange={{ label: t('workOrder.tab.dateRange') }}
        >
          <ComboboxFilter
            label={t('workOrder.tab.priorityFilter')}
            allLabel={t('workOrder.tab.allPriorities')}
            value={list.filters.priority}
            onChange={(v) => list.setFilter('priority', v)}
            options={filters.priority}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label={t('workOrder.tab.typeFilter')}
            allLabel={t('workOrder.tab.allTypes')}
            value={list.filters.type}
            onChange={(v) => list.setFilter('type', v)}
            options={filters.type}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label={t('workOrder.tab.assetFilter')}
            allLabel={t('workOrder.tab.allAssets')}
            searchPlaceholder={t('workOrder.tab.assetSearch')}
            value={list.filters.assetId}
            onChange={(v) => list.setFilter('assetId', v)}
            options={assetFilterOptions}
            loading={assetsQuery.isLoading}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label={t('workOrder.tab.dueFilterLabel')}
            allLabel={t('workOrder.tab.allDue')}
            value={list.filters.due}
            onChange={(v) => list.setFilter('due', v)}
            options={filters.due}
            className={FILTER_CLASS}
          />
          <Button
            variant={mine ? 'primary' : 'outline'}
            aria-pressed={mine}
            onClick={() => list.setFilter('mine', mine ? '' : 'true')}
            className={cn(FILTER_CLASS, 'h-10 md:h-9')}
          >
            <UserCheck aria-hidden />
            {t('workOrder.tab.mine')}
          </Button>
        </FilterBar>

        <DataTable
          {...listTableProps(list, listQuery.data?.total)}
          label={t('workOrder.tab.tableLabel')}
          itemLabel={t('workOrder.tab.itemLabel')}
          columns={columns}
          data={listQuery.data?.data}
          getRowId={(row) => row.id}
          loading={listQuery.isLoading}
          fetching={listQuery.isFetching && listQuery.isPlaceholderData}
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
          onRowClick={onOpen}
          rowClassName={(row) => (row.status === 'CANCELLED' ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('workOrder.tab.emptyTitle'),
            description: t('workOrder.tab.emptyDescription'),
            action: canEdit ? (
              <Button size="sm" onClick={onCreate}>
                <Plus aria-hidden />
                {t('workOrder.tab.createFirst')}
              </Button>
            ) : undefined,
          }}
        />
      </div>

      {rowForm?.kind === 'assign' && (
        <AssignModal
          id={rowForm.wo.id}
          currentAssigneeId={rowForm.wo.assignedToId}
          onClose={() => setRowForm(null)}
          onDone={() => invalidate(rowForm.wo.id)}
        />
      )}
      {rowForm?.kind === 'complete' && (
        <CompleteModal id={rowForm.wo.id} onClose={() => setRowForm(null)} onDone={() => invalidate(rowForm.wo.id)} />
      )}
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        tone="danger"
        title={t('workOrder.tab.cancelTitle')}
        description={cancelTarget ? t('workOrder.tab.cancelDescription', { code: cancelTarget.code, title: cancelTarget.title }) : undefined}
        confirmLabel={t('workOrder.tab.cancelWo')}
        requireReason={{ label: t('workOrder.tab.cancelReason'), minLength: 1 }}
        loading={cancelMutation.isPending}
        onConfirm={(reason) =>
          cancelTarget ? cancelMutation.mutateAsync({ wo: cancelTarget, reason: (reason ?? '').slice(0, 500) }) : undefined
        }
      />
    </div>
  );
}
