/**
 * Pesanan Pembelian (/purchase-orders) — list kit page (pattern: pages/SalesInvoices.tsx).
 * Server-side paging/sort/filter on GET /purchase-orders. No KPI cards: this
 * list never had any. A PO is a planning document (no stock or GL impact);
 * "PO Umum" has no supplier bound to it. Receipt progress ("Penerimaan") is
 * derived server-side from the lines' qtyReceived (`receiptStatus`).
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Copy, Eye, PackageCheck, Pencil, Plus, Printer } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { can, cap } from '@/lib/permissions';
import { purchaseOrderActions } from '@/lib/purchaseOrderActions';
import { usePurchaseOrderPdf } from '@/lib/pdf/usePurchaseOrderPdf';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import PurchaseOrderModal, { type PurchaseOrderModalMode, type PurchaseOrderSource } from '@/components/PurchaseOrderModal';
import PurchaseOrderDetailDrawer, { type PurchaseOrderDetail } from '@/components/PurchaseOrderDetailDrawer';
import GoodsReceiptModal, { type GoodsReceiptSourcePO } from '@/components/GoodsReceiptModal';

type Money = string | number;

interface PurchaseOrderRow {
  id: string;
  poNumber: string;
  date: string;
  expectedDeliveryDate: string | null;
  status: string;
  closedAt?: string | null;
  receiptStatus?: string;
  /** Ordered, past the expected delivery day (WIB) and not fully received. */
  isOverdue?: boolean;
  /** Draft | PendingApproval | Submitted | Cancelled (server-derived). */
  displayStatus?: string;
  approvalStatus?: string | null;
  /** = grand total (incl. discount, PPN, other costs) for stage-2 POs. */
  totalEstimated: Money;
  supplier?: { id: string; name: string } | null;
  _count?: { items: number; goodsReceipts: number };
}

const ENDPOINT = '/purchase-orders';
const FILTER_KEYS = ['status', 'partyId', 'startDate', 'endDate', 'receipt', 'due'] as const;
const STATUS_FILTER = statusOptions(['Draft', 'PendingApproval', 'Submitted', 'Cancelled'], 'purchase_order');
/** Receipt progress only means something once the PO is ordered. */
const showReceipt = (po: PurchaseOrderRow) =>
  po.status === 'Submitted' && !!po.receiptStatus && po.receiptStatus !== 'Cancelled';
const RECEIPT_FILTER = [
  { value: 'unreceived', label: 'Belum Diterima' },
  { value: 'partial', label: 'Diterima Sebagian' },
  { value: 'full', label: 'Diterima Penuh' },
  { value: 'closed', label: 'Ditutup' },
];
const ALL = '__all__';

