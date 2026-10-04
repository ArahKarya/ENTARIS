/**
 * Pengajuan Pembayaran (/payment-requests) — every logged-in user files
 * reimbursements, vendor payments, cash advances, travel and other payment
 * requests here instead of a personal Excel sheet + email.
 *
 * Tabs (?tab=, kept in the URL next to the list-kit params):
 *   mine       Pengajuan Saya           — own requests (everyone)
 *   approvals  Perlu Persetujuan        — waiting for MY decision (supervisor / finance / director)
 *   payable    Siap Dibayar             — APPROVED, finance only
 *   all        Semua                    — payment_request view only
 * Built on the list kit (see pages/SalesInvoices.tsx for the reference pattern).
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { BadgeCheck, CircleDollarSign, Download, Eye, FilePenLine, Hourglass, Pencil, Plus } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { getStatusLabel, statusOptions } from '@/lib/status';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ComboboxFilter,
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
  formatMoney,
  type PaymentRequestMeta,
  type PaymentRequestRow,
  type PaymentRequestSummary,
  type PaymentRequestType,
  type PrScope,
  type PrStatus,
} from '@/components/payment-requests/payment-request';

const TAB_PARAM = 'tab';
const FILTER_KEYS = ['status', 'typeId', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(PR_STATUSES, 'payment_request');
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

function TabLabel({ label, count }: { label: string; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {count ? (
        <span className="num rounded-full bg-primary px-1.5 py-0.5 text-[11px] font-semibold leading-none text-primary-foreground">
          {formatNumber(count)}
          <span className="sr-only"> menunggu</span>
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

  const allowedTabs = useMemo<PrScope[]>(() => {
    const tabs: PrScope[] = ['mine', 'approvals'];
    if (meta?.isFinance) tabs.push('payable');
    if (meta?.canViewAll) tabs.push('all');
    return tabs;
  }, [meta?.isFinance, meta?.canViewAll]);
  const rawTab = searchParams.get(TAB_PARAM) as PrScope | null;
  const tab: PrScope = rawTab && allowedTabs.includes(rawTab) ? rawTab : 'mine';

  const changeTab = (next: string) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      if (next === 'mine') params.delete(TAB_PARAM);
      else params.set(TAB_PARAM, next);
      params.delete('page');
      return params;
    });
  };

  const params = { ...list.params, scope: tab };
  const filterParams = { ...list.filterParams, scope: tab };

  const listQuery = useQuery({
    queryKey: ['payment-requests', 'list', params],
    queryFn: async () => (await api.get<Paginated<PaymentRequestRow>>(PR_ENDPOINT, { params })).data,
    placeholderData: keepPreviousData,
    enabled: !!meta || rawTab === null || rawTab === 'mine',
  });

  const summaryQuery = useQuery({
    queryKey: ['payment-requests', 'summary', filterParams],
    queryFn: async () => (await api.get<PaymentRequestSummary>(`${PR_ENDPOINT}/summary`, { params: filterParams })).data,
    placeholderData: keepPreviousData,
    enabled: !!meta || rawTab === null || rawTab === 'mine',
  });

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
  const columns = useMemo<ColumnDef<PaymentRequestRow>[]>(
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
        cell: ({ row }) => (row.original.neededBy ? formatDate(row.original.neededBy) : '-'),
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
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="payment_request" />,
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

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportParams = { ...filterParams, ...(list.params.sort ? { sort: list.params.sort } : {}) };
      const { rows, truncated } = await fetchAllPages<PaymentRequestRow>(PR_ENDPOINT, exportParams);
      await exportToExcel(toExportRows(rows), `pengajuan-pembayaran-${new Date().toISOString().slice(0, 10)}`);
      if (truncated) toast.warning(`Ekspor dibatasi ${formatNumber(rows.length)} pengajuan pertama. Persempit filter.`);
    } catch {
      toast.error('Gagal mengekspor pengajuan. Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  const emptyByTab: Record<PrScope, { title: string; description: string }> = {
    mine: { title: 'Belum ada pengajuan', description: 'Ajukan reimbursement, uang muka, atau pembayaran vendor — tidak perlu lagi lewat email dan Excel.' },
    approvals: { title: 'Tidak ada yang menunggu persetujuan Anda', description: 'Pengajuan yang perlu Anda setujui akan muncul di sini.' },
    payable: { title: 'Belum ada pengajuan siap dibayar', description: 'Pengajuan yang sudah disetujui lengkap akan muncul di sini.' },
    all: { title: 'Belum ada pengajuan', description: 'Semua pengajuan pembayaran akan muncul di sini.' },
  };

  return (
    <Tabs value={tab} onValueChange={changeTab} activationMode="manual" className="space-y-5 pb-8">
      <PageHeader
        title="Pengajuan Pembayaran"
        description="Reimbursement, uang muka, perjalanan dinas, dan pembayaran vendor — diajukan, disetujui, dan dibayar di satu tempat."
        actions={
          <>
            <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!listQuery.data?.total}>
              <Download aria-hidden />
              <span className="sr-only sm:not-sr-only">Ekspor Excel</span>
            </Button>
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
            {meta?.canViewAll && <TabsTrigger value="all">Semua</TabsTrigger>}
        </TabsList>
      </PageHeader>

      <TabsContent value={tab} className="mt-0 space-y-5">
      <section aria-label="Ringkasan pengajuan sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Dalam Persetujuan"
          icon={Hourglass}
          loading={kpiLoading}
          value={summary ? formatNumber(inApproval.count) : '-'}
          hint={summary ? kpiMoney(inApproval.amount) : undefined}
        />
        <StatCard
          label="Siap Dibayar"
          icon={BadgeCheck}
          loading={kpiLoading}
          value={summary ? formatNumber(ready.count) : '-'}
          hint={summary ? kpiMoney(ready.amount) : undefined}
        />
        <StatCard
          label="Sudah Dibayar"
          icon={CircleDollarSign}
          loading={kpiLoading}
          value={summary ? kpiMoney(paid.amount) : '-'}
          valueTitle={summary ? formatRupiah(paid.amount) : undefined}
          hint={summary ? `${formatNumber(paid.count)} pengajuan` : undefined}
        />
        <StatCard
          label="Draf & Perlu Revisi"
          icon={FilePenLine}
          loading={kpiLoading}
          value={summary ? formatNumber(needsWork.count) : '-'}
          hint={summary && (byStatus.REVISION?.count ?? 0) > 0 ? `${formatNumber(byStatus.REVISION?.count ?? 0)} perlu revisi` : 'belum diajukan'}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari pengajuan"
          searchPlaceholder="Cari nomor, keperluan, penerima, atau pengaju"
          status={{ options: STATUS_FILTER }}
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
          label="Daftar pengajuan pembayaran"
          itemLabel="pengajuan"
          columns={columns}
          data={listQuery.data?.data}
          getRowId={(row) => row.id}
          loading={listQuery.isLoading}
          fetching={listQuery.isFetching && listQuery.isPlaceholderData}
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
          onRowClick={(row) => navigate(`${PR_ENDPOINT}/${row.id}`)}
          rowClassName={(row) => (row.status === 'CANCELLED' || row.status === 'REJECTED' ? 'text-muted-foreground' : undefined)}
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
      </TabsContent>
    </Tabs>
  );
};
