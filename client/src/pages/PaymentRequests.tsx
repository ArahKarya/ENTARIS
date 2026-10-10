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
import { toast } from 'sonner';
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

function toExportRows(rows: PaymentRequestRow[]): Record<string, unknown>[] {
  return rows.map((r) => ({
    Nomor: r.number,
    Tanggal: formatDate(r.createdAt),
    Pengaju: r.requester.fullName,
    Jenis: r.type.name,
    Keperluan: r.purpose,
    Penerima: r.payeeName,
    'Dibutuhkan Tanggal': r.neededBy ? formatDate(r.neededBy) : '',
    Total: toNumber(r.totalAmount) ?? 0,
    Status: getStatusLabel(r.status, 'payment_request'),
    'Tanggal Bayar': r.paidAt ? formatDate(r.paidAt) : '',
  }));
}

function toAdvanceExportRows(rows: PaymentRequestRow[], overdueDays: number): Record<string, unknown>[] {
  return rows.map((r) => {
    const age = advanceAgeDays(r.paymentDate);
    return {
      Pengaju: r.requester.fullName,
      Nomor: r.number,
      Jenis: r.type.name,
      Keperluan: r.purpose,
      'Jumlah Uang Muka': toNumber(r.totalAmount) ?? 0,
      'Tanggal Bayar': r.paymentDate ? formatDate(r.paymentDate) : '',
      'Umur (hari)': age,
      [`Lewat ${overdueDays} hari`]: age > overdueDays ? 'Ya' : 'Tidak',
      'Status Pertanggungjawaban': getStatusLabel(r.settlementStatus, 'payment_request_settlement'),
    };
  });
}

function TabLabel({ label, count, suffix = 'menunggu' }: { label: string; count?: number; suffix?: string }) {
  return (
    <span className="relative inline-flex items-center gap-1.5">
      {label}
      {count ? (
        <span className="num rounded-sm bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
          {formatNumber(count)}
          <span className="sr-only"> {suffix}</span>
        </span>
      ) : null}
    </span>
  );
}

