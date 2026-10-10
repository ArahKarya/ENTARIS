/**
 * Project guarantee deposits (/project-guarantees). Status: Disetor → Selesai (settled as returned
 * or forfeited) | Dibatalkan. Individual settlements can be cancelled from the detail drawer.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Eye, Flame, ShieldCheck, Undo2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import i18n from '@/i18n';
import api from '@/lib/api';
import { can, cap } from '@/lib/permissions';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { useListState } from '@/hooks/useListState';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ComboboxFilter,
  ConfirmDialog,
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
import ProjectGuaranteeModal from '@/components/ProjectGuaranteeModal';
import SettleGuaranteeModal from '@/components/SettleGuaranteeModal';
import {
  ProjectGuaranteeDetailSheet,
  type GuaranteeSettlementRow,
  type ProjectGuaranteeRow,
} from '@/components/ProjectGuaranteeDetailSheet';
import { DueDate } from '@/components/ProjectGuaranteeDueDate';

interface ProjectGuaranteeSummary {
  count: number;
  cancelledCount: number;
  activeCount: number;
  settledCount: number;
  totalDeposited: number;
  totalReturned: number;
  totalForfeited: number;
  totalOutstanding: number;
  overdueCount: number;
  overdueOutstanding: number;
  dueSoonCount: number;
  dueSoonOutstanding: number;
}

const ENDPOINT = '/project-guarantees';
const FILTER_KEYS = ['status', 'partyId', 'guaranteeType', 'due', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(['Disetor', 'Selesai', 'Dibatalkan'], 'project_guarantee');
/** Guarantee types are stored as these Indonesian values; only their labels are translated. */
const GUARANTEE_TYPES = ['Penawaran', 'Pelaksanaan', 'Pemeliharaan', 'Lainnya'] as const;
const GUARANTEE_TYPE_KEY = {
  Penawaran: 'bid',
  Pelaksanaan: 'performance',
  Pemeliharaan: 'maintenance',
  Lainnya: 'other',
} as const satisfies Record<(typeof GUARANTEE_TYPES)[number], string>;

function guaranteeTypeLabel(value: string): string {
  const key = GUARANTEE_TYPE_KEY[value as keyof typeof GUARANTEE_TYPE_KEY];
  return key ? i18n.t(`finance:projectGuarantees.guaranteeType.${key}`) : value;
}

const DUE_FILTER_VALUES = ['overdue', 'dueSoon'] as const;
/** Same threshold as the server: an outstanding balance above this can still be settled. */
const OUTSTANDING_EPSILON = 0.01;
const FILTER_CLASS = 'w-[calc(50%-0.25rem)] sm:w-48';

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

const money = (v: string | number | null | undefined) => formatRupiah(toNumber(v) ?? 0, { symbol: false });

function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : fallback;
}

const activeSettlements = (g: ProjectGuaranteeRow) => (g.settlements ?? []).filter((s) => !s.isCancelled);

/** Settle: open guarantee with a remaining balance. */
const isSettleable = (g: ProjectGuaranteeRow) => g.status === 'Disetor' && g.outstanding > OUTSTANDING_EPSILON;
/** Cancel the deposit: not cancelled yet and no active settlement (server rule). */
const isCancellable = (g: ProjectGuaranteeRow) => g.status !== 'Dibatalkan' && activeSettlements(g).length === 0;

