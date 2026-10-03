/**
 * Penerimaan Barang (/goods-receipts, STT/BPB) — list kit page (pattern:
 * pages/SalesInvoices.tsx). Server-side paging/sort/filter on
 * GET /goods-receipts. No KPI cards: this list never had any.
 *
 * Billing state is derived (status Submitted ± purchase-invoice link):
 * "Belum Ditagih" / "Sudah Ditagih", and customer-owned goods ("Titipan")
 * that are never invoiced. The server filter understands the same values.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { can } from '@/lib/permissions';
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
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import GoodsReceiptModal from '@/components/GoodsReceiptModal';
import GoodsReceiptDetailDrawer from '@/components/GoodsReceiptDetailDrawer';

interface GoodsReceiptRow {
  id: string;
  sttNumber: string;
  date: string;
  status: string;
  isCustomerOwned: boolean;
  nomorMobil: string | null;
  supplier?: { id: string; name: string } | null;
  invoice?: { id: string; invoiceNumber: string } | null;
  purchaseOrder?: { id: string; poNumber: string } | null;
  _count?: { items: number };
}

const ENDPOINT = '/goods-receipts';
const FILTER_KEYS = ['status', 'partyId', 'startDate', 'endDate'] as const;
// Filter values are what the API expects; labels match the row badges.
const STATUS_FILTER = statusOptions(['Uninvoiced', 'Invoiced', 'CustomerOwned', 'Cancelled'], 'goods_receipt');

/** Badge status: Submitted splits into Invoiced / CustomerOwned / Uninvoiced. */
function goodsReceiptDisplayStatus(row: Pick<GoodsReceiptRow, 'status' | 'invoice' | 'isCustomerOwned'>): string {
  if (row.status !== 'Submitted') return row.status;
  if (row.invoice) return 'Invoiced';
  return row.isCustomerOwned ? 'CustomerOwned' : 'Uninvoiced';
}

export const GoodsReceipts = () => {
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canCreate = can('goods_receipt', 'edit');

  const receiptsQuery = useQuery({
    queryKey: ['goods-receipts', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<GoodsReceiptRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<GoodsReceiptRow>[]>(
    () => [
      {
        id: 'sttNumber',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.sttNumber}</DocumentLink>
            {/* Mobile: supplier + date stacked here because their columns are hidden. */}
            <span className="max-w-44 truncate text-sm font-medium text-foreground sm:hidden">
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
        cell: ({ row }) => <p className="truncate font-medium text-foreground">{row.original.supplier?.name ?? '-'}</p>,
      },
      {
        id: 'purchaseOrder',
        header: () => <abbr title="Pesanan pembelian">PO</abbr>,
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.purchaseOrder ? (
            <span className="num font-mono text-xs text-foreground">{row.original.purchaseOrder.poNumber}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: 'nomorMobil',
        header: 'No. Mobil',
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap font-mono text-xs uppercase text-muted-foreground' },
        cell: ({ row }) => row.original.nomorMobil || '-',
      },
      {
        id: 'items',
        header: 'Item',
        meta: { align: 'right', hideBelow: 'xl', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => formatNumber(row.original._count?.items ?? 0),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <StatusBadge status={goodsReceiptDisplayStatus(row.original)} docType="goods_receipt" />
            {/* Mobile: invoice number stacked here because its column is hidden. */}
            {row.original.invoice && (
              <span className="num font-mono text-xs text-muted-foreground md:hidden">
                {row.original.invoice.invoiceNumber}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'invoice',
        header: 'Faktur',
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.invoice ? (
            <span className="num font-mono text-xs text-foreground">{row.original.invoice.invoiceNumber}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={`Aksi untuk ${row.original.sttNumber}`}
            actions={[{ label: 'Lihat detail', icon: Eye, onSelect: () => setSelectedId(row.original.id) }]}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Penerimaan Barang"
        description="Surat tanda terima (STT/BPB) barang fisik dari pemasok. Stok masuk di sini; faktur pembelian menyusul."
        actions={
          canCreate ? (
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus aria-hidden />
              Buat STT
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari penerimaan barang"
          searchPlaceholder="Cari STT, PO, pemasok, no. mobil"
          status={{ options: STATUS_FILTER }}
          dateRange
        >
          <PartyFilter partyType="Supplier" value={list.filters.partyId} onChange={(v) => list.setFilter('partyId', v)} />
        </FilterBar>

        <DataTable
          {...listTableProps(list, receiptsQuery.data?.total)}
          label="Daftar penerimaan barang"
          itemLabel="STT"
          columns={columns}
          data={receiptsQuery.data?.data}
          getRowId={(row) => row.id}
          loading={receiptsQuery.isLoading}
          fetching={receiptsQuery.isFetching && receiptsQuery.isPlaceholderData}
          error={receiptsQuery.error}
          onRetry={() => receiptsQuery.refetch()}
          onRowClick={(row) => setSelectedId(row.id)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada penerimaan barang',
            description: 'STT memasukkan stok saat dibuat; faktur pembelian menyusul.',
            action: canCreate ? (
              <Button size="sm" onClick={() => setIsModalOpen(true)}>
                <Plus aria-hidden />
                Buat STT pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      {isModalOpen && <GoodsReceiptModal onClose={() => setIsModalOpen(false)} />}
      <GoodsReceiptDetailDrawer sttId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
};

export default GoodsReceipts;
