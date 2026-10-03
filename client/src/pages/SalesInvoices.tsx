/**
 * Faktur Penjualan (/sales) — REFERENCE list page for the Phase 3 list kit.
 *
 * Pattern to copy for other list pages:
 *  1. useListState({ filters }) → URL-synced page/size/search/sort/filters.
 *  2. useQuery(['<key>', 'list', list.params]) with keepPreviousData → GET list
 *     endpoint ({ data, total, page, limit }).
 *  3. useQuery(['<key>', 'summary', list.filterParams]) → KPI endpoint with the
 *     same filters (never compute KPIs from the visible page).
 *  4. <PageHeader> (H1 = route registry label) → KPI <StatCard>s →
 *     <FilterBar list={list}> → <DataTable {...listTableProps(list, total)}>.
 *  5. Columns: document number as <DocumentLink>, amounts with meta.align
 *     'right' + formatRupiah(x, { symbol: false }) under an "(Rp)" header,
 *     <StatusBadge docType>, <RowActions> last, secondary columns hideBelow.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Download, Eye, Plus, Receipt, Undo2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { getStatusLabel, statusOptions } from '@/lib/status';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DocumentLink,
  FilterBar,
  PageHeader,
  PartyFilter,
  RowActions,
  StatCard,
  StatusBadge,
  fetchAllPages,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import SalesInvoiceModal from '@/components/SalesInvoiceModal';
import SalesReturnModal from '@/components/SalesReturnModal';
import InvoiceDetailDrawer from '@/components/InvoiceDetailDrawer';

type Money = string | number;

interface SalesInvoiceItemRow {
  itemType?: string;
  itemName?: string;
  description?: string;
  quantity: Money;
  unit?: string;
  rate: Money;
  discount?: Money;
  taxPct?: Money;
  pphPct?: Money;
  amount: Money;
}

interface SalesInvoiceRow {
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate: string | null;
  status: string;
  grandTotal: Money;
  outstanding: Money;
  deductionTotal?: number;
  notes?: string | null;
  customer?: { name: string; phone?: string | null } | null;
  items?: SalesInvoiceItemRow[];
}

interface SalesInvoiceSummary {
  count: number;
  grandTotal: number;
  outstanding: number;
  paidCount: number;
  overdueCount: number;
  overdueOutstanding: number;
}

const ENDPOINT = '/sales/invoices';
const FILTER_KEYS = ['status', 'partyId', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(['Submitted', 'PartiallyPaid', 'Paid', 'Cancelled'], 'sales_invoice');
const RETURNABLE = new Set(['Submitted', 'PartiallyPaid', 'Paid', 'Overdue']);

/** Column header with the currency unit kept in normal case: "TOTAL (Rp)". */
const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

const num = (v: Money | null | undefined) => toNumber(v) ?? 0;
const money = (v: Money | null | undefined) => formatRupiah(v, { symbol: false });

/** Past due date and still owing (same rule as the server's overdue KPI). */
function isOverdue(inv: SalesInvoiceRow, now = new Date()): boolean {
  return !!inv.dueDate && new Date(inv.dueDate) < now && num(inv.outstanding) > 0;
}

function toExportRows(invoices: SalesInvoiceRow[]): Record<string, unknown>[] {
  const now = new Date();
  return invoices.flatMap((inv) => {
    const totalPaid = num(inv.grandTotal) - num(inv.outstanding);
    const status = getStatusLabel(inv.status, 'sales_invoice');
    const statusLabel = isOverdue(inv, now) ? `${status} (Jatuh Tempo)` : status;
    const items: Array<SalesInvoiceItemRow | null> = inv.items && inv.items.length > 0 ? inv.items : [null];
    return items.map((it) => ({
      Tanggal: formatDate(inv.date),
      'Nomor Dokumen': inv.invoiceNumber,
      Pelanggan: inv.customer?.name ?? '',
      Telepon: inv.customer?.phone ?? '',
      'Jatuh Tempo': inv.dueDate ? formatDate(inv.dueDate) : '',
      'Jenis Item': it ? (it.itemType === 'service' ? 'Jasa' : 'Produk') : '',
      'Nama Produk': it?.itemName ?? '',
      Deskripsi: it?.description ?? '',
      Qty: it ? num(it.quantity) : '',
      Unit: it?.unit ?? '',
      'Harga Satuan': it ? num(it.rate) : '',
      'Diskon (%)': it ? num(it.discount) : '',
      'PPN (%)': it ? num(it.taxPct) : '',
      'PPh (%)': it ? num(it.pphPct) : '',
      'Subtotal Item': it ? num(it.amount) : '',
      'Total Invoice': num(inv.grandTotal),
      'Sudah Dibayar': totalPaid,
      'Sisa Tagihan': num(inv.outstanding),
      Status: statusLabel,
      Catatan: inv.notes ?? '',
    }));
  });
}