export const PaymentRequests = () => {
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
  const typeOptions = useMemo(() => (typesQuery.data ?? []).map((t) => ({ value: t.id, label: t.name })), [typesQuery.data]);

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
        header: 'Nomor',
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
        header: 'Pengaju',
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => row.original.requester.fullName,
      },
      {
        id: 'purpose',
        header: 'Keperluan',
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
            Uang Muka <span className="normal-case">(Rp)</span>
          </>
        ),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => <span className="font-medium text-foreground">{money(row.original.totalAmount)}</span>,
      },
      {
        id: 'paymentDate',
        header: 'Dibayar',
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (row.original.paymentDate ? formatDate(row.original.paymentDate) : '—'),
      },
      {
        id: 'age',
        header: 'Umur',
        meta: { align: 'right', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const age = advanceAgeDays(row.original.paymentDate);
          const late = age > overdueDays;
          return (
            <span className={late ? 'num font-semibold text-danger' : 'num text-foreground'}>
              {formatNumber(age)} hari
              {late && <span className="sr-only">, melewati batas {overdueDays} hari</span>}
            </span>
          );
        },
      },
      {
        id: 'settlementStatus',
        header: 'Pertanggungjawaban',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.settlementStatus} docType="payment_request_settlement" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={`Aksi untuk ${row.original.number}`}
            actions={[{ label: 'Lihat detail', icon: Eye, onSelect: () => navigate(`${PR_ENDPOINT}/${row.original.id}`) }]}
          />
        ),
      },
    ],
    [navigate, overdueDays],
  );
  const requestColumns = useMemo<ColumnDef<PaymentRequestRow>[]>(
    () => [
      {
        id: 'number',
        header: 'Nomor',
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
        header: 'Tanggal',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.createdAt),
      },
      ...(showRequester
        ? [
            {
              id: 'requester',
              header: 'Pengaju',
              enableSorting: true,
              meta: { hideBelow: 'lg' as const, cellClassName: 'whitespace-nowrap' },
              cell: ({ row }: { row: { original: PaymentRequestRow } }) => row.original.requester.fullName,
            },
          ]
        : []),
      {
        id: 'purpose',
        header: 'Keperluan',
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
        header: 'Dibutuhkan',
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (row.original.neededBy ? formatDate(row.original.neededBy) : '—'),
      },
      {
        id: 'totalAmount',
        header: () => (
          <>
            Total <span className="normal-case">(Rp)</span>
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
        header: 'Status',
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
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const r = row.original;
          const editable = r.requester.id === meta?.me?.id && (r.status === 'DRAFT' || r.status === 'REVISION');
          return (
            <RowActions
              label={`Aksi untuk ${r.number}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => navigate(`${PR_ENDPOINT}/${r.id}`) },
                { label: 'Ubah', icon: Pencil, hidden: !editable, onSelect: () => navigate(`${PR_ENDPOINT}/${r.id}/edit`) },
              ]}
            />
          );
        },
      },
    ],
    [navigate, showRequester, meta?.me?.id],
  );
  const columns = tab === 'advances' ? advanceColumns : requestColumns;

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportParams = { ...filterParams, ...(list.params.sort ? { sort: list.params.sort } : {}) };
      const { rows, truncated } = await fetchAllPages<PaymentRequestRow>(PR_ENDPOINT, exportParams);
      const day = new Date().toISOString().slice(0, 10);
      if (tab === 'advances') await exportToExcel(toAdvanceExportRows(rows, overdueDays), `uang-muka-karyawan-${day}`);
      else await exportToExcel(toExportRows(rows), `pengajuan-pembayaran-${day}`);
      if (truncated) toast.warning(`Ekspor dibatasi ${formatNumber(rows.length)} pengajuan pertama. Persempit filter.`);
    } catch {
      toast.error('Gagal mengekspor pengajuan. Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  const emptyByTab: Record<PrScope, { title: string; description: string }> = {
    mine: { title: 'Belum ada pengajuan', description: 'Ajukan reimbursement, uang muka, atau pembayaran vendor. Tidak perlu lagi lewat email dan Excel.' },
    approvals: { title: 'Tidak ada yang menunggu persetujuan Anda', description: 'Pengajuan yang perlu Anda setujui akan muncul di sini.' },
    payable: { title: 'Belum ada pengajuan siap dibayar', description: 'Pengajuan yang sudah disetujui lengkap akan muncul di sini.' },
    advances: { title: 'Tidak ada uang muka yang belum dipertanggungjawabkan', description: 'Uang muka dan perjalanan dinas yang sudah dibayar dan belum diselesaikan muncul di sini.' },
    all: { title: 'Belum ada pengajuan', description: 'Semua pengajuan pembayaran akan muncul di sini.' },
  };

  return (
    <Tabs value={tab} onValueChange={changeTab} activationMode="manual" className="space-y-5 pb-8">
      <PageHeader
        title="Pengajuan Pembayaran"
        description="Reimbursement, uang muka, perjalanan dinas, dan pembayaran vendor: diajukan, disetujui, dan dibayar di satu tempat."
        actions={
          <>
            {!isEam && (
              <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!listQuery.data?.total}>
                <Download aria-hidden />
                <span className="sr-only sm:not-sr-only">Ekspor Excel</span>
              </Button>
            )}
            <Button onClick={() => navigate(`${PR_ENDPOINT}/new`)}>
              <Plus aria-hidden />
              Buat Pengajuan
            </Button>
          </>
        }
      >
        <TabsList variant="underline" aria-label="Tampilan pengajuan" className="max-w-full">
            <TabsTrigger value="mine">Pengajuan Saya</TabsTrigger>
            <TabsTrigger value="approvals">
              <TabLabel label="Perlu Persetujuan" count={badges?.approvals} />
            </TabsTrigger>
            {meta?.isFinance && (
              <TabsTrigger value="payable">
                <TabLabel label="Siap Dibayar" count={badges?.payable} />
              </TabsTrigger>
            )}
            {meta?.isFinance && (
              <TabsTrigger value="eam">
                <TabLabel label="Tagihan EAM" count={eamBadge} suffix="menunggu posting" />
              </TabsTrigger>
            )}
            <TabsTrigger value="advances">
              <TabLabel label="Belum Dipertanggungjawabkan" count={advances?.overdueCount} suffix="lewat batas waktu" />
            </TabsTrigger>
            {meta?.canViewAll && <TabsTrigger value="all">Semua</TabsTrigger>}
        </TabsList>
      </PageHeader>

      <TabsContent value={tab} className="mt-0 space-y-5">
      {isEam ? (
        <Suspense fallback={<LoadingState label="Memuat daftar…" />}>
          <EamBillsTab />
        </Suspense>
      ) : (
      <>
      {tab === 'advances' ? (
        <>
          <section aria-label="Ringkasan uang muka karyawan" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Uang Muka Belum Selesai"
              icon={HandCoins}
              loading={!advances}
              value={advances ? kpiMoney(advances.amount) : '—'}
              valueTitle={advances ? formatRupiah(advances.amount) : undefined}
              hint={advances ? `${formatNumber(advances.count)} uang muka` : undefined}
            />
            <StatCard
              label={`Lewat ${overdueDays} Hari`}
              icon={AlarmClock}
              loading={!advances}
              value={advances ? formatNumber(advances.overdueCount) : '—'}
              hint={advances ? kpiMoney(advances.overdueAmount) : undefined}
            />
            <StatCard
              label="Karyawan"
              icon={Users}
              loading={!advances}
              value={advances ? formatNumber(advances.byEmployee.length) : '—'}
              hint="dengan uang muka terbuka"
            />
            <StatCard
              label="Terlama"
              icon={Hourglass}
              loading={!advances}
              value={advances ? `${formatNumber(Math.max(0, ...advances.byEmployee.map((e) => e.oldestDays)))} hari` : '—'}
              hint="sejak dibayar"
            />
          </section>
          {advances && advances.byEmployee.length > 0 && (meta?.isFinance || meta?.canViewAll || advances.byEmployee.length > 1) && (
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be focusable
            <section aria-label="Uang muka per karyawan" tabIndex={0} className="relative overflow-x-auto rounded-lg border border-border bg-card">
              <table className="w-full min-w-[28rem] text-sm">
                <caption className="sr-only">Uang muka belum dipertanggungjawabkan per karyawan</caption>
                <thead>
                  <tr className="border-b border-border bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="px-3 py-2 text-left font-medium">Karyawan</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Jumlah</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Nilai (Rp)</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Terlama</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {advances.byEmployee.map((e) => (
                    <tr key={e.employeeId}>
                      <th scope="row" className="px-3 py-2 text-left font-normal text-foreground">{e.name}</th>
                      <td className="num px-3 py-2 text-right">{formatNumber(e.count)}</td>
                      <td className="num px-3 py-2 text-right font-medium text-foreground">{money(e.amount)}</td>
                      <td className={`num px-3 py-2 text-right ${e.overdueCount > 0 ? 'font-semibold text-danger' : 'text-muted-foreground'}`}>
                        {formatNumber(e.oldestDays)} hari
                        {e.overdueCount > 0 && <span className="sr-only">, melewati batas</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </>
      ) : (
      <section aria-label="Ringkasan pengajuan sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Dalam Persetujuan"
          icon={Hourglass}
          loading={kpiLoading}
          value={summary ? formatNumber(inApproval.count) : '—'}
          hint={summary ? kpiMoney(inApproval.amount) : undefined}
        />
        <StatCard
          label="Siap Dibayar"
          icon={BadgeCheck}
          loading={kpiLoading}
          value={summary ? formatNumber(ready.count) : '—'}
          hint={summary ? kpiMoney(ready.amount) : undefined}
        />
        <StatCard
          label="Sudah Dibayar"
          icon={Banknote}
          loading={kpiLoading}
          value={summary ? kpiMoney(paid.amount) : '—'}
          valueTitle={summary ? formatRupiah(paid.amount) : undefined}
          hint={summary ? `${formatNumber(paid.count)} pengajuan` : undefined}
        />
        <StatCard
          label="Draf & Perlu Revisi"
          icon={FilePenLine}
          loading={kpiLoading}
          value={summary ? formatNumber(needsWork.count) : '—'}
          hint={summary && (byStatus.REVISION?.count ?? 0) > 0 ? `${formatNumber(byStatus.REVISION?.count ?? 0)} perlu revisi` : 'belum diajukan'}
        />
      </section>
      )}

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari pengajuan"
          searchPlaceholder="Cari nomor, keperluan, penerima, atau pengaju"
          status={
            tab === 'advances'
              ? { options: SETTLEMENT_FILTER, key: 'settlementStatus', label: 'Status pertanggungjawaban', allLabel: 'Semua status' }
              : { options: STATUS_FILTER }
          }
          dateRange={{ label: 'Rentang tanggal pengajuan' }}
        >
          <ComboboxFilter
            label="Filter jenis pengajuan"
            allLabel="Semua jenis"
            searchPlaceholder="Cari jenis…"
            value={list.filters.typeId}
            onChange={(v) => list.setFilter('typeId', v)}
            options={typeOptions}
            loading={typesQuery.isLoading}
            className={FILTER_CLASS}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, listQuery.data?.total)}
          label={tab === 'advances' ? 'Uang muka belum dipertanggungjawabkan' : 'Daftar pengajuan pembayaran'}
          itemLabel="pengajuan"
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
                  Buat pengajuan pertama
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
