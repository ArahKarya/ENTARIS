/**
 * Payment requests (/payment-requests), filed by every logged-in user. Tabs: mine (everyone),
 * approvals (my pending decisions), payable and eam (finance only), advances (own; all for finance),
 * all (payment_request view only).
 */
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlarmClock, BadgeCheck, Download, Eye, FilePenLine, HandCoins, Hourglass, Pencil, Plus, Users, Banknote } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import i18n from '@/i18n';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { getStatusLabel, statusOptions } from '@/lib/status';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import type { EamSummary } from '@/components/payment-requests/eam/eam-bills';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ComboboxFilter,
  LoadingState,
  DataTable,
  DocumentLink,
  FilterBar,
  PageHeader,
  RowActions,
  StatCard,
  StatusBadge,
  fetchAllPages,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import {
  PR_ENDPOINT,
  PR_STATUSES,
  SETTLEMENT_STATUSES,
  advanceAgeDays,
  formatMoney,
  type AdvanceSummary,
  type PaymentRequestMeta,
  type PaymentRequestRow,
  type PaymentRequestSummary,
  type PaymentRequestType,
  type PrScope,
  type PrStatus,
} from '@/components/payment-requests/payment-request';

const EamBillsTab = lazy(() => import('@/components/payment-requests/eam/EamBillsTab'));

const TAB_PARAM = 'tab';
type Tab = PrScope | 'eam';
const FILTER_KEYS = ['status', 'settlementStatus', 'typeId', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(PR_STATUSES, 'payment_request');
const SETTLEMENT_FILTER = statusOptions(SETTLEMENT_STATUSES, 'payment_request_settlement');
const FILTER_CLASS = 'w-[calc(50%-0.25rem)] sm:w-48';
const IN_APPROVAL: PrStatus[] = ['SUBMITTED', 'PENDING_FINANCE', 'PENDING_DIRECTOR'];

const money = (v: string | number | null | undefined) => formatMoney(v, { symbol: false });

type ExportColumn =
  | 'number'
  | 'date'
  | 'requester'
  | 'type'
  | 'purpose'
  | 'payee'
  | 'neededBy'
  | 'total'
  | 'status'
  | 'paidAt'
  | 'advanceAmount'
  | 'age'
  | 'settlementStatus';

const col = (key: ExportColumn) => i18n.t(`finance:paymentRequests.export.${key}`);

function toExportRows(rows: PaymentRequestRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    [col('number')]: r.number,
    [col('date')]: formatDate(r.createdAt),
    [col('requester')]: r.requester.fullName,
    [col('type')]: r.type.name,
    [col('purpose')]: r.purpose,
    [col('payee')]: r.payeeName,
    [col('neededBy')]: r.neededBy ? formatDate(r.neededBy) : '',
    [col('total')]: toNumber(r.totalAmount) ?? 0,
    [col('status')]: getStatusLabel(r.status, 'payment_request'),
    [col('paidAt')]: r.paidAt ? formatDate(r.paidAt) : '',
  }));
}

function toAdvanceExportRows(rows: PaymentRequestRow[], overdueDays: number): Record<string, unknown>[] {
  return rows.map((r) => {
    const age = advanceAgeDays(r.paymentDate);
    return {
      [col('requester')]: r.requester.fullName,
      [col('number')]: r.number,
      [col('type')]: r.type.name,
      [col('purpose')]: r.purpose,
      [col('advanceAmount')]: toNumber(r.totalAmount) ?? 0,
      [col('paidAt')]: r.paymentDate ? formatDate(r.paymentDate) : '',
      [col('age')]: age,
      [i18n.t('finance:paymentRequests.export.overdue', { days: overdueDays })]:
        age > overdueDays ? i18n.t('finance:paymentRequests.export.yes') : i18n.t('finance:paymentRequests.export.no'),
      [col('settlementStatus')]: getStatusLabel(r.settlementStatus, 'payment_request_settlement'),
    };
  });
}