export const SalesInvoices = () => {
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [returnModal, setReturnModal] = useState<{ open: boolean; invoiceId?: string }>({ open: false });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // Deep link from Surat Jalan: /sales?fromDO=<id>&party=<partyId> → open the
  // modal prefilled from that DO.
  const [prefillFromDO, setPrefillFromDO] = useState<{ doId: string; partyId: string } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const canCreate = can('sales_invoice', 'edit');
  const canReturn = can('sales_return', 'edit');

  useEffect(() => {
    // Deep link from other pages (e.g. Surat Jalan → "Lihat Invoice"): /sales?invoice=<id>
    // opens that invoice's detail drawer.
    const invoiceId = searchParams.get('invoice');
    if (invoiceId) {
      setSelectedId(invoiceId);
      searchParams.delete('invoice');
      setSearchParams(searchParams, { replace: true });
    }
    const doId = searchParams.get('fromDO');
    const party = searchParams.get('party');
    if (doId && party) {
      setPrefillFromDO({ doId, partyId: party });
      setIsModalOpen(true);
      // Clear the flags so a refresh does not reopen the modal.
      searchParams.delete('fromDO');
      searchParams.delete('party');
      setSearchParams(searchParams, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const invoicesQuery = useQuery({
    queryKey: ['sales-invoices', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<SalesInvoiceRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ['sales-invoices', 'summary', list.filterParams],
    queryFn: async () =>
      (await api.get<SalesInvoiceSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const total = invoicesQuery.data?.total;
  const summary = summaryQuery.data;

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = { ...list.filterParams, ...(list.params.sort ? { sort: list.params.sort } : {}) };
      const { rows, truncated } = await fetchAllPages<SalesInvoiceRow>(ENDPOINT, params);
      const stamp = new Date().toISOString().slice(0, 10);
      exportToExcel(toExportRows(rows), `invoice-penjualan-${stamp}`);
      if (truncated) toast.warning(`Ekspor dibatasi ${formatNumber(rows.length)} faktur pertama. Persempit filter.`);
    } catch {
      toast.error('Gagal mengekspor faktur. Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<SalesInvoiceRow>[]>(
    () => [
      {
        id: 'invoiceNumber',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.invoiceNumber}</DocumentLink>
            {/* Mobile: customer stacked here because its column is hidden. */}
            <span className="max-w-44 truncate text-sm font-medium text-foreground sm:hidden">
              {row.original.customer?.name ?? '-'}
            </span>
            <span className="num text-xs text-muted-foreground md:hidden">{formatDate(row.original.date)}</span>
          </div>
        ),
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
        id: 'customer',
        header: 'Pelanggan',
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.customer?.name ?? '-'}</p>
            {row.original.customer?.phone && (
              <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                {row.original.customer.phone}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'dueDate',
        header: 'Jatuh Tempo',
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap' },
        cell: ({ row }) => {
          const inv = row.original;
          if (!inv.dueDate) return <span className="text-muted-foreground">-</span>;
          const late = isOverdue(inv);
          return (
            <span className={cn('inline-flex items-center gap-1', late ? 'font-medium text-danger-text' : 'text-muted-foreground')}>
              {formatDate(inv.dueDate)}
              {late && (
                <>
                  <AlertTriangle className="size-3.5" aria-hidden />
                  <span className="sr-only">(lewat jatuh tempo)</span>
                </>
              )}
            </span>
          );
        },
      },
      {
        id: 'items',
        header: 'Item',
        meta: { align: 'right', hideBelow: 'xl', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => formatNumber(row.original.items?.length ?? 0),
      },
      {
        id: 'grandTotal',
        header: () => withUnit('Total'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => {
          const inv = row.original;
          const deduction = inv.deductionTotal ?? 0;
          return (
            <div>
              <span className="font-medium text-foreground">{money(inv.grandTotal)}</span>
              {deduction > 0 && (
                <div
                  className="mt-0.5 text-xs font-normal text-warning-text"
                  title={`Potongan dari pembayaran (komisi/diskon): ${formatRupiah(deduction)}\nNet: ${formatRupiah(num(inv.grandTotal) - deduction)}`}
                >
                  pot. {money(deduction)} · net {money(num(inv.grandTotal) - deduction)}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'outstanding',
        header: () => withUnit('Sisa'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const value = num(row.original.outstanding);
          return (
            <div className="flex flex-col items-end gap-1">
              <span className={value > 0 ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
                {money(value)}
              </span>
              {/* Mobile: status stacked here because its column is hidden. */}
              <StatusBadge status={row.original.status} docType="sales_invoice" className="sm:hidden" />
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="sales_invoice" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const inv = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${inv.invoiceNumber}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => setSelectedId(inv.id) },
                {
                  label: 'Buat retur',
                  icon: Undo2,
                  hidden: !canReturn || !RETURNABLE.has(inv.status),
                  onSelect: () => setReturnModal({ open: true, invoiceId: inv.id }),
                },
              ]}
            />
          );
        },
      },
    ],
    [canReturn],
  );

  const kpiMoney = (v: number | undefined) => (v === undefined ? '-' : formatRupiah(v, { compact: true }));

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Faktur Penjualan"
        description="Kelola faktur penjualan dan piutang pelanggan."
        actions={
          <>
            <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!total}>
              <Download aria-hidden />
              <span className="sr-only sm:not-sr-only">Ekspor Excel</span>
            </Button>
            {canReturn && (
              <Button variant="outline" onClick={() => setReturnModal({ open: true })}>
                <Undo2 aria-hidden />
                <span className="sr-only sm:not-sr-only">Retur</span>
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus aria-hidden />
                Buat Faktur
              </Button>
            )}
          </>
        }
      />

      <section aria-label="Ringkasan faktur sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jumlah Faktur"
          icon={Receipt}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.count) : '-'}
          hint={summary ? `Nilai ${formatRupiah(summary.grandTotal)}` : undefined}
        />
        <StatCard
          label="Total Piutang"
          icon={Wallet}
          loading={!summary && !summaryQuery.isError}
          value={kpiMoney(summary?.outstanding)}
          valueTitle={summary ? formatRupiah(summary.outstanding) : undefined}
          hint={summary ? formatRupiah(summary.outstanding) : undefined}
        />
        <StatCard
          label="Lunas"
          icon={CheckCircle2}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.paidCount) : '-'}
          hint="faktur dibayar penuh"
        />
        <StatCard
          label="Lewat Jatuh Tempo"
          icon={AlertTriangle}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.overdueCount) : '-'}
          hint={summary ? `Sisa ${formatRupiah(summary.overdueOutstanding)}` : undefined}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari faktur"
          searchPlaceholder="Cari nomor faktur atau pelanggan"
          status={{ options: STATUS_FILTER }}
          dateRange
        >
          <PartyFilter
            partyType="Customer"
            value={list.filters.partyId}
            onChange={(v) => list.setFilter('partyId', v)}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, total)}
          label="Daftar faktur penjualan"
          itemLabel="faktur"
          columns={columns}
          data={invoicesQuery.data?.data}
          getRowId={(row) => row.id}
          loading={invoicesQuery.isLoading}
          fetching={invoicesQuery.isFetching && invoicesQuery.isPlaceholderData}
          error={invoicesQuery.error}
          onRetry={() => invoicesQuery.refetch()}
          onRowClick={(row) => setSelectedId(row.id)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada faktur penjualan',
            description: 'Faktur yang Anda buat akan muncul di sini.',
            action: canCreate ? (
              <Button size="sm" onClick={() => setIsModalOpen(true)}>
                <Plus aria-hidden />
                Buat faktur pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <SalesInvoiceModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setPrefillFromDO(null);
        }}
        prefillFromDO={prefillFromDO}
      />

      <SalesReturnModal
        open={returnModal.open}
        prefillInvoiceId={returnModal.invoiceId}
        onClose={() => setReturnModal({ open: false })}
      />

      <InvoiceDetailDrawer type="sales" invoiceId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
};
