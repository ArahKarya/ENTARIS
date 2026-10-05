/**
 * Faktur Pembelian (/purchase) — follows the list-kit pattern of
 * pages/SalesInvoices.tsx, plus a second tab for approval requests:
 *  • Daftar Faktur          ?tab omitted
 *  • Persetujuan & Pengajuan ?tab=approval (non-Admin submissions, resubmit)
 * The tab lives in the URL; switching tabs drops the list params.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Download, Eye, PencilLine, Plus, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { can, cap } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { LIST_PARAM, useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ConfirmDialog,
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
import {
  canEditFull,
  isPurchaseInvoiceOverdue,
  num,
  toPurchaseInvoiceExportRows,
  toPurchaseInvoicePrefill,
  type PurchaseInvoicePrefill,
  type PurchaseInvoiceRow,
  type PurchaseInvoiceSummary,
} from '@/components/purchase/purchase-invoice-rows';
import PurchaseInvoiceModal from '@/components/PurchaseInvoiceModal';
import ApprovalPanel, { type ApprovalRequest } from '@/components/ApprovalPanel';
import InvoiceDetailDrawer from '@/components/InvoiceDetailDrawer';
import PaymentModal from '@/components/PaymentModal';

type Tab = 'list' | 'approval';

const ENDPOINT = '/purchase/invoices';
const FILTER_KEYS = ['status', 'partyId', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(['Submitted', 'PartiallyPaid', 'Paid', 'Cancelled'], 'purchase_invoice');
const TAB_PARAM = 'tab';
/** List params owned by the list tab (cleared on tab switch). */
const LIST_KEYS = [LIST_PARAM.page, LIST_PARAM.search, LIST_PARAM.sort, ...FILTER_KEYS];

/** Column header with the currency unit kept in normal case: "TOTAL (Rp)". */
const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

const money = (v: string | number | null | undefined) => formatRupiah(v, { symbol: false });
const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