export const ProjectGuarantees = () => {
  const { t } = useTranslation('finance');
  const queryClient = useQueryClient();
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectGuaranteeRow | null>(null);
  const [settleTarget, setSettleTarget] = useState<ProjectGuaranteeRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; guaranteeNumber: string } | null>(null);
  const [cancelSettlementTarget, setCancelSettlementTarget] = useState<{ id: string; label: string } | null>(null);

  const canEdit = can('project_guarantee', 'edit');
  // Cancelling also needs the doc.cancel capability (server: requireCap).
  const canCancel = canEdit && cap('doc.cancel');

  const guaranteesQuery = useQuery({
    queryKey: ['project-guarantees', 'list', list.params],
    queryFn: async () =>
      (await api.get<Paginated<ProjectGuaranteeRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ['project-guarantees', 'summary', list.filterParams],
    queryFn: async () =>
      (await api.get<ProjectGuaranteeSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const partyPicker = usePartyPicker({ selectedId: list.filters.partyId || null });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project-guarantees'] });
    queryClient.invalidateQueries({ queryKey: ['journals'] });
    queryClient.invalidateQueries({ queryKey: ['coa'] });
  };

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`${ENDPOINT}/${id}/cancel`),
    onSuccess: () => {
      toast.success(t('projectGuarantees.toast.cancelled'));
      invalidate();
    },
    onError: (err: unknown) => toast.error(errorMessage(err, t('projectGuarantees.toast.cancelFailed'))),
  });

  const cancelSettlementMutation = useMutation({
    mutationFn: (id: string) => api.post(`${ENDPOINT}/settlements/${id}/cancel`),
    onSuccess: () => {
      toast.success(t('projectGuarantees.toast.settlementCancelled'));
      invalidate();
    },
    onError: (err: unknown) => toast.error(errorMessage(err, t('projectGuarantees.toast.settlementCancelFailed'))),
  });

  const rows = guaranteesQuery.data?.data;
  // Keep the drawer in sync with refetched rows (e.g. after a settlement is cancelled).
  const selectedRow = selected ? rows?.find((r) => r.id === selected.id) ?? selected : null;
  const summary = summaryQuery.data;

  const columns = useMemo<ColumnDef<ProjectGuaranteeRow>[]>(
    () => [
      {
        id: 'guaranteeNumber',
        header: t('projectGuarantees.columns.number'),
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => {
          const g = row.original;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <DocumentLink onClick={() => setSelected(g)}>{g.guaranteeNumber}</DocumentLink>
              {/* Mobile: party + project + date stacked here because their columns are hidden. */}
              <span className="max-w-40 truncate text-sm font-medium text-foreground sm:hidden">{g.party?.name ?? '—'}</span>
              <span className="max-w-40 truncate text-xs text-muted-foreground sm:hidden">{g.projectName}</span>
              <span className="num text-xs text-muted-foreground md:hidden">{formatDate(g.date)}</span>
            </div>
          );
        },
      },
      {
        id: 'date',
        header: t('projectGuarantees.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'party',
        header: t('projectGuarantees.columns.party'),
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-44 max-w-80' },
        cell: ({ row }) => {
          const g = row.original;
          return (
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{g.party?.name ?? '—'}</p>
              <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden" title={g.projectName}>
                {guaranteeTypeLabel(g.guaranteeType)} · {g.projectName}
              </p>
            </div>
          );
        },
      },
      {
        id: 'expectedReturnDate',
        header: t('projectGuarantees.columns.due'),
        enableSorting: true,
        meta: { hideBelow: 'md' },
        cell: ({ row }) => <DueDate date={row.original.expectedReturnDate} dueState={row.original.dueState} />,
      },
      {
        id: 'amount',
        header: () => withUnit(t('projectGuarantees.columns.amount')),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => <span className="text-foreground">{money(row.original.amount)}</span>,
      },
      {
        id: 'outstanding',
        header: () => withUnit(t('projectGuarantees.columns.outstanding')),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const g = row.original;
          const open = g.status !== 'Dibatalkan' && g.outstanding > OUTSTANDING_EPSILON;
          return (
            <div className="flex flex-col items-end gap-1">
              <span className={open ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{money(g.outstanding)}</span>
              {/* Mobile: status + due marker stacked here because their columns are hidden. */}
              <StatusBadge status={g.status} docType="project_guarantee" className="sm:hidden" />
              <DueDate dueState={g.dueState} markerOnly className="items-end md:hidden" />
            </div>
          );
        },
      },
      {
        id: 'status',
        header: t('projectGuarantees.columns.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="project_guarantee" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('projectGuarantees.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const g = row.original;
          return (
            <RowActions
              label={t('projectGuarantees.rowActions', { number: g.guaranteeNumber })}
              actions={[
                { label: t('projectGuarantees.actions.view'), icon: Eye, onSelect: () => setSelected(g) },
                {
                  label: t('projectGuarantees.actions.settle'),
                  icon: Undo2,
                  hidden: !canEdit || !isSettleable(g),
                  onSelect: () => setSettleTarget(g),
                },
                {
                  label: t('projectGuarantees.actions.cancel'),
                  icon: XCircle,
                  tone: 'danger',
                  hidden: !canCancel || !isCancellable(g),
                  onSelect: () => setCancelTarget({ id: g.id, guaranteeNumber: g.guaranteeNumber }),
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, canCancel, t],
  );

  const kpiMoney = (v: number | undefined) => (v === undefined ? '—' : formatRupiah(v, { compact: true }));
  const kpiLoading = !summary && !summaryQuery.isError;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('projectGuarantees.title')}
        description={t('projectGuarantees.description')}
        actions={
          canEdit && (
            <Button onClick={() => setIsModalOpen(true)}>
              <ShieldCheck aria-hidden />
              {t('projectGuarantees.create')}
            </Button>
          )
        }
      />

      <section aria-label={t('projectGuarantees.summary.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('projectGuarantees.summary.outstanding')}
          icon={ShieldCheck}
          loading={kpiLoading}
          value={kpiMoney(summary?.totalOutstanding)}
          valueTitle={summary ? formatRupiah(summary.totalOutstanding) : undefined}
          hint={summary ? t('projectGuarantees.summary.active', { count: summary.activeCount }) : undefined}
        />
        <StatCard
          label={t('projectGuarantees.summary.returned')}
          icon={CheckCircle2}
          loading={kpiLoading}
          value={kpiMoney(summary?.totalReturned)}
          valueTitle={summary ? formatRupiah(summary.totalReturned) : undefined}
          hint={summary ? t('projectGuarantees.summary.ofDeposited', { amount: formatRupiah(summary.totalDeposited, { compact: true }) }) : undefined}
        />
        <StatCard
          label={t('projectGuarantees.summary.forfeited')}
          icon={Flame}
          loading={kpiLoading}
          value={kpiMoney(summary?.totalForfeited)}
          valueTitle={summary ? formatRupiah(summary.totalForfeited) : undefined}
          hint={t('projectGuarantees.summary.forfeitedHint')}
        />
        <StatCard
          label={t('projectGuarantees.summary.overdue')}
          icon={AlertTriangle}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.overdueCount) : '—'}
          hint={
            summary
              ? summary.overdueCount > 0
                ? t('projectGuarantees.summary.overdueOutstanding', { amount: formatRupiah(summary.overdueOutstanding, { compact: true }) })
                : t('projectGuarantees.summary.dueSoon', { count: summary.dueSoonCount })
              : undefined
          }
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('projectGuarantees.filters.searchLabel')}
          searchPlaceholder={t('projectGuarantees.filters.searchPlaceholder')}
          status={{ options: STATUS_FILTER }}
          dateRange={{ label: t('projectGuarantees.filters.dateRange') }}
        >
          <ComboboxFilter
            label={t('projectGuarantees.filters.party')}
            allLabel={t('projectGuarantees.filters.allParties')}
            searchPlaceholder={t('projectGuarantees.filters.partySearch')}
            value={list.filters.partyId}
            onChange={(v) => list.setFilter('partyId', v)}
            {...partyPicker.pickerProps}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label={t('projectGuarantees.filters.type')}
            allLabel={t('projectGuarantees.filters.allTypes')}
            searchPlaceholder={t('projectGuarantees.filters.typeSearch')}
            value={list.filters.guaranteeType}
            onChange={(v) => list.setFilter('guaranteeType', v)}
            options={GUARANTEE_TYPES.map((value) => ({ value, label: guaranteeTypeLabel(value) }))}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label={t('projectGuarantees.filters.due')}
            allLabel={t('projectGuarantees.filters.allDue')}
            searchPlaceholder={t('projectGuarantees.filters.dueSearch')}
            value={list.filters.due}
            onChange={(v) => list.setFilter('due', v)}
            options={DUE_FILTER_VALUES.map((value) => ({ value, label: t(`projectGuarantees.filters.dueOption.${value}`) }))}
            className={FILTER_CLASS}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, guaranteesQuery.data?.total)}
          label={t('projectGuarantees.table.label')}
          itemLabel={t('projectGuarantees.table.itemLabel')}
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          loading={guaranteesQuery.isLoading}
          fetching={guaranteesQuery.isFetching && guaranteesQuery.isPlaceholderData}
          error={guaranteesQuery.error}
          onRetry={() => guaranteesQuery.refetch()}
          onRowClick={(row) => setSelected(row)}
          rowClassName={(row) => (row.status === 'Dibatalkan' ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('projectGuarantees.empty.title'),
            description: t('projectGuarantees.empty.description'),
            action: canEdit ? (
              <Button size="sm" onClick={() => setIsModalOpen(true)}>
                <ShieldCheck aria-hidden />
                {t('projectGuarantees.empty.action')}
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <ProjectGuaranteeDetailSheet
        guarantee={selectedRow}
        onClose={() => setSelected(null)}
        onSettle={
          canEdit && selectedRow && isSettleable(selectedRow)
            ? () => {
                setSettleTarget(selectedRow);
                setSelected(null);
              }
            : undefined
        }
        onCancel={
          canCancel && selectedRow && isCancellable(selectedRow)
            ? () => setCancelTarget({ id: selectedRow.id, guaranteeNumber: selectedRow.guaranteeNumber })
            : undefined
        }
        onCancelSettlement={
          canCancel && selectedRow?.status !== 'Dibatalkan'
            ? (s: GuaranteeSettlementRow) =>
                setCancelSettlementTarget({
                  id: s.id,
                  label: `${formatDate(s.date)} · ${formatRupiah((toNumber(s.returnAmount) ?? 0) + (toNumber(s.forfeitAmount) ?? 0))}`,
                })
            : undefined
        }
      />

      <ProjectGuaranteeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* Conditional mount = fresh state per open; key ties to guarantee id. */}
      {settleTarget && (
        <SettleGuaranteeModal
          key={settleTarget.id}
          isOpen={true}
          onClose={() => setSettleTarget(null)}
          guarantee={{
            id: settleTarget.id,
            guaranteeNumber: settleTarget.guaranteeNumber,
            projectName: settleTarget.projectName,
            party: settleTarget.party ?? undefined,
            amount: toNumber(settleTarget.amount) ?? 0,
            outstanding: settleTarget.outstanding,
          }}
        />
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title={t('projectGuarantees.cancelDialog.title')}
        description={t('projectGuarantees.cancelDialog.description', { number: cancelTarget?.guaranteeNumber ?? '' })}
        confirmLabel={t('projectGuarantees.confirmCancel')}
        tone="danger"
        loading={cancelMutation.isPending}
        onConfirm={async () => {
          if (!cancelTarget) return;
          await cancelMutation.mutateAsync(cancelTarget.id);
          setCancelTarget(null);
          setSelected(null);
        }}
      />

      <ConfirmDialog
        open={cancelSettlementTarget !== null}
        onOpenChange={(open) => !open && setCancelSettlementTarget(null)}
        title={t('projectGuarantees.cancelSettlementDialog.title')}
        description={t('projectGuarantees.cancelSettlementDialog.description', { label: cancelSettlementTarget?.label ?? '' })}
        confirmLabel={t('projectGuarantees.confirmCancel')}
        tone="danger"
        loading={cancelSettlementMutation.isPending}
        onConfirm={async () => {
          if (!cancelSettlementTarget) return;
          await cancelSettlementMutation.mutateAsync(cancelSettlementTarget.id);
          setCancelSettlementTarget(null);
        }}
      />
    </div>
  );
};
