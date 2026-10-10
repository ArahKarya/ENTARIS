/**
 * Cash and bank ledger (/payments): payments plus cash/bank journal lines not linked to a payment.
 * Nothing is edited here: a payment is cancelled and re-entered; deposits and journals link to their module.
 */
import { useCallback, useId, useMemo, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  ChevronDown,
  Download,
  Eye,
  FileText,
  Info,
  Layers,
  Paperclip,
  Plus,
  Receipt,
  Scale,
  Wallet,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { can, cap } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useListState } from '@/hooks/useListState';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import type { PartyRecord } from '@/hooks/useSelectedPartyOption';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  fetchAllPages,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import {
  DIRECTION_LABEL,
  JOURNAL_KINDS,
  KIND_LABEL,
  PAYMENT_KINDS,
  cancelRoute,
  kindLabel,
  signedPrefix,
  statusDocType,
  toExportRows,
  type CashLedgerRow,
  type CashLedgerSummary,
} from '@/components/payments/cash-ledger';
import PaymentModal from '@/components/PaymentModal';
import TransferModal from '@/components/TransferModal';
import ExpenseModal from '@/components/ExpenseModal';
import BulkExpenseModal from '@/components/BulkExpenseModal';
import VendorDepositModal from '@/components/VendorDepositModal';
import PaymentDetailDrawer from '@/components/PaymentDetailDrawer';
import JournalDetailDrawer from '@/components/JournalDetailDrawer';