export const PurchaseInvoices = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: Tab = searchParams.get(TAB_PARAM) === 'approval' ? 'approval' : 'list';
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const queryClient = useQueryClient();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editPrefill, setEditPrefill] = useState<PurchaseInvoicePrefill | null>(null);
  const [editConfirmTarget, setEditConfirmTarget] = useState<PurchaseInvoiceRow | null>(null);
  const [resubmitId, setResubmitId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const canCreate = can('purchase_invoice', 'edit');
  const canPay = can('payment', 'edit');
  // "Edit lengkap" cancels the invoice first, which needs the cancel capability.
  const canRecreate = canCreate && cap('doc.cancel');

  const changeTab = (next: string) => {
    setSearchParams((prev) => {
      const params = new URLSearchParams(prev);
      for (const key of LIST_KEYS) params.delete(key);
      if (next === 'approval') params.set(TAB_PARAM, 'approval');
      else params.delete(TAB_PARAM);
      return params;
    });
  };

  // Resubmit a rejected/returned approval request: payload (raw create body) → modal prefill.
  const handleResubmit = (req: ApprovalRequest) => {
    setEditPrefill(toPurchaseInvoicePrefill(req.payload ?? {}, { keepLinks: true }));
    setResubmitId(req.id);
    setIsModalOpen(true);
  };

  // "Edit lengkap": cancel the old invoice, then open the modal prefilled with its data.
  const performEditFull = async (invoice: PurchaseInvoiceRow) => {
    try {
      await api.post(`${ENDPOINT}/${invoice.id}/cancel`);
      toast.success(`Invoice ${invoice.invoiceNumber} dibatalkan. Silakan edit & simpan ulang.`);
      setEditPrefill(toPurchaseInvoicePrefill(invoice, { keepLinks: false }));
      setSelectedId(null);
      setIsModalOpen(true);
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal membatalkan invoice.'));
    }
  };

  const invoicesQuery = useQuery({
    queryKey: ['purchase-invoices', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<PurchaseInvoiceRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
    enabled: tab === 'list',
  });

  const summaryQuery = useQuery({
    queryKey: ['purchase-invoices', 'summary', list.filterParams],
    queryFn: async () =>
      (await api.get<PurchaseInvoiceSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
    enabled: tab === 'list',
  });

  const total = invoicesQuery.data?.total;
  const summary = summaryQuery.data;
  const kpiLoading = !summary && !summaryQuery.isError;

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = { ...list.filterParams, ...(list.params.sort ? { sort: list.params.sort } : {}) };
      const { rows, truncated } = await fetchAllPages<PurchaseInvoiceRow>(ENDPOINT, params);
      const stamp = new Date().toISOString().slice(0, 10);
      exportToExcel(toPurchaseInvoiceExportRows(rows), `invoice-pembelian-${stamp}`);
      if (truncated) toast.warning(`Ekspor dibatasi ${formatNumber(rows.length)} faktur pertama. Persempit filter.`);
    } catch {
      toast.error('Gagal mengekspor faktur. Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<PurchaseInvoiceRow>[]>(
    () => [
      {
        id: 'invoiceNumber',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.invoiceNumber}</DocumentLink>
            {/* Mobile: supplier stacked here because its column is hidden. */}
            <span className="line-clamp-2 max-w-44 text-sm font-medium break-words text-foreground sm:hidden">
              {row.original.supplier?.name ?? '-'}
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
        id: 'supplier',
        header: 'Pemasok',
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.supplier?.name ?? '-'}</p>
            {row.original.supplier?.phone && (
              <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                {row.original.supplier.phone}
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
          const late = isPurchaseInvoiceOverdue(inv);
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
        cell: ({ row }) => <span className="font-medium text-foreground">{money(row.original.grandTotal)}</span>,
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
              <StatusBadge status={row.original.status} docType="purchase_invoice" className="sm:hidden" />
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="purchase_invoice" />,
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
                  label: 'Edit lengkap',
                  icon: PencilLine,
                  hidden: !canRecreate || !canEditFull(inv),
                  onSelect: () => setEditConfirmTarget(inv),
                },
              ]}
            />
          );
        },
      },
    ],
    [canRecreate],
  );

  const kpiMoney = (v: number | undefined) => (v === undefined ? '-' : formatRupiah(v, { compact: true }));

  return (
    // Manual activation: avoids two history entries per click (see DeliveryOrders).
    <Tabs value={tab} onValueChange={changeTab} activationMode="manual" className="pb-8">
      <PageHeader
        title="Faktur Pembelian"
        description="Kelola faktur pembelian dan hutang ke pemasok."
        actions={
          <>
            {tab === 'list' && (
              <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!total}>
                <Download aria-hidden />
                <span className="sr-only sm:not-sr-only">Ekspor Excel</span>
              </Button>
            )}
            {canPay && (
              <Button variant="outline" onClick={() => setIsPayOpen(true)}>
                <Wallet aria-hidden />
                <span className="sr-only sm:not-sr-only">Bayar Hutang</span>
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
      >
        <TabsList variant="underline" aria-label="Tampilan faktur pembelian">
          <TabsTrigger value="list">Daftar Faktur</TabsTrigger>
          <TabsTrigger value="approval">Persetujuan &amp; Pengajuan</TabsTrigger>
        </TabsList>
      </PageHeader>

      <TabsContent value="list" className="mt-0 space-y-5">
        <section aria-label="Ringkasan faktur sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label="Jumlah Faktur"
            icon={Receipt}
            loading={kpiLoading}
            value={summary ? formatNumber(summary.count) : '-'}
            hint={summary ? `Nilai ${formatRupiah(summary.grandTotal)}` : undefined}
          />
          <StatCard
            label="Total Hutang"
            icon={Wallet}
            loading={kpiLoading}
            value={kpiMoney(summary?.outstanding)}
            valueTitle={summary ? formatRupiah(summary.outstanding) : undefined}
            hint={summary ? formatRupiah(summary.outstanding) : undefined}
          />
          <StatCard
            label="Lunas"
            icon={CheckCircle2}
            loading={kpiLoading}
            value={summary ? formatNumber(summary.paidCount) : '-'}
            hint="faktur dibayar penuh"
          />
          <StatCard
            label="Lewat Jatuh Tempo"
            icon={AlertTriangle}
            loading={kpiLoading}
            value={summary ? formatNumber(summary.overdueCount) : '-'}
            hint={summary ? `Sisa ${formatRupiah(summary.overdueOutstanding)}` : undefined}
          />
        </section>

        <div className="space-y-3">
          <FilterBar
            list={list}
            searchLabel="Cari faktur"
            searchPlaceholder="Cari nomor faktur atau pemasok"
            status={{ options: STATUS_FILTER }}
            dateRange
          >
            <PartyFilter
              partyType="Supplier"
              value={list.filters.partyId}
              onChange={(v) => list.setFilter('partyId', v)}
            />
          </FilterBar>

          <DataTable
            {...listTableProps(list, total)}
            label="Daftar faktur pembelian"
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
              title: 'Belum ada faktur pembelian',
              description: 'Faktur dari pemasok yang Anda catat akan muncul di sini.',
              action: canCreate ? (
                <Button size="sm" onClick={() => setIsModalOpen(true)}>
                  <Plus aria-hidden />
                  Buat faktur pertama
                </Button>
              ) : undefined,
            }}
          />
        </div>
      </TabsContent>

      <TabsContent value="approval" className="mt-0">
        <ApprovalPanel
          documentType={['PurchaseInvoice', 'PurchaseInvoiceRevisePrice']}
          onResubmit={handleResubmit}
          onViewDocument={(req) => {
            if (req.documentId) setSelectedId(req.documentId);
          }}
        />
      </TabsContent>

      <PurchaseInvoiceModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditPrefill(null);
          setResubmitId(null);
        }}
        prefill={editPrefill}
        resubmitRequestId={resubmitId}
      />

      <InvoiceDetailDrawer
        type="purchase"
        invoiceId={selectedId}
        onClose={() => setSelectedId(null)}
        onEditFull={(invoice: PurchaseInvoiceRow) => {
          if (invoice?.id) setEditConfirmTarget(invoice);
        }}
      />

      <PaymentModal isOpen={isPayOpen} onClose={() => setIsPayOpen(false)} defaultType="Pay" />

      <ConfirmDialog
        open={editConfirmTarget !== null}
        onOpenChange={(open) => !open && setEditConfirmTarget(null)}
        tone="danger"
        title="Edit lengkap faktur?"
        description={`Faktur ${editConfirmTarget?.invoiceNumber ?? ''} akan dibatalkan, lalu Anda membuat faktur baru dengan data yang sudah terisi. Nomor faktur akan berubah.`}
        confirmLabel="Lanjut Edit"
        onConfirm={async () => {
          if (editConfirmTarget) await performEditFull(editConfirmTarget);
        }}
      />
    </Tabs>
  );
};
