/**
 * Tagihan Aset & Umum (/ga/finance) — queue of EAM costs (vehicle tax / STNK /
 * KIR, vehicle service, spare-part material requests) waiting to be posted to
 * the ERP books. HRGA submits and approves them in EAM; this page is the
 * accounting side only: choose the accounts and payment method, then post.
 *
 * Phase 3 list kit (see pages/SalesInvoices.tsx). GET /ga/finance/bills
 * returns the whole queue for a kind at once, so search, date range, sorting
 * and paging run on the client (components/ga-finance/ga-bills.ts); all of it
 * lives in the URL via useListState. The default view is the queue (not yet
 * posted), exactly what the page always showed.
 *
 * Posting / cancelling needs the `ga_finance` edit permission.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, CheckCircle2, ListFilter, Wallet, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { can } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  PageHeader,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
} from '@/components/shared';
import { apiError } from '@/components/fixed-assets/errors';
import { GaBillPayDialog } from '@/components/ga-finance/GaBillPayDialog';
import { SelectFilter } from '@/components/ga-finance/SelectFilter';
import {
  BILL_KINDS,
  GA_FILTER_KEYS,
  KIND_META,
  POSTING_DEFAULT_LABEL,
  POSTING_OPTIONS,
  billState,
  billsRequestParams,
  filterBills,
  isPosted,
  itemsSummary,
  sortBills,
  sumAmount,
  type GaBill,
  type GaBillsResponse,
} from '@/components/ga-finance/ga-bills';

const KIND_OPTIONS = BILL_KINDS.map((k) => ({ value: k, label: KIND_META[k].label }));

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
  const state = billState(bill);
  const pi = bill.purchaseInvoice;
  const outstanding = pi?.outstanding !== undefined ? Number(pi.outstanding) : 0;
  return (
    <div className={`flex flex-col items-start gap-0.5 ${className ?? ''}`}>
      <StatusBadge status={state.label} label={state.label} tone={state.tone} />
      {state.doc && <span className="num font-mono text-xs text-muted-foreground">{state.doc}</span>}
      {!bill.journalEntry && pi && outstanding > 0 && (
        <span className="text-xs text-muted-foreground">sisa {formatRupiah(outstanding)}</span>
      )}
    </div>
  );
}

export const GaFinancePage = () => {
  const queryClient = useQueryClient();
  const list = useListState({ filters: GA_FILTER_KEYS });
  const [density, setDensity] = useTableDensity();
  const [payTarget, setPayTarget] = useState<GaBill | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GaBill | null>(null);
  const canEdit = can('ga_finance', 'edit');

  const request = billsRequestParams(list.filters);
  const billsQuery = useQuery({
    queryKey: ['ga-finance-bills', request.kind, request.includePaid],
    queryFn: async () => (await api.get<GaBillsResponse>('/ga/finance/bills', { params: request })).data,
    placeholderData: keepPreviousData,
  });

  const filtered = useMemo(
    () =>
      filterBills(billsQuery.data?.bills ?? [], {
        search: list.search,
        posting: list.filters.posting,
        startDate: list.filters.startDate,
        endDate: list.filters.endDate,
      }),
    [billsQuery.data, list.search, list.filters.posting, list.filters.startDate, list.filters.endDate],
  );
  const sorted = useMemo(() => sortBills(filtered, list.sort), [filtered, list.sort]);
  const pageRows = useMemo(
    () => sorted.slice((list.page - 1) * list.pageSize, list.page * list.pageSize),
    [sorted, list.page, list.pageSize],
  );

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['ga-finance-bills'] });
    queryClient.invalidateQueries({ queryKey: ['coa'] });
  };

  const cancelMutation = useMutation({
    mutationFn: (b: GaBill) => api.post(`/ga/finance/${b.kind}/${b.id}/cancel`),
    onSuccess: () => {
      toast.success('Posting tagihan dibatalkan.');
      invalidate();
    },
    onError: (e) => toast.error(apiError(e, 'Gagal membatalkan posting.')),
  });

  const columns = useMemo<ColumnDef<GaBill>[]>(
    () => [
      {
        id: 'kind',
        header: 'Jenis',
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => <KindChip bill={row.original} />,
      },
      {
        id: 'date',
        header: 'Tanggal',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (row.original.date ? formatDate(row.original.date) : '-'),
      },
      {
        id: 'description',
        header: 'Keterangan',
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
        header: 'Aset / Tujuan',
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'min-w-36 max-w-56' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate text-foreground">{row.original.assetName ?? '-'}</p>
            {row.original.assetCode && (
              <p className="num truncate font-mono text-xs text-muted-foreground">{row.original.assetCode}</p>
            )}
          </div>
        ),
      },
      {
        id: 'amount',
        header: () => withUnit('Nilai'),
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
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <BillStatus bill={row.original} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const b = row.original;
          const posted = isPosted(b);
          return (
            <RowActions
              label={`Aksi untuk ${b.ref}`}
              actions={[
                {
                  label: 'Bayar / posting ke jurnal',
                  icon: Wallet,
                  hidden: !canEdit || posted,
                  onSelect: () => setPayTarget(b),
                },
                {
                  label: 'Batalkan posting',
                  icon: XCircle,
                  tone: 'danger',
                  hidden: !canEdit || !posted,
                  onSelect: () => setCancelTarget(b),
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit],
  );

  const summary = billsQuery.data?.summary;
  const kpiLoading = !billsQuery.data && !billsQuery.isError;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Tagihan Aset & Umum"
        description="Antrian biaya dari modul EAM (pajak kendaraan, service, sparepart) yang menunggu diposting ke pembukuan. Pengajuan & persetujuan dilakukan HRGA di EAM."
      />

      <section aria-label="Ringkasan tagihan" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Belum Diposting"
          icon={AlertCircle}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.pendingCount) : '-'}
          hint={list.filters.kind ? KIND_META[list.filters.kind as GaBill['kind']]?.label : 'semua jenis'}
        />
        <StatCard
          label="Nilai Belum Diposting"
          icon={Wallet}
          loading={kpiLoading}
          value={summary ? formatRupiah(summary.pendingAmount, { compact: true }) : '-'}
          valueTitle={summary ? formatRupiah(summary.pendingAmount) : undefined}
          hint={summary ? formatRupiah(summary.pendingAmount) : undefined}
        />
        <StatCard
          label="Sesuai Filter"
          icon={list.filters.posting ? CheckCircle2 : ListFilter}
          loading={kpiLoading}
          value={billsQuery.data ? formatNumber(filtered.length) : '-'}
          hint={billsQuery.data ? `Nilai ${formatRupiah(sumAmount(filtered))}` : undefined}
          className="col-span-2 lg:col-span-1"
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari tagihan"
          searchPlaceholder="Cari aset, keterangan, atau nomor"
          status={{ key: 'posting', label: 'Status posting', options: POSTING_OPTIONS, allLabel: POSTING_DEFAULT_LABEL }}
          dateRange
        >
          <SelectFilter
            label="Jenis tagihan"
            value={list.filters.kind}
            onChange={(v) => list.setFilter('kind', v)}
            options={KIND_OPTIONS}
            allLabel="Semua jenis"
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, filtered.length)}
          label="Daftar tagihan aset & umum"
          itemLabel="tagihan"
          columns={columns}
          data={billsQuery.data ? pageRows : undefined}
          getRowId={(row) => `${row.kind}-${row.id}`}
          loading={billsQuery.isLoading}
          fetching={billsQuery.isFetching && billsQuery.isPlaceholderData}
          error={billsQuery.error}
          onRetry={() => billsQuery.refetch()}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Tidak ada tagihan yang menunggu diposting',
            description: 'Tagihan yang disetujui HRGA di modul EAM akan muncul di sini.',
          }}
        />
      </div>

      <GaBillPayDialog
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
        title="Batalkan posting tagihan?"
        description={
          cancelTarget
            ? `Jurnal/faktur untuk "${cancelTarget.description}" akan dibatalkan dan tagihan kembali ke antrian. Faktur yang sudah dibayar sebagian tidak bisa dibatalkan.`
            : undefined
        }
        confirmLabel="Ya, batalkan"
        loading={cancelMutation.isPending}
        onConfirm={async () => {
          if (!cancelTarget) return;
          await cancelMutation.mutateAsync(cancelTarget);
        }}
      />
    </div>
  );
};

export default GaFinancePage;