const ENDPOINT = '/payments/ledger';
const FILTER_KEYS = ['type', 'direction', 'status', 'partyId', 'accountId', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(['Draft', 'Submitted', 'Cancelled'], 'payment');
const ALL = '__all__';

type Modal = 'receive' | 'pay' | 'expense' | 'bulkExpense' | 'transfer' | 'deposit' | null;

interface AccountOption {
  id: string;
  accountNumber: string;
  name: string;
  accountType: string;
  isGroup: boolean;
}

const PARTY_TYPE_LABEL: Record<string, string> = { Customer: 'Pelanggan', Supplier: 'Pemasok', Both: 'Pelanggan & Pemasok' };

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

const errorMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

/** Same source/filter as BankReconciliation (shared cache key): leaf cash/bank accounts. */
function useCashAccounts() {
  return useQuery<AccountOption[]>({
    queryKey: ['coa-cash-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: AccountOption[] = Array.isArray(res.data) ? res.data : res.data.data || [];
      return all.filter((a) => a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1.') && !a.isGroup);
    },
    staleTime: 5 * 60_000,
  });
}

/** Party filter option with its type as hint (customers and suppliers together). */
const partyFilterOption = (p: PartyRecord) => ({
  value: p.id,
  label: p.name,
  hint: p.partyType ? PARTY_TYPE_LABEL[p.partyType] : undefined,
});

/** Attachment counts for the rows on screen (payments by id, journals by entry id). */
function useAttachmentCounts(rows: CashLedgerRow[] | undefined) {
  const paymentIds = useMemo(() => (rows ?? []).filter((r) => r.source === 'payment').map((r) => r.id), [rows]);
  const journalIds = useMemo(
    () => [...new Set((rows ?? []).flatMap((r) => (r.source === 'journal' && r.journalEntryId ? [r.journalEntryId] : [])))],
    [rows],
  );
  const counts = (referenceType: 'payment' | 'journal', ids: string[]) => ({
    queryKey: ['attachment-counts', referenceType, ids],
    queryFn: async () =>
      (await api.post<Record<string, number>>('/attachments/counts', { referenceType, referenceIds: ids })).data,
    enabled: ids.length > 0,
  });
  const payment = useQuery(counts('payment', paymentIds));
  const journal = useQuery(counts('journal', journalIds));
  const paymentCounts = payment.data;
  const journalCounts = journal.data;
  return useCallback(
    (row: CashLedgerRow) =>
      row.source === 'payment'
        ? (paymentCounts?.[row.id] ?? 0)
        : row.journalEntryId
          ? (journalCounts?.[row.journalEntryId] ?? 0)
          : 0,
    [paymentCounts, journalCounts],
  );
}

interface SelectFilterProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  allLabel: string;
  className?: string;
  children: ReactNode;
}

function SelectFilter({ label, value, onChange, allLabel, className, children }: SelectFilterProps) {
  const id = useId();
  return (
    <div className={className}>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{allLabel}</SelectItem>
          {children}
        </SelectContent>
      </Select>
    </div>
  );
}

function Amount({ row }: { row: CashLedgerRow }) {
  const isIn = row.direction === 'in';
  const Icon = isIn ? ArrowDownLeft : ArrowUpRight;
  const cancelled = row.status === 'Cancelled';
  return (
    <span
      className={cn(
        'inline-flex items-center justify-end gap-1 whitespace-nowrap font-medium',
        cancelled ? 'text-muted-foreground line-through' : isIn ? 'text-success-text' : 'text-foreground',
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{DIRECTION_LABEL[row.direction]}: </span>
      {signedPrefix(row.direction)}
      {formatRupiah(row.amount, { symbol: false })}
    </span>
  );
}

function PartyCell({ row }: { row: CashLedgerRow }) {
  if (row.partyName) {
    return (
      <div className="min-w-0">
        <p className="truncate font-medium text-foreground">{row.partyName}</p>
        <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
          {row.notes || (row.partyType ? PARTY_TYPE_LABEL[row.partyType] ?? row.partyType : '')}
        </p>
      </div>
    );
  }
  return (
    <p className="truncate text-muted-foreground" title={row.notes ?? undefined}>
      {row.notes || '-'}
    </p>
  );
}

export const Payments = () => {
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [modal, setModal] = useState<Modal>(null);
  const [cancelTarget, setCancelTarget] = useState<CashLedgerRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [journalDetailId, setJournalDetailId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const canCreate = can('payment', 'edit');
  const canCancel = canCreate && cap('doc.cancel');

  const ledgerQuery = useQuery({
    queryKey: ['payments', 'ledger', list.params],
    queryFn: async () => (await api.get<Paginated<CashLedgerRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ['payments', 'ledger-summary', list.filterParams],
    queryFn: async () => (await api.get<CashLedgerSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const accountsQuery = useCashAccounts();
  const attachmentCount = useAttachmentCounts(ledgerQuery.data?.data);

  const accountOptions = useMemo(
    () => (accountsQuery.data ?? []).map((a) => ({ value: a.id, label: a.name, hint: a.accountNumber })),
    [accountsQuery.data],
  );
  // A cash movement can involve a customer or a supplier: search all parties on the server.
  const partyPicker = usePartyPicker({ selectedId: list.filters.partyId || null, toOption: partyFilterOption });

  const cancelPaymentMutation = useMutation({
    mutationFn: (id: string) => api.post(`/payments/${id}/cancel`),
    onSuccess: () => {
      toast.success('Pembayaran dibatalkan.');
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['cash-journals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
    },
    onError: (err: unknown) => {
      toast.error(errorMessage(err, 'Gagal membatalkan pembayaran.'));
    },
  });

  const openDetail = (row: CashLedgerRow) => {
    if (row.source === 'payment') setDetailId(row.id);
    else if (row.journalEntryId) setJournalDetailId(row.journalEntryId);
  };

  const requestCancel = (row: CashLedgerRow) => {
    const route = cancelRoute(row);
    if (route.kind === 'redirect') {
      toast.info(route.message);
      navigate(route.path);
      return;
    }
    setCancelTarget(row);
  };

  const total = ledgerQuery.data?.total;
  const summary = summaryQuery.data;
  const summaryLoading = !summary && !summaryQuery.isError;

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = { ...list.filterParams, ...(list.params.sort ? { sort: list.params.sort } : {}) };
      const { rows, truncated } = await fetchAllPages<CashLedgerRow>(ENDPOINT, params);
      const stamp = new Date().toISOString().slice(0, 10);
      await exportToExcel(toExportRows(rows), `transaksi-kas-bank-${stamp}`);
      if (truncated) toast.warning(`Ekspor dibatasi ${formatNumber(rows.length)} transaksi pertama. Persempit filter.`);
    } catch {
      toast.error('Gagal mengekspor transaksi. Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<CashLedgerRow>[]>(
    () => [
      {
        id: 'number',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => {
          const r = row.original;
          const count = attachmentCount(r);
          return (
            <div className="flex flex-col items-start gap-0.5">
              <span className="inline-flex items-center gap-1.5">
                <DocumentLink onClick={() => openDetail(r)}>{r.number}</DocumentLink>
                {count > 0 && (
                  <span className="inline-flex items-center gap-0.5 text-xs text-muted-foreground" title={`${count} lampiran`}>
                    <Paperclip className="size-3" aria-hidden />
                    <span className="num">{count}</span>
                    <span className="sr-only">lampiran</span>
                  </span>
                )}
              </span>
              {/* Mobile: party / narration stacked here because its column is hidden. */}
              <span className="max-w-[7.5rem] truncate text-sm font-medium text-foreground sm:hidden">
                {r.partyName ?? r.notes ?? '-'}
              </span>
              <span className="num text-xs text-muted-foreground md:hidden">{formatDate(r.date)}</span>
            </div>
          );
        },
      },
      {
        id: 'date',
        header: 'Tanggal',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'party',
        header: 'Pihak / Keterangan',
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => <PartyCell row={row.original} />,
      },
      {
        id: 'kind',
        header: 'Tipe / Akun',
        meta: { hideBelow: 'lg', cellClassName: 'max-w-52' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              <Badge variant="neutral">{kindLabel(r.kind)}</Badge>
              <span
                className="max-w-full truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden"
                title={r.accountNumber ? `${r.accountNumber} ${r.accountName ?? ''}` : undefined}
              >
                {r.accountName ?? '-'}
              </span>
            </div>
          );
        },
      },
      {
        id: 'amount',
        header: () => withUnit('Jumlah'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col items-end gap-1">
              <Amount row={r} />
              {/* Mobile/tablet: type (and a non-posted status) stacked here. */}
              <span className="max-w-[7.5rem] truncate text-xs text-muted-foreground sm:max-w-none lg:hidden">
                {kindLabel(r.kind)}
              </span>
              {r.status !== 'Submitted' && (
                <StatusBadge status={r.status} docType={statusDocType(r)} className="sm:hidden" />
              )}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType={statusDocType(row.original)} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const r = row.original;
          const route = cancelRoute(r);
          return (
            <RowActions
              label={`Aksi untuk ${r.number}`}
              actions={[
                {
                  label: r.source === 'journal' ? 'Lihat jurnal' : 'Lihat detail',
                  icon: Eye,
                  onSelect: () => openDetail(r),
                },
                {
                  label: route.kind === 'redirect' ? route.label : 'Batalkan',
                  icon: XCircle,
                  tone: 'danger',
                  hidden: !canCancel || r.status === 'Cancelled',
                  onSelect: () => requestCancel(r),
                },
              ]}
            />
          );
        },
      },
    ],
    // openDetail / requestCancel only close over stable setters and navigate.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canCancel, attachmentCount],
  );

  const kpiMoney = (v: number | undefined) => (v === undefined ? '-' : formatRupiah(v, { compact: true }));

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Transaksi Kas & Bank"
        description="Pantau mutasi kas, pembayaran vendor, dan pelunasan piutang."
        actions={
          <>
            <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!total}>
              <Download aria-hidden />
              <span className="sr-only sm:not-sr-only">Ekspor Excel</span>
            </Button>
            {canCreate && (
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Plus aria-hidden />
                    Catat Transaksi
                    <ChevronDown aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-60">
                  <DropdownMenuLabel>Kas masuk</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setModal('receive')}>
                    <ArrowDownLeft aria-hidden strokeWidth={1.75} />
                    Terima Pembayaran
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Kas keluar</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setModal('pay')}>
                    <ArrowUpRight aria-hidden strokeWidth={1.75} />
                    Bayar Hutang
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setModal('expense')}>
                    <FileText aria-hidden strokeWidth={1.75} />
                    Catat Pengeluaran
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setModal('bulkExpense')}>
                    <Layers aria-hidden strokeWidth={1.75} />
                    Input Banyak Pengeluaran
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setModal('deposit')}>
                    <Wallet aria-hidden strokeWidth={1.75} />
                    Uang Muka Vendor
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel>Antar akun</DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => setModal('transfer')}>
                    <ArrowRightLeft aria-hidden strokeWidth={1.75} />
                    Pindah Buku (Pinbuk)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      />

      <section aria-label="Ringkasan transaksi sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jumlah Transaksi"
          icon={Receipt}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.count) : '-'}
          hint={summary && summary.cancelledCount > 0 ? `${formatNumber(summary.cancelledCount)} dibatalkan` : undefined}
        />
        <StatCard
          label="Kas Masuk"
          icon={ArrowDownLeft}
          loading={summaryLoading}
          value={kpiMoney(summary?.inTotal)}
          valueTitle={summary ? formatRupiah(summary.inTotal) : undefined}
          hint={summary ? `${formatNumber(summary.inCount)} transaksi` : undefined}
        />
        <StatCard
          label="Kas Keluar"
          icon={ArrowUpRight}
          loading={summaryLoading}
          value={kpiMoney(summary?.outTotal)}
          valueTitle={summary ? formatRupiah(summary.outTotal) : undefined}
          hint={summary ? `${formatNumber(summary.outCount)} transaksi` : undefined}
        />
        <StatCard
          label="Arus Kas Bersih"
          icon={Scale}
          loading={summaryLoading}
          value={kpiMoney(summary?.net)}
          valueTitle={summary ? formatRupiah(summary.net) : undefined}
          hint="masuk − keluar"
        />
      </section>

      <details className="group rounded-md border border-border bg-muted/40 px-4 py-2.5 text-sm">
        <summary className="flex cursor-pointer list-none items-center gap-2 font-medium text-foreground [&::-webkit-details-marker]:hidden">
          <Info className="size-4 text-muted-foreground" aria-hidden />
          Cara kerja edit &amp; pembatalan
          <ChevronDown className="ml-auto size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          Transaksi bank/kas tidak bisa diedit untuk menjaga integritas Buku Besar. Bila ada kesalahan,{' '}
          <b className="font-semibold text-foreground">batalkan transaksi lalu buat ulang</b>. Uang Muka Vendor/Pelanggan
          wajib dibatalkan dari modulnya masing-masing. Transaksi yang berasal dari jurnal manual (Beban, Pinbuk)
          dibatalkan dari Buku Besar. Hanya role <b className="font-semibold text-foreground">Admin</b> yang boleh
          membatalkan.
        </p>
      </details>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari transaksi"
          searchPlaceholder="Cari nomor, pihak, atau keterangan"
          status={{ options: STATUS_FILTER }}
          dateRange
        >
          <SelectFilter
            label="Tipe transaksi"
            allLabel="Semua tipe"
            value={list.filters.type}
            onChange={(v) => list.setFilter('type', v)}
            className="w-[calc(50%-0.25rem)] sm:w-48"
          >
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Pembayaran</SelectLabel>
              {PAYMENT_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Jurnal kas</SelectLabel>
              {JOURNAL_KINDS.map((k) => (
                <SelectItem key={k} value={k}>
                  {KIND_LABEL[k]}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectFilter>
          <SelectFilter
            label="Arah kas"
            allLabel="Masuk & keluar"
            value={list.filters.direction}
            onChange={(v) => list.setFilter('direction', v)}
            className="w-[calc(50%-0.25rem)] sm:w-40"
          >
            <SelectItem value="in">Kas masuk (+)</SelectItem>
            <SelectItem value="out">Kas keluar (−)</SelectItem>
          </SelectFilter>
          <ComboboxFilter
            label="Pihak"
            allLabel="Semua pihak"
            searchPlaceholder="Cari pelanggan/pemasok…"
            value={list.filters.partyId}
            onChange={(v) => list.setFilter('partyId', v)}
            {...partyPicker.pickerProps}
            className="w-[calc(50%-0.25rem)] sm:w-52"
          />
          <ComboboxFilter
            label="Akun kas/bank"
            allLabel="Semua akun"
            searchPlaceholder="Cari akun…"
            value={list.filters.accountId}
            onChange={(v) => list.setFilter('accountId', v)}
            options={accountOptions}
            loading={accountsQuery.isLoading}
            className="w-[calc(50%-0.25rem)] sm:w-52"
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, total)}
          label="Daftar transaksi kas & bank"
          itemLabel="transaksi"
          columns={columns}
          data={ledgerQuery.data?.data}
          getRowId={(row) => `${row.source}-${row.id}`}
          loading={ledgerQuery.isLoading}
          fetching={ledgerQuery.isFetching && ledgerQuery.isPlaceholderData}
          error={ledgerQuery.error}
          onRetry={() => ledgerQuery.refetch()}
          onRowClick={openDetail}
          rowClassName={(row) => (row.status === 'Cancelled' ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada transaksi kas & bank',
            description: 'Penerimaan, pembayaran, pengeluaran, dan pinbuk yang dicatat akan muncul di sini.',
            action: canCreate ? (
              <Button size="sm" onClick={() => setModal('receive')}>
                <Plus aria-hidden />
                Terima pembayaran pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <PaymentModal isOpen={modal === 'receive'} onClose={() => setModal(null)} defaultType="Receive" />
      <PaymentModal isOpen={modal === 'pay'} onClose={() => setModal(null)} defaultType="Pay" />
      <ExpenseModal isOpen={modal === 'expense'} onClose={() => setModal(null)} />
      <BulkExpenseModal isOpen={modal === 'bulkExpense'} onClose={() => setModal(null)} />
      <TransferModal isOpen={modal === 'transfer'} onClose={() => setModal(null)} />
      <VendorDepositModal isOpen={modal === 'deposit'} onClose={() => setModal(null)} />

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Batalkan Transaksi"
        description={`Batalkan ${cancelTarget?.number}? Alokasi ke faktur, saldo kas/bank, dan jurnal akan otomatis dibalik. Tindakan tidak dapat dibatalkan.`}
        confirmLabel="Ya, Batalkan"
        tone="danger"
        loading={cancelPaymentMutation.isPending}
        onConfirm={() => {
          if (cancelTarget) {
            cancelPaymentMutation.mutate(cancelTarget.id);
            setCancelTarget(null);
          }
        }}
      />
      {detailId && <PaymentDetailDrawer paymentId={detailId} onClose={() => setDetailId(null)} />}
      {journalDetailId && (
        <JournalDetailDrawer journalEntryId={journalDetailId} onClose={() => setJournalDetailId(null)} />
      )}
    </div>
  );
};
