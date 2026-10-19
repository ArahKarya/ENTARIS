/**
 * Queue of EAM costs (vehicle tax, service, spare-part MRs) waiting to be posted;
 * finance picks accounts and payment method. Requires payment_request edit
 * (gated by the parent page). Search, paging and sorting run server-side.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, ListFilter, Wallet, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { PR_ENDPOINT } from '../payment-request';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import { apiError } from '@/components/fixed-assets/errors';
import { EamBillPayDialog } from './EamBillPayDialog';
import { SelectFilter } from './SelectFilter';
import { useTranslation } from 'react-i18next';
import {
  BILL_KINDS,
  EAM_FILTER_KEYS,
  KIND_META,
  POSTING_OPTIONS,
  postingDefaultLabel,
  billState,
  isPosted,
  itemsSummary,
  type GaBill,
  type EamSummary,
} from './eam-bills';


const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

function KindChip({ bill, className }: { bill: GaBill; className?: string }) {
  const meta = KIND_META[bill.kind];
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs text-muted-foreground ${className ?? ''}`}>
      <Icon className="size-3.5 shrink-0" aria-hidden />
      {meta.short}
    </span>
  );
}

function BillStatus({ bill, className }: { bill: GaBill; className?: string }) {
  const { t } = useTranslation('eam');
  const state = billState(bill);
  const pi = bill.purchaseInvoice;
  const outstanding = pi?.outstanding !== undefined ? Number(pi.outstanding) : 0;
  return (
    <div className={`flex flex-col items-start gap-0.5 ${className ?? ''}`}>
      <StatusBadge status={state.label} label={state.label} tone={state.tone} />
      {state.doc && <span className="num font-mono text-xs text-muted-foreground">{state.doc}</span>}
      {!bill.journalEntry && pi && outstanding > 0 && (
        <span className="text-xs text-muted-foreground">{t('eamBills.tab.outstanding', { amount: formatRupiah(outstanding) })}</span>
      )}
    </div>
  );
}

export const EamBillsTab = () => {
  const { t } = useTranslation('eam');
  const kindOptions = useMemo(() => BILL_KINDS.map((kind) => ({ value: kind, label: KIND_META[kind].label })), []);
  const queryClient = useQueryClient();
  const list = useListState({ filters: EAM_FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [payTarget, setPayTarget] = useState<GaBill | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GaBill | null>(null);

  const params = { ...list.params, kind: list.filters.kind || undefined, posting: list.filters.posting || undefined };
  const filterParams = { ...list.filterParams, kind: list.filters.kind || undefined, posting: list.filters.posting || undefined };

  const billsQuery = useQuery({
    queryKey: ['payment-requests', 'eam', 'list', params],
    queryFn: async () => (await api.get<Paginated<GaBill>>(`${PR_ENDPOINT}/eam`, { params })).data,
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: ['payment-requests', 'eam', 'summary', filterParams],
    queryFn: async () => (await api.get<EamSummary>(`${PR_ENDPOINT}/eam/summary`, { params: filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['payment-requests', 'eam'] });
    queryClient.invalidateQueries({ queryKey: ['coa'] });
  };

  const cancelMutation = useMutation({
    mutationFn: (b: GaBill) => api.post(`${PR_ENDPOINT}/eam/${b.kind}/${b.id}/cancel`),
    onSuccess: () => {
      toast.success(t('eamBills.tab.cancelled'));
      invalidate();
    },
    onError: (e) => toast.error(apiError(e, t('eamBills.tab.cancelFailed'))),
  });

  const columns = useMemo<ColumnDef<GaBill>[]>(
    () => [
      {
        id: 'kind',
        header: t('eamBills.tab.kind'),
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => <KindChip bill={row.original} />,
      },
      {
        id: 'date',
        header: t('shared.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (row.original.date ? formatDate(row.original.date) : '—'),
      },
      {
        id: 'description',
        header: t('eamBills.tab.description'),
        meta: { cellClassName: 'min-w-0 max-w-48 sm:max-w-[22rem]' },
        cell: ({ row }) => {
          const b = row.original;
          const items = itemsSummary(b.items);
          return (
            <div className="min-w-0 space-y-0.5">
              <p className="line-clamp-2 font-medium break-words text-foreground" title={b.description}>
                {b.description}
              </p>
              {items && (
                <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden" title={items}>
                  {items}
                </p>
              )}
              {/* Mobile / tablet: asset, kind and date stacked here because their columns are hidden. */}
              <p className="truncate text-xs text-muted-foreground lg:hidden">
                {[b.assetName, b.date ? formatDate(b.date) : null].filter(Boolean).join(' · ')}
              </p>
              <KindChip bill={b} className="lg:hidden" />
            </div>
          );
        },
      },
      {
        id: 'asset',
        header: t('eamBills.tab.asset'),
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'min-w-36 max-w-56' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-foreground">{row.original.assetName ?? '—'}</p>
            {row.original.assetCode && (
              <p className="num truncate font-mono text-xs text-muted-foreground">{row.original.assetCode}</p>
            )}
          </div>
        ),
      },
      {
        id: 'amount',
        header: () => withUnit(t('eamBills.tab.amount')),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex flex-col items-end gap-1">
            <span className="font-semibold text-foreground">{formatRupiah(row.original.amount, { symbol: false })}</span>
            {/* Mobile: status stacked here because its column is hidden. */}
            <StatusBadge
              status={billState(row.original).label}
              label={billState(row.original).short}
              tone={billState(row.original).tone}
              className="sm:hidden"
            />
          </div>
        ),
      },
      {
        id: 'status',
        header: t('shared.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <BillStatus bill={row.original} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const b = row.original;
          const posted = isPosted(b);
          return (
            <RowActions
              label={t('shared.actionsFor', { name: b.ref })}
              actions={[
                {
                  label: t('eamBills.tab.pay'),
                  icon: Wallet,
                  hidden: posted,
                  onSelect: () => setPayTarget(b),
                },
                {
                  label: t('eamBills.tab.cancelPosting'),
                  icon: XCircle,
                  tone: 'danger',
                  hidden: !posted,
                  onSelect: () => setCancelTarget(b),
                },
              ]}
            />
          );
        },
      },
    ],
    [t],
  );

  const summary = summaryQuery.data;
  const kpiLoading = !summary && !summaryQuery.isError;

  return (
    <>
      <section aria-label={t('eamBills.tab.summaryLabel')} className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label={t('eamBills.tab.kpiPending')}
          icon={AlertCircle}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.pendingCount) : '—'}
          hint={t('eamBills.tab.kpiPendingHint')}
        />
        <StatCard
          label={t('eamBills.tab.kpiPendingAmount')}
          icon={Wallet}
          loading={kpiLoading}
          value={summary ? formatRupiah(summary.pendingAmount, { compact: true }) : '—'}
          valueTitle={summary ? formatRupiah(summary.pendingAmount) : undefined}
          hint={summary ? formatRupiah(summary.pendingAmount) : undefined}
        />
        <StatCard
          label={t('eamBills.tab.kpiMatched')}
          icon={list.filters.posting ? CheckCircle2 : ListFilter}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.matchedCount) : '—'}
          hint={summary ? t('eamBills.tab.kpiMatchedHint', { amount: formatRupiah(summary.matchedAmount) }) : undefined}
          className="col-span-2 lg:col-span-1"
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('eamBills.tab.searchLabel')}
          searchPlaceholder={t('eamBills.tab.searchPlaceholder')}
          status={{ key: 'posting', label: t('eamBills.tab.postingStatus'), options: POSTING_OPTIONS, allLabel: postingDefaultLabel() }}
          dateRange
        >
          <SelectFilter
            label={t('eamBills.tab.kindFilter')}
            value={list.filters.kind}
            onChange={(v) => list.setFilter('kind', v)}
            options={kindOptions}
            allLabel={t('eamBills.tab.allKinds')}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, billsQuery.data?.total)}
          label={t('eamBills.tab.tableLabel')}
          itemLabel={t('eamBills.tab.itemLabel')}
          columns={columns}
          data={billsQuery.data?.data}
          getRowId={(row) => `${row.kind}-${row.id}`}
          loading={billsQuery.isLoading}
          fetching={billsQuery.isFetching && billsQuery.isPlaceholderData}
          error={billsQuery.error}
          onRetry={() => billsQuery.refetch()}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('eamBills.tab.emptyTitle'),
            description: t('eamBills.tab.emptyDescription'),
          }}
        />
      </div>

      <EamBillPayDialog
        bill={payTarget}
        onClose={() => setPayTarget(null)}
        onSuccess={() => {
          setPayTarget(null);
          invalidate();
          queryClient.invalidateQueries({ queryKey: ['payments'] });
        }}
      />

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        tone="danger"
        title={t('eamBills.tab.cancelTitle')}
        description={
          cancelTarget
            ? t('eamBills.tab.cancelDescription', { name: cancelTarget.description })
            : undefined
        }
        confirmLabel={t('eamBills.tab.confirmCancel')}
        loading={cancelMutation.isPending}
        onConfirm={async () => {
          if (!cancelTarget) return;
          await cancelMutation.mutateAsync(cancelTarget);
        }}
      />
    </>
  );
};

export default EamBillsTab;