/** "Terlambat" due marker — icon + text, never colour alone. */
function OverdueMarker({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-danger-text ${className ?? ''}`}>
      <AlertTriangle size={12} aria-hidden />
      Terlambat
    </span>
  );
}

function DueFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="w-[calc(50%-0.25rem)] sm:w-40">
      <label htmlFor={id} className="sr-only">
        Target terima
      </label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Semua target</SelectItem>
          <SelectItem value="overdue">Terlambat</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ReceiptFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  return (
    <div className="w-[calc(50%-0.25rem)] sm:w-44">
      <label htmlFor={id} className="sr-only">
        Status penerimaan
      </label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Semua penerimaan</SelectItem>
          {RECEIPT_FILTER.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}


type ModalState =
  | { kind: 'po'; mode: PurchaseOrderModalMode; source: PurchaseOrderSource | null }
  | { kind: 'receipt'; po: GoodsReceiptSourcePO }
  | null;

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

/** Supplier name, or the "PO Umum" marker when no supplier is bound. */
function SupplierName({ po, className }: { po: PurchaseOrderRow; className?: string }) {
  if (po.supplier) return <span className={className}>{po.supplier.name}</span>;
  return (
    <span className={className} title="PO Umum: boleh dipenuhi pemasok mana saja">
      <span className="font-normal italic text-muted-foreground">PO Umum</span>
    </span>
  );
}

export const PurchaseOrders = () => {
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [modal, setModal] = useState<ModalState>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canCreate = can('purchase_order', 'edit');
  const queryClient = useQueryClient();
  const { download: downloadPdf } = usePurchaseOrderPdf();

  // Deep link (e.g. "PO terlambat" notification): /purchase-orders?po=<id> opens the drawer.
  const [searchParams, setSearchParams] = useSearchParams();
  const poParam = searchParams.get('po');
  useEffect(() => {
    if (!poParam) return;
    setSelectedId(poParam);
    const next = new URLSearchParams(searchParams);
    next.delete('po');
    setSearchParams(next, { replace: true });
  }, [poParam, searchParams, setSearchParams]);

  const openCreate = () => setModal({ kind: 'po', mode: 'create', source: null });
  const openEdit = (po: PurchaseOrderSource) => setModal({ kind: 'po', mode: 'edit', source: po });
  const openDuplicate = (po: PurchaseOrderSource) => setModal({ kind: 'po', mode: 'duplicate', source: po });
  const openReceipt = (po: GoodsReceiptSourcePO) => setModal({ kind: 'receipt', po });

  /** Row menu actions need the full PO (items) — same cache as the drawer. */
  const withDetail = async (id: string, run: (po: PurchaseOrderDetail) => void) => {
    try {
      const po = await queryClient.fetchQuery<PurchaseOrderDetail>({
        queryKey: ['purchase-order-detail', id],
        queryFn: async () => (await api.get(`${ENDPOINT}/${id}`)).data,
      });
      run(po);
    } catch {
      toast.error('Gagal memuat detail PO.');
    }
  };

  const ordersQuery = useQuery({
    queryKey: ['purchase-orders', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<PurchaseOrderRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<PurchaseOrderRow>[]>(
    () => [
      {
        id: 'poNumber',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.poNumber}</DocumentLink>
            {/* Mobile: supplier + date stacked here because their columns are hidden. */}
            <SupplierName po={row.original} className="max-w-44 truncate text-sm font-medium text-foreground sm:hidden" />
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
          <p className="truncate">
            <SupplierName po={row.original} className="font-medium text-foreground" />
          </p>
        ),
      },
      {
        id: 'expectedDeliveryDate',
        header: 'Target Terima',
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (row.original.expectedDeliveryDate ? formatDate(row.original.expectedDeliveryDate) : '-'),
      },
      {
        id: 'items',
        header: 'Item',
        meta: { align: 'right', hideBelow: 'xl', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => formatNumber(row.original._count?.items ?? 0),
      },
      {
        id: 'totalEstimated',
        header: () => withUnit('Total'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const value = toNumber(row.original.totalEstimated) ?? 0;
          return (
            <div className="flex flex-col items-end gap-1">
              {value > 0 ? (
                <span className="font-medium text-foreground">{formatRupiah(value, { symbol: false })}</span>
              ) : (
                <span className="text-muted-foreground">-</span>
              )}
              {/* Mobile: status stacked here because its column is hidden. */}
              <StatusBadge status={row.original.displayStatus ?? row.original.status} docType="purchase_order" className="sm:hidden" />
              {/* Mobile/tablet: receipt progress stacked here because its column is hidden. */}
              {showReceipt(row.original) && (
                <StatusBadge status={row.original.receiptStatus} docType="purchase_order" className="md:hidden" />
              )}
              {row.original.isOverdue && <OverdueMarker className="md:hidden" />}
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.displayStatus ?? row.original.status} docType="purchase_order" />,
      },
      {
        id: 'receiptStatus',
        header: 'Penerimaan',
        meta: { hideBelow: 'md' },
        cell: ({ row }) =>
          showReceipt(row.original) ? (
            <div className="flex flex-col items-start gap-1">
              <StatusBadge status={row.original.receiptStatus} docType="purchase_order" />
              {row.original.isOverdue && <OverdueMarker />}
            </div>
          ) : (
            <span className="text-muted-foreground">-</span>
          ),
      },
      {
        id: 'goodsReceipts',
        header: () => <abbr title="Jumlah surat tanda terima (penerimaan barang)">STT</abbr>,
        meta: { align: 'right', hideBelow: 'lg', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => formatNumber(row.original._count?.goodsReceipts ?? 0),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const po = row.original;
          const acts = purchaseOrderActions(po, {
            canEditPO: canCreate,
            canReceive: can('goods_receipt', 'edit'),
            canClose: cap('doc.cancel'),
            hasLinkedReceipts: (po._count?.goodsReceipts ?? 0) > 0,
          });
          return (
            <RowActions
              label={`Aksi untuk ${po.poNumber}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => setSelectedId(po.id) },
                { label: 'Buat STT dari PO', icon: PackageCheck, hidden: !acts.receive, onSelect: () => withDetail(po.id, openReceipt) },
                { label: 'Edit', icon: Pencil, hidden: !acts.edit, onSelect: () => withDetail(po.id, openEdit) },
                { label: 'Duplikat', icon: Copy, hidden: !acts.duplicate, onSelect: () => withDetail(po.id, openDuplicate) },
                { label: 'Cetak / PDF', icon: Printer, onSelect: () => withDetail(po.id, downloadPdf) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers only close over stable setters/query client
    [canCreate],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Pesanan Pembelian"
        description="Pesanan ke pemasok: PO Umum (tanpa pemasok terikat) atau PO Khusus. Belum memengaruhi stok maupun jurnal."
        actions={
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus aria-hidden />
              Buat PO
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari pesanan pembelian"
          searchPlaceholder="Cari nomor PO atau pemasok"
          status={{ options: STATUS_FILTER }}
          dateRange
        >
          <ReceiptFilter value={list.filters.receipt} onChange={(v) => list.setFilter('receipt', v)} />
          <DueFilter value={list.filters.due} onChange={(v) => list.setFilter('due', v)} />
          <PartyFilter partyType="Supplier" value={list.filters.partyId} onChange={(v) => list.setFilter('partyId', v)} />
        </FilterBar>

        <DataTable
          {...listTableProps(list, ordersQuery.data?.total)}
          label="Daftar pesanan pembelian"
          itemLabel="PO"
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
            title: 'Belum ada pesanan pembelian',
            description: 'PO yang Anda buat akan muncul di sini.',
            action: canCreate ? (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                Buat PO pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      {modal?.kind === 'po' && (
        <PurchaseOrderModal
          key={`${modal.mode}-${modal.source?.id ?? 'new'}`}
          mode={modal.mode}
          source={modal.source}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.kind === 'receipt' && (
        <GoodsReceiptModal key={modal.po.id} initialPurchaseOrder={modal.po} onClose={() => setModal(null)} />
      )}
      <PurchaseOrderDetailDrawer
        poId={selectedId}
        onClose={() => setSelectedId(null)}
        onCreateReceipt={openReceipt}
        onEdit={openEdit}
        onDuplicate={openDuplicate}
      />
    </div>
  );
};

export default PurchaseOrders;
