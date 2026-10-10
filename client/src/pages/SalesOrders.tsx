/**
 * Pesanan Penjualan (/sales-orders) — list kit page (pattern: pages/SalesInvoices.tsx).
 * Server-side paging/sort/filter on GET /sales-orders; KPI cards from
 * GET /sales-orders/summary with the same filters.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CheckCircle2, Clock, Eye, FileText, Plus, Truck } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { statusOptions } from '@/lib/status';
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
  listTableProps,
  type Paginated,
} from '@/components/shared';
import SalesOrderModal from '@/components/SalesOrderModal';
import {
  canCreateSalesOrderFromQuotation,
  quotationToSalesOrderPrefill,
  type QuotationForSalesOrder,
} from '@/components/sales/so-from-quotation';
import SalesOrderDetailDrawer from '@/components/SalesOrderDetailDrawer';

type Money = string | number;

interface SalesOrderRow {
  id: string;
  soNumber: string;
  date: string;
  expectedDelivery: string | null;
  customerRefNo: string | null;
  status: string;
  grandTotal: Money;
  customer?: { id: string; name: string } | null;
  _count?: { items: number; deliveryOrders: number };
}

interface SalesOrderSummary {
  count: number;
  activeCount: number;
  activeValue: number;
  submittedCount: number;
  partiallyDeliveredCount: number;
  fullyDeliveredCount: number;
}

const ENDPOINT = '/sales-orders';
const FILTER_KEYS = ['status', 'partyId', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(
  ['Draft', 'Submitted', 'PartiallyDelivered', 'FullyDelivered', 'Cancelled'],
  'sales_order',
);

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

export const SalesOrders = () => {
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  // Full SO (with items) handed over by the detail drawer's "Edit".
  const [editTarget, setEditTarget] = useState<unknown>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ordersQuery = useQuery({
    queryKey: ['sales-orders', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<SalesOrderRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ['sales-orders', 'summary', list.filterParams],
    queryFn: async () => (await api.get<SalesOrderSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const total = ordersQuery.data?.total;
  const summary = summaryQuery.data;

  // "Buat Sales Order" from a quotation lands here with ?fromQuotation=<id>.
  const [searchParams, setSearchParams] = useSearchParams();
  const fromQuotation = searchParams.get('fromQuotation');
  useEffect(() => {
    if (!fromQuotation) return;
    let cancelled = false;
    api
      .get<QuotationForSalesOrder>(`/quotations/${encodeURIComponent(fromQuotation)}`)
      .then(({ data }) => {
        if (cancelled) return;
        if (!canCreateSalesOrderFromQuotation(data)) {
          toast.error(`Penawaran ${data.quotationNumber} tidak bisa dibuatkan Sales Order.`);
          return;
        }
        setEditTarget(quotationToSalesOrderPrefill(data));
        setIsModalOpen(true);
      })
      .catch(() => {
        if (!cancelled) toast.error('Gagal memuat penawaran.');
      })
      .finally(() => {
        if (cancelled) return;
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete('fromQuotation');
            return next;
          },
          { replace: true },
        );
      });
    return () => {
      cancelled = true;
    };
  }, [fromQuotation, setSearchParams]);

  const openCreate = () => {
    setEditTarget(null);
    setIsModalOpen(true);
  };

  const columns = useMemo<ColumnDef<SalesOrderRow>[]>(
    () => [
      {
        id: 'soNumber',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.soNumber}</DocumentLink>
            {/* Mobile: customer + date stacked here because their columns are hidden. */}
            <span className="max-w-44 truncate text-sm font-medium text-foreground sm:hidden">
              {row.original.customer?.name ?? '—'}
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
            <p className="truncate font-medium text-foreground">{row.original.customer?.name ?? '—'}</p>
            {row.original.customerRefNo && (
              <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                Ref: {row.original.customerRefNo}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'expectedDelivery',
        header: 'Target Kirim',
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (row.original.expectedDelivery ? formatDate(row.original.expectedDelivery) : '—'),
      },
      {
        id: 'items',
        header: 'Item',
        meta: { align: 'right', hideBelow: 'xl', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => formatNumber(row.original._count?.items ?? 0),
      },
      {
        id: 'grandTotal',
        header: () => withUnit('Total'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex flex-col items-end gap-1">
            <span className="font-medium text-foreground">{formatRupiah(row.original.grandTotal, { symbol: false })}</span>
            {/* Mobile: status stacked here because its column is hidden. */}
            <StatusBadge status={row.original.status} docType="sales_order" className="sm:hidden" />
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="sales_order" />,
      },
      {
        id: 'deliveryOrders',
        header: () => <abbr title="Jumlah surat jalan">SJ</abbr>,
        meta: { align: 'right', hideBelow: 'lg', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => formatNumber(row.original._count?.deliveryOrders ?? 0),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={`Aksi untuk ${row.original.soNumber}`}
            actions={[{ label: 'Lihat detail', icon: Eye, onSelect: () => setSelectedId(row.original.id) }]}
          />
        ),
      },
    ],
    [],
  );

  const count = (v: number | undefined) => (v === undefined ? '—' : formatNumber(v));

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Pesanan Penjualan"
        description="Komitmen jual sebelum Surat Jalan dan Faktur, cocok untuk skema “faktur dulu, kirim barang nanti”."
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden />
            Buat Pesanan
          </Button>
        }
      />

      <section aria-label="Ringkasan pesanan sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Pesanan Aktif"
          icon={FileText}
          loading={!summary && !summaryQuery.isError}
          value={count(summary?.activeCount)}
          hint={summary ? `Nilai ${formatRupiah(summary.activeValue)}` : undefined}
        />
        <StatCard
          label="Dikonfirmasi"
          icon={Clock}
          loading={!summary && !summaryQuery.isError}
          value={count(summary?.submittedCount)}
          hint="menunggu pengiriman"
        />
        <StatCard
          label="Terkirim Sebagian"
          icon={Truck}
          loading={!summary && !summaryQuery.isError}
          value={count(summary?.partiallyDeliveredCount)}
          hint="sisa belum dikirim"
        />
        <StatCard
          label="Terkirim Penuh"
          icon={CheckCircle2}
          loading={!summary && !summaryQuery.isError}
          value={count(summary?.fullyDeliveredCount)}
          hint="semua barang terkirim"
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari pesanan"
          searchPlaceholder="Cari nomor SO, pelanggan, atau ref"
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
          label="Daftar pesanan penjualan"
          itemLabel="pesanan"
          columns={columns}
          data={ordersQuery.data?.data}
          getRowId={(row) => row.id}
          loading={ordersQuery.isLoading}
          fetching={ordersQuery.isFetching && ordersQuery.isPlaceholderData}
          error={ordersQuery.error}
          onRetry={() => ordersQuery.refetch()}
          onRowClick={(row) => setSelectedId(row.id)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada pesanan penjualan',
            description: 'Pesanan yang Anda buat akan muncul di sini.',
            action: (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                Buat pesanan pertama
              </Button>
            ),
          }}
        />
      </div>

      <SalesOrderModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditTarget(null);
        }}
        editTarget={editTarget}
      />

      <SalesOrderDetailDrawer
        soId={selectedId}
        onClose={() => setSelectedId(null)}
        onEdit={(so) => {
          setSelectedId(null);
          setEditTarget(so);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
};

export default SalesOrders;
