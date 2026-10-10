/**
 * Vendor deposits (/vendor-deposits). Callers that omit `page` (PaymentModal) get the unpaged
 * `{ data }` response. Status uses the server-derived usage state; rows are not clickable yet.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Clock, Plus, Undo2, Wallet, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  FilterBar,
  PageHeader,
  PartyFilter,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import VendorDepositModal from '@/components/VendorDepositModal';
import RefundVendorDepositModal from '@/components/RefundVendorDepositModal';
import { ConfirmDialog } from '@/components/ConfirmDialog';

type Money = string | number;
type DepositState = 'Active' | 'PartiallyUsed' | 'FullyUsed' | 'Cancelled';

interface VendorDepositRow {
  id: string;
  paymentNumber: string;
  date: string;
  status: string;
  amount: Money;
  referenceNo?: string | null;
  totalApplied: number;
  totalRefunded: number;
  remaining: number;
  state?: DepositState;
  party?: { id: string; name: string; outstandingAmount?: number } | null;
  account?: { id: string; name: string; accountNumber: string } | null;
}

interface VendorDepositSummary {
  count: number;
  cancelledCount: number;
  totalDeposit: number;
  totalApplied: number;
  totalRefunded: number;
  totalRemaining: number;
  activeCount: number;
  byState: Record<DepositState, number>;
}

const ENDPOINT = '/vendor-deposits';
const FILTER_KEYS = ['status', 'partyId', 'startDate', 'endDate'] as const;
const STATUS_FILTER_VALUES = ['Active', 'PartiallyUsed', 'FullyUsed', 'Cancelled'];
/** Same threshold as the server: a remaining balance above this can still be used/refunded. */
const REMAINING_EPSILON = 0.01;

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

const num = (v: Money | null | undefined) => toNumber(v) ?? 0;
const money = (v: Money | null | undefined) => formatRupiah(num(v), { symbol: false });

/** Fallback when an older server omits `state` (rules identical to the server). */
function depositState(d: VendorDepositRow): DepositState {
  if (d.state) return d.state;
  if (d.status === 'Cancelled') return 'Cancelled';
  if (d.remaining < REMAINING_EPSILON) return 'FullyUsed';
  return d.totalApplied > 0 ? 'PartiallyUsed' : 'Active';
}

function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : fallback;
}