function TabLabel({ label, count, suffix }: { label: string; count?: number; suffix?: string }) {
  const { t } = useTranslation('finance');
  return (
    <span className="relative inline-flex items-center gap-1.5">
      {label}
      {count ? (
        <span className="num rounded-sm bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
          {formatNumber(count)}
          <span className="sr-only"> {suffix ?? t('paymentRequests.tabs.waiting')}</span>
        </span>
      ) : null}
    </span>
  );
}

export const PaymentRequests = () => {
  const { t } = useTranslation('finance');
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'createdAt', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [exporting, setExporting] = useState(false);

  const metaQuery = useQuery({
    queryKey: ['payment-requests', 'meta'],
    queryFn: async () => (await api.get<PaymentRequestMeta>(`${PR_ENDPOINT}/meta`)).data,
    staleTime: 30_000,
  });
  const meta = metaQuery.data;

  const allowedTabs = useMemo<Tab[]>(() => {
    const tabs: Tab[] = ['mine', 'approvals'];
    if (meta?.isFinance) tabs.push('payable', 'eam');
    tabs.push('advances');
    if (meta?.canViewAll) tabs.push('all');
    return tabs;
  }, [meta?.isFinance, meta?.canViewAll]);
  const rawTab = searchParams.get(TAB_PARAM) as Tab | null;
  const tab: Tab = rawTab && allowedTabs.includes(rawTab) ? rawTab : 'mine';

  const changeTab = (next: string) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'mine') params.delete(TAB_PARAM);
      else params.set(TAB_PARAM, next);
      params.delete('page');
      params.delete('sort');
      params.delete('status');
      params.delete('settlementStatus');
      if (next !== 'eam') ['kind', 'posting'].forEach((k) => params.delete(k));
      return params;
    });
  };

  // Open advances: oldest first unless the user picked another order.
  const { setSort } = list;
  const hasSort = searchParams.has('sort');
  useEffect(() => {
    if (tab === 'advances' && !hasSort) setSort({ id: 'paymentDate', desc: false });
  }, [tab, hasSort, setSort]);

  const isEam = tab === 'eam';
  const scope: PrScope = isEam ? 'mine' : tab;
  const params = { ...list.params, scope };
  const filterParams = { ...list.filterParams, scope };

  const listQuery = useQuery({
    queryKey: ['payment-requests', 'list', params],
    queryFn: async () => (await api.get<Paginated<PaymentRequestRow>>(PR_ENDPOINT, { params })).data,
    placeholderData: keepPreviousData,
    enabled: !isEam && (!!meta || rawTab === null || rawTab === 'mine'),
  });

  const summaryQuery = useQuery({
    queryKey: ['payment-requests', 'summary', filterParams],
    queryFn: async () => (await api.get<PaymentRequestSummary>(`${PR_ENDPOINT}/summary`, { params: filterParams })).data,
    placeholderData: keepPreviousData,
    enabled: !isEam && (!!meta || rawTab === null || rawTab === 'mine'),
  });

  // Tab badge: unposted EAM bills (finance only; same endpoint/cache as the tab KPI).
  const eamBadgeQuery = useQuery({
    queryKey: ['payment-requests', 'eam', 'summary', {}],
    queryFn: async () => (await api.get<EamSummary>(`${PR_ENDPOINT}/eam/summary`)).data,
    enabled: !!meta?.isFinance,
    staleTime: 30_000,
  });
  const eamBadge = eamBadgeQuery.data?.pendingCount;

  const advancesQuery = useQuery({
    queryKey: ['payment-requests', 'advances-summary'],
    queryFn: async () => (await api.get<AdvanceSummary>(`${PR_ENDPOINT}/advances/summary`)).data,
    staleTime: 30_000,
  });
  const advances = advancesQuery.data;
  const overdueDays = advances?.overdueDays ?? meta?.overdueDays ?? 14;

  const typesQuery = useQuery({
    queryKey: ['payment-request-types', 'active'],
    queryFn: async () => (await api.get<PaymentRequestType[]>('/payment-request-types')).data,
    staleTime: 5 * 60_000,
  });
  const typeOptions = useMemo(() => (typesQuery.data ?? []).map((type) => ({ value: type.id, label: type.name })), [typesQuery.data]);

  const summary = summaryQuery.data;
  const badges = summary?.badges ?? meta?.badges;
  const byStatus = summary?.byStatus ?? {};
  const sumOf = (statuses: PrStatus[]) =>
    statuses.reduce(
      (acc, s) => ({ count: acc.count + (byStatus[s]?.count ?? 0), amount: acc.amount + (byStatus[s]?.amount ?? 0) }),
      { count: 0, amount: 0 },
    );
  const inApproval = sumOf(IN_APPROVAL);
  const ready = sumOf(['APPROVED']);
  const paid = sumOf(['PAID']);
  const needsWork = sumOf(['DRAFT', 'REVISION']);
  const kpiLoading = !summary && !summaryQuery.isError;
  const kpiMoney = (v: number) => formatRupiah(v, { compact: true });

  const showRequester = tab !== 'mine';
  const advanceColumns = useMemo<ColumnDef<PaymentRequestRow>[]>(
    () => [
      {
        id: 'number',
        header: t('paymentRequests.columns.number'),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <DocumentLink onClick={() => navigate(`${PR_ENDPOINT}/${r.id}`)}>{r.number}</DocumentLink>
              <span className="max-w-44 truncate text-sm text-foreground sm:hidden">{r.requester.fullName}</span>
            </div>
          );
        },
      },
      {
        id: 'requester',
        header: t('paymentRequests.columns.requester'),
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => row.original.requester.fullName,
      },
      {
        id: 'purpose',
        header: t('paymentRequests.columns.purpose'),
        meta: { hideBelow: 'lg', cellClassName: 'min-w-48 max-w-80' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground" title={row.original.purpose}>{row.original.purpose}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.type.name}</p>
          </div>
        ),
      },
      {
        id: 'totalAmount',
        header: () => (
          <>
            {t('paymentRequests.columns.advance')} <span className="normal-case">(Rp)</span>
          </>
        ),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => <span className="font-medium text-foreground">{money(row.original.totalAmount)}</span>,
      },
      {
        id: 'paymentDate',
        header: t('paymentRequests.columns.paid'),
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (row.original.paymentDate ? formatDate(row.original.paymentDate) : '—'),
      },
      {
        id: 'age',
        header: t('paymentRequests.columns.age'),
        meta: { align: 'right', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const age = advanceAgeDays(row.original.paymentDate);
          const late = age > overdueDays;
          return (
            <span className={late ? 'num font-semibold text-danger' : 'num text-foreground'}>
              {t('paymentRequests.days', { count: age })}
              {late && <span className="sr-only">{t('paymentRequests.pastLimit', { days: overdueDays })}</span>}
            </span>
          );
        },
      },
      {
        id: 'settlementStatus',
        header: t('paymentRequests.columns.settlement'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.settlementStatus} docType="payment_request_settlement" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('paymentRequests.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={t('paymentRequests.rowActions', { number: row.original.number })}
            actions={[{ label: t('paymentRequests.actions.view'), icon: Eye, onSelect: () => navigate(`${PR_ENDPOINT}/${row.original.id}`) }]}
          />
        ),
      },
    ],
    [navigate, overdueDays, t],
  );
  const requestColumns = useMemo<ColumnDef<PaymentRequestRow>[]>(
    () => [
      {
        id: 'number',
        header: t('paymentRequests.columns.number'),
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <DocumentLink onClick={() => navigate(`${PR_ENDPOINT}/${r.id}`)}>{r.number}</DocumentLink>
              <span className="max-w-44 truncate text-sm text-foreground sm:hidden">{r.purpose}</span>
              <span className="num text-xs text-muted-foreground md:hidden">{formatDate(r.createdAt)}</span>
            </div>
          );
        },
      },
      {
        id: 'createdAt',
        header: t('paymentRequests.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      ...(showRequester
        ? [
            {
              id: 'requester',
              header: t('paymentRequests.columns.requester'),
              enableSorting: true,
              meta: { hideBelow: 'lg' as const, cellClassName: 'whitespace-nowrap' },
              cell: ({ row }: { row: { original: PaymentRequestRow } }) => row.original.requester.fullName,
            },
          ]
        : []),
      {
        id: 'purpose',
        header: t('paymentRequests.columns.purpose'),
        meta: { hideBelow: 'sm', cellClassName: 'min-w-48 max-w-96' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground" title={r.purpose}>{r.purpose}</p>
              <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                {r.type.name} · {r.payeeName}
              </p>
            </div>
          );
        },
      },
      {
        id: 'neededBy',
        header: t('paymentRequests.columns.neededBy'),
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (row.original.neededBy ? formatDate(row.original.neededBy) : '—'),
      },
      {
        id: 'totalAmount',
        header: () => (
          <>
            {t('paymentRequests.columns.total')} <span className="normal-case">(Rp)</span>
          </>
        ),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex flex-col items-end gap-1">
            <span className="font-medium text-foreground">{money(row.original.totalAmount)}</span>
            <StatusBadge status={row.original.status} docType="payment_request" className="sm:hidden" />
          </div>
        ),
      },
      {
        id: 'status',
        header: t('paymentRequests.columns.status'),
        enableSorting: true,
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <StatusBadge status={row.original.status} docType="payment_request" />
            {row.original.status === 'PAID' && row.original.settlementStatus && (
              <StatusBadge status={row.original.settlementStatus} docType="payment_request_settlement" />
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('paymentRequests.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const r = row.original;
          const editable = r.requester.id === meta?.me?.id && (r.status === 'DRAFT' || r.status === 'REVISION');
          return (
            <RowActions
              label={t('paymentRequests.rowActions', { number: r.number })}
              actions={[
                { label: t('paymentRequests.actions.view'), icon: Eye, onSelect: () => navigate(`${PR_ENDPOINT}/${r.id}`) },
                { label: t('paymentRequests.actions.edit'), icon: Pencil, hidden: !editable, onSelect: () => navigate(`${PR_ENDPOINT}/${r.id}/edit`) },
              ]}
            />
          );
        },
      },
    ],
    [navigate, showRequester, meta?.me?.id, t],
  );
  const columns = tab === 'advances' ? advanceColumns : requestColumns;

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportParams = { ...filterParams, ...(list.params.sort ? { sort: list.params.sort } : {}) };
      const { rows, truncated } = await fetchAllPages<PaymentRequestRow>(PR_ENDPOINT, exportParams);
      const day = new Date().toISOString().slice(0, 10);
      if (tab === 'advances') await exportToExcel(toAdvanceExportRows(rows, overdueDays), `${t('paymentRequests.exportFile.advances')}-${day}`);
      else await exportToExcel(toExportRows(rows), `${t('paymentRequests.exportFile.requests')}-${day}`);
      if (truncated) toast.warning(t('paymentRequests.toast.exportTruncated', { count: rows.length }));
    } catch {
      toast.error(t('paymentRequests.toast.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const emptyByTab: Record<PrScope, { title: string; description: string }> = {
    mine: { title: t('paymentRequests.empty.mine.title'), description: t('paymentRequests.empty.mine.description') },
    approvals: { title: t('paymentRequests.empty.approvals.title'), description: t('paymentRequests.empty.approvals.description') },
    payable: { title: t('paymentRequests.empty.payable.title'), description: t('paymentRequests.empty.payable.description') },
    advances: { title: t('paymentRequests.empty.advances.title'), description: t('paymentRequests.empty.advances.description') },
    all: { title: t('paymentRequests.empty.all.title'), description: t('paymentRequests.empty.all.description') },
  };

  return (
    <Tabs value={tab} onValueChange={changeTab} activationMode="manual" className="space-y-5 pb-8">
      <PageHeader
        title={t('paymentRequests.title')}
        description={t('paymentRequests.description')}
        actions={
          <>
            {!isEam && (
              <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!listQuery.data?.total}>
                <Download aria-hidden />
                <span className="sr-only sm:not-sr-only">{t('paymentRequests.exportExcel')}</span>
              </Button>
            )}
            <Button onClick={() => navigate(`${PR_ENDPOINT}/new`)}>
              <Plus aria-hidden />
              {t('paymentRequests.create')}
            </Button>
          </>
        }
      >
        <TabsList variant="underline" aria-label={t('paymentRequests.tabs.label')} className="max-w-full">
            <TabsTrigger value="mine">{t('paymentRequests.tabs.mine')}</TabsTrigger>
            <TabsTrigger value="approvals">
              <TabLabel label={t('paymentRequests.tabs.approvals')} count={badges?.approvals} />
            </TabsTrigger>
            {meta?.isFinance && (
              <TabsTrigger value="payable">
                <TabLabel label={t('paymentRequests.tabs.payable')} count={badges?.payable} />
              </TabsTrigger>
            )}
            {meta?.isFinance && (
              <TabsTrigger value="eam">
                <TabLabel label={t('paymentRequests.tabs.eam')} count={eamBadge} suffix={t('paymentRequests.tabs.waitingPosting')} />
              </TabsTrigger>
            )}
            <TabsTrigger value="advances">
              <TabLabel label={t('paymentRequests.tabs.advances')} count={advances?.overdueCount} suffix={t('paymentRequests.tabs.overdue')} />
            </TabsTrigger>
            {meta?.canViewAll && <TabsTrigger value="all">{t('paymentRequests.tabs.all')}</TabsTrigger>}
        </TabsList>
      </PageHeader>

      <TabsContent value={tab} className="mt-0 space-y-5">
      {isEam ? (
        <Suspense fallback={<LoadingState label={t('paymentRequests.loadingList')} />}>
          <EamBillsTab />
        </Suspense>
      ) : (
      <>
      {tab === 'advances' ? (
        <>
          <section aria-label={t('paymentRequests.advances.summary')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t('paymentRequests.advances.open')}
              icon={HandCoins}
              loading={!advances}
              value={advances ? kpiMoney(advances.amount) : '—'}
              valueTitle={advances ? formatRupiah(advances.amount) : undefined}
              hint={advances ? t('paymentRequests.advances.count', { count: advances.count }) : undefined}
            />
            <StatCard
              label={t('paymentRequests.advances.overdue', { days: overdueDays })}
              icon={AlarmClock}
              loading={!advances}
              value={advances ? formatNumber(advances.overdueCount) : '—'}
              hint={advances ? kpiMoney(advances.overdueAmount) : undefined}
            />
            <StatCard
              label={t('paymentRequests.advances.employees')}
              icon={Users}
              loading={!advances}
              value={advances ? formatNumber(advances.byEmployee.length) : '—'}
              hint={t('paymentRequests.advances.employeesHint')}
            />
            <StatCard
              label={t('paymentRequests.advances.oldest')}
              icon={Hourglass}
              loading={!advances}
              value={advances ? t('paymentRequests.days', { count: Math.max(0, ...advances.byEmployee.map((e) => e.oldestDays)) }) : '—'}
              hint={t('paymentRequests.advances.oldestHint')}
            />
          </section>
          {advances && advances.byEmployee.length > 0 && (meta?.isFinance || meta?.canViewAll || advances.byEmployee.length > 1) && (
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be focusable
            <section aria-label={t('paymentRequests.advances.byEmployee')} tabIndex={0} className="relative overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[28rem] text-sm">
                <caption className="sr-only">{t('paymentRequests.advances.byEmployeeCaption')}</caption>
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-3 py-2 text-left font-medium">{t('paymentRequests.advances.columns.employee')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('paymentRequests.advances.columns.count')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('paymentRequests.advances.columns.amount')}</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">{t('paymentRequests.advances.columns.oldest')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {advances.byEmployee.map((e) => (
                    <tr key={e.employeeId}>
                      <th scope="row" className="px-3 py-2 text-left font-normal text-foreground">{e.name}</th>
                      <td className="num px-3 py-2 text-right">{formatNumber(e.count)}</td>
                      <td className="num px-3 py-2 text-right font-medium text-foreground">{money(e.amount)}</td>
                      <td className={`num px-3 py-2 text-right ${e.overdueCount > 0 ? 'font-semibold text-danger' : 'text-muted-foreground'}`}>
                        {t('paymentRequests.days', { count: e.oldestDays })}
                        {e.overdueCount > 0 && <span className="sr-only">{t('paymentRequests.pastLimitShort')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      ) : (
      <section aria-label={t('paymentRequests.summary.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('paymentRequests.summary.inApproval')}
          icon={Hourglass}
          loading={kpiLoading}
          value={summary ? formatNumber(inApproval.count) : '—'}
          hint={summary ? kpiMoney(inApproval.amount) : undefined}
        />
        <StatCard
          label={t('paymentRequests.summary.ready')}
          icon={BadgeCheck}
          loading={kpiLoading}
          value={summary ? formatNumber(ready.count) : '—'}
          hint={summary ? kpiMoney(ready.amount) : undefined}
        />
        <StatCard
          label={t('paymentRequests.summary.paid')}
          icon={Banknote}
          loading={kpiLoading}
          value={summary ? kpiMoney(paid.amount) : '—'}
          valueTitle={summary ? formatRupiah(paid.amount) : undefined}
          hint={summary ? t('paymentRequests.summary.requests', { count: paid.count }) : undefined}
        />
        <StatCard
          label={t('paymentRequests.summary.needsWork')}
          icon={FilePenLine}
          loading={kpiLoading}
          value={summary ? formatNumber(needsWork.count) : '—'}
          hint={summary && (byStatus.REVISION?.count ?? 0) > 0 ? t('paymentRequests.summary.needsRevision', { count: byStatus.REVISION?.count ?? 0 }) : t('paymentRequests.summary.notSubmitted')}
        />
      </section>
      )}

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('paymentRequests.filters.searchLabel')}
          searchPlaceholder={t('paymentRequests.filters.searchPlaceholder')}
          status={
            tab === 'advances'
              ? { options: SETTLEMENT_FILTER, key: 'settlementStatus', label: t('paymentRequests.filters.settlementStatus'), allLabel: t('paymentRequests.filters.allStatuses') }
              : { options: STATUS_FILTER }
          }
          dateRange={{ label: t('paymentRequests.filters.dateRange') }}
        >
          <ComboboxFilter
            label={t('paymentRequests.filters.type')}
            allLabel={t('paymentRequests.filters.allTypes')}
            searchPlaceholder={t('paymentRequests.filters.typeSearch')}
            value={list.filters.typeId}
            onChange={(v) => list.setFilter('typeId', v)}
            options={typeOptions}
            loading={typesQuery.isLoading}
            className={FILTER_CLASS}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, listQuery.data?.total)}
          label={tab === 'advances' ? t('paymentRequests.table.advances') : t('paymentRequests.table.requests')}
          itemLabel={t('paymentRequests.table.itemLabel')}
          columns={columns}
          data={listQuery.data?.data}
          getRowId={(row) => row.id}
          loading={listQuery.isLoading}
          fetching={listQuery.isFetching && listQuery.isPlaceholderData}
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
          onRowClick={(row) => navigate(`${PR_ENDPOINT}/${row.id}`)}
          rowClassName={(row) =>
            row.status === 'CANCELLED' || row.status === 'REJECTED'
              ? 'text-muted-foreground'
              : tab === 'advances' && advanceAgeDays(row.paymentDate) > overdueDays
                ? 'bg-danger/5'
                : undefined
          }
          density={density}
          onDensityChange={setDensity}
          empty={{
            ...emptyByTab[tab],
            action:
              tab === 'mine' ? (
                <Button size="sm" onClick={() => navigate(`${PR_ENDPOINT}/new`)}>
                  <Plus aria-hidden />
                  {t('paymentRequests.empty.action')}
                </Button>
              ) : undefined,
          }}
        />
      </div>
      </>
      )}
      </TabsContent>
    </Tabs>
  );
};