export const VendorDeposits = () => {
  const { t } = useTranslation('purchasing');
  // Built per render (not at module load) so the labels follow the UI language.
  const statusFilter = statusOptions(STATUS_FILTER_VALUES, 'deposit');
  const queryClient = useQueryClient();
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; paymentNumber: string } | null>(null);
  const [refundTarget, setRefundTarget] = useState<VendorDepositRow | null>(null);
  const canEdit = can('vendor_deposit', 'edit');

  const depositsQuery = useQuery({
    queryKey: ['vendor-deposits', 'list', list.params],
    queryFn: async () =>
      (await api.get<Paginated<VendorDepositRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ['vendor-deposits', 'summary', list.filterParams],
    queryFn: async () =>
      (await api.get<VendorDepositSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`${ENDPOINT}/${id}/cancel`),
    onSuccess: () => {
      toast.success(t('depositList.toastCancelled'));
      queryClient.invalidateQueries({ queryKey: ['vendor-deposits'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
      queryClient.invalidateQueries({ queryKey: ['parties'] });
    },
    onError: (err: unknown) => toast.error(errorMessage(err, t('depositList.errorCancel'))),
  });

  const summary = summaryQuery.data;

  const columns = useMemo<ColumnDef<VendorDepositRow>[]>(
    () => [
      {
        id: 'paymentNumber',
        header: t('depositList.columns.number'),
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <span className="num font-mono text-xs font-medium text-foreground">{row.original.paymentNumber}</span>
            {/* Mobile: supplier + date stacked here because their columns are hidden.
                Long supplier names wrap (max two lines) so the row menu stays in view at 390px. */}
            <span className="line-clamp-2 max-w-44 text-sm font-medium break-words text-foreground sm:hidden">
              {row.original.party?.name ?? '—'}
            </span>
            <span className="num text-xs text-muted-foreground md:hidden">{formatDate(row.original.date)}</span>
          </div>
        ),
      },
      {
        id: 'date',
        header: t('depositList.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'supplier',
        header: t('depositList.columns.supplier'),
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => {
          const d = row.original;
          const sub = [d.account?.name, d.referenceNo].filter(Boolean).join(' · ');
          return (
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{d.party?.name ?? '—'}</p>
              {sub && (
                <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">{sub}</p>
              )}
            </div>
          );
        },
      },
      {
        id: 'amount',
        header: () => withUnit(t('depositList.columns.amount')),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => <span className="font-medium text-foreground">{money(row.original.amount)}</span>,
      },
      {
        id: 'totalApplied',
        header: () => withUnit(t('depositList.columns.applied')),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ row }) => {
          const { totalApplied, totalRefunded } = row.original;
          return (
            <div>
              <span className={totalApplied > 0 ? 'text-foreground' : 'text-muted-foreground'}>{money(totalApplied)}</span>
              {totalRefunded > 0 && (
                <div className="mt-0.5 text-xs text-warning-text" title={t('depositList.refundedTitle', { amount: formatRupiah(totalRefunded) })}>
                  {t('depositList.refunded', { amount: money(totalRefunded) })}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'remaining',
        header: () => withUnit(t('depositList.columns.remaining')),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const d = row.original;
          const usable = d.status !== 'Cancelled' && d.remaining > REMAINING_EPSILON;
          return (
            <div className="flex flex-col items-end gap-1">
              <span className={usable ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                {money(d.remaining)}
              </span>
              {/* Mobile: status stacked here because its column is hidden. */}
              <StatusBadge status={depositState(d)} docType="deposit" className="sm:hidden" />
            </div>
          );
        },
      },
      {
        id: 'status',
        header: t('depositList.columns.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={depositState(row.original)} docType="deposit" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('depositList.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const d = row.original;
          const isCancelled = d.status === 'Cancelled';
          return (
            <RowActions
              label={t('depositList.rowActions', { number: d.paymentNumber })}
              actions={[
                {
                  label: t('depositList.actions.refund'),
                  icon: Undo2,
                  hidden: !canEdit || isCancelled || d.remaining <= REMAINING_EPSILON,
                  onSelect: () => setRefundTarget(d),
                },
                {
                  label: t('depositList.actions.cancel'),
                  icon: XCircle,
                  tone: 'danger',
                  hidden: !canEdit || isCancelled,
                  onSelect: () => setCancelTarget({ id: d.id, paymentNumber: d.paymentNumber }),
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, t],
  );

  const kpiMoney = (v: number | undefined) => (v === undefined ? '—' : formatRupiah(v, { compact: true }));

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('depositList.title')}
        description={t('depositList.description')}
        actions={
          canEdit && (
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus aria-hidden />
              {t('depositList.create')}
            </Button>
          )
        }
      />

      <section aria-label={t('depositList.kpi.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('depositList.kpi.total')}
          icon={Wallet}
          loading={!summary && !summaryQuery.isError}
          value={kpiMoney(summary?.totalDeposit)}
          valueTitle={summary ? formatRupiah(summary.totalDeposit) : undefined}
          hint={summary ? t('depositList.kpi.totalHint', { count: formatNumber(summary.count - summary.cancelledCount) }) : undefined}
        />
        <StatCard
          label={t('depositList.kpi.applied')}
          icon={CheckCircle2}
          loading={!summary && !summaryQuery.isError}
          value={kpiMoney(summary?.totalApplied)}
          valueTitle={summary ? formatRupiah(summary.totalApplied) : undefined}
          hint={
            summary && summary.totalRefunded > 0
              ? t('depositList.kpi.appliedRefund', { amount: formatRupiah(summary.totalRefunded) })
              : t('depositList.kpi.appliedHint')
          }
        />
        <StatCard
          label={t('depositList.kpi.remaining')}
          icon={Wallet}
          loading={!summary && !summaryQuery.isError}
          value={kpiMoney(summary?.totalRemaining)}
          valueTitle={summary ? formatRupiah(summary.totalRemaining) : undefined}
          hint={summary ? formatRupiah(summary.totalRemaining) : undefined}
        />
        <StatCard
          label={t('depositList.kpi.active')}
          icon={Clock}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.activeCount) : '—'}
          hint={t('depositList.kpi.activeHint')}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('depositList.searchLabel')}
          searchPlaceholder={t('depositList.searchPlaceholder')}
          status={{ options: statusFilter }}
          dateRange
        >
          <PartyFilter
            partyType="Supplier"
            value={list.filters.partyId}
            onChange={(v) => list.setFilter('partyId', v)}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, depositsQuery.data?.total)}
          label={t('depositList.tableLabel')}
          itemLabel={t('depositList.itemLabel')}
          columns={columns}
          data={depositsQuery.data?.data}
          getRowId={(row) => row.id}
          loading={depositsQuery.isLoading}
          fetching={depositsQuery.isFetching && depositsQuery.isPlaceholderData}
          error={depositsQuery.error}
          onRetry={() => depositsQuery.refetch()}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('depositList.empty.title'),
            description: t('depositList.empty.description'),
            action: canEdit ? (
              <Button size="sm" onClick={() => setIsModalOpen(true)}>
                <Plus aria-hidden />
                {t('depositList.empty.action')}
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <VendorDepositModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* Conditional mount = fresh state per open; key ties to the deposit id
          so switching targets re-initializes form fields. */}
      {refundTarget && (
        <RefundVendorDepositModal
          key={refundTarget.id}
          isOpen={true}
          onClose={() => setRefundTarget(null)}
          deposit={{
            id: refundTarget.id,
            paymentNumber: refundTarget.paymentNumber,
            party: refundTarget.party ?? undefined,
            amount: num(refundTarget.amount),
            remaining: refundTarget.remaining,
          }}
        />
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) {
            cancelMutation.mutate(cancelTarget.id);
            setCancelTarget(null);
          }
        }}
        title={t('depositList.confirmCancel.title')}
        message={t('depositList.confirmCancel.message', { number: cancelTarget?.paymentNumber ?? '' })}
        confirmLabel={t('depositList.confirmCancel.confirm')}
        variant="danger"
      />
    </div>
  );
};
