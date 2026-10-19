/**
 * Purchase orders (/purchase-orders): planning documents with no stock or GL impact; "PO Umum" has
 * no supplier. Receipt progress (`receiptStatus`) is derived server-side from qtyReceived.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, Copy, Eye, PackageCheck, Pencil, Plus, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
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
const STATUS_FILTER_VALUES = ['Draft', 'PendingApproval', 'Submitted', 'Cancelled'];
/** Receipt progress only means something once the PO is ordered. */
const showReceipt = (po: PurchaseOrderRow) =>
  po.status === 'Submitted' && !!po.receiptStatus && po.receiptStatus !== 'Cancelled';
/** Receipt filter values sent to the API; labels: purchasing:poList.receiptFilter.<value>. */
const RECEIPT_FILTER = ['unreceived', 'partial', 'full', 'closed'] as const;
const ALL = '__all__';

/** "Terlambat" due marker — icon + text, never colour alone. */
function OverdueMarker({ className }: { className?: string }) {
  const { t } = useTranslation('purchasing');
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-danger-text ${className ?? ''}`}>
      <AlertTriangle size={12} aria-hidden />
      {t('poList.overdue')}
    </span>
  );
}

function DueFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation('purchasing');
  const id = useId();
  return (
    <div className="w-[calc(50%-0.25rem)] sm:w-40">
      <label htmlFor={id} className="sr-only">
        {t('poList.dueFilter.label')}
      </label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('poList.dueFilter.all')}</SelectItem>
          <SelectItem value="overdue">{t('poList.overdue')}</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ReceiptFilter({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation('purchasing');
  const id = useId();
  return (
    <div className="w-[calc(50%-0.25rem)] sm:w-44">
      <label htmlFor={id} className="sr-only">
        {t('poList.receiptFilter.label')}
      </label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? '' : v)}>
        <SelectTrigger id={id}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>{t('poList.receiptFilter.all')}</SelectItem>
          {RECEIPT_FILTER.map((value) => (
            <SelectItem key={value} value={value}>
              {t(`poList.receiptFilter.${value}`)}
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
  const { t } = useTranslation('purchasing');
  if (po.supplier) return <span className={className}>{po.supplier.name}</span>;
  return (
    <span className={className} title={t('poList.generalPOHint')}>
      <span className="font-normal italic text-muted-foreground">{t('poList.generalPO')}</span>
    </span>
  );
}

export const PurchaseOrders = () => {
  const { t } = useTranslation('purchasing');
  // Built per render (not at module load) so the labels follow the UI language.
  const statusFilter = statusOptions(STATUS_FILTER_VALUES, 'purchase_order');
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
      toast.error(t('poList.errorLoadDetail'));
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
        header: t('poList.columns.number'),
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
        header: t('poList.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'supplier',
        header: t('poList.columns.supplier'),
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
        header: t('poList.columns.expectedDelivery'),
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (row.original.expectedDeliveryDate ? formatDate(row.original.expectedDeliveryDate) : '—'),
      },
      {
        id: 'items',
        header: t('poList.columns.items'),
        meta: { align: 'right', hideBelow: 'xl', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => formatNumber(row.original._count?.items ?? 0),
      },
      {
        id: 'totalEstimated',
        header: () => withUnit(t('poList.columns.total')),
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
                <span className="text-muted-foreground">—</span>
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
        header: t('poList.columns.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.displayStatus ?? row.original.status} docType="purchase_order" />,
      },
      {
        id: 'receiptStatus',
        header: t('poList.columns.receipt'),
        meta: { hideBelow: 'md' },
        cell: ({ row }) =>
          showReceipt(row.original) ? (
            <div className="flex flex-col items-start gap-1">
              <StatusBadge status={row.original.receiptStatus} docType="purchase_order" />
              {row.original.isOverdue && <OverdueMarker />}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'goodsReceipts',
        header: () => <abbr title={t('poList.columns.receiptsTitle')}>{t('poList.columns.receipts')}</abbr>,
        meta: { align: 'right', hideBelow: 'lg', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => formatNumber(row.original._count?.goodsReceipts ?? 0),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('poList.columns.actions')}</span>,
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
              label={t('poList.rowActions', { number: po.poNumber })}
              actions={[
                { label: t('poList.actions.view'), icon: Eye, onSelect: () => setSelectedId(po.id) },
                { label: t('poList.actions.createReceipt'), icon: PackageCheck, hidden: !acts.receive, onSelect: () => withDetail(po.id, openReceipt) },
                { label: t('poList.actions.edit'), icon: Pencil, hidden: !acts.edit, onSelect: () => withDetail(po.id, openEdit) },
                { label: t('poList.actions.duplicate'), icon: Copy, hidden: !acts.duplicate, onSelect: () => withDetail(po.id, openDuplicate) },
                { label: t('poList.actions.print'), icon: Printer, onSelect: () => withDetail(po.id, downloadPdf) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handlers only close over stable setters/query client
    [canCreate, t],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('poList.title')}
        description={t('poList.description')}
        actions={
          canCreate ? (
            <Button onClick={openCreate}>
              <Plus aria-hidden />
              {t('poList.create')}
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('poList.searchLabel')}
          searchPlaceholder={t('poList.searchPlaceholder')}
          status={{ options: statusFilter }}
          dateRange
        >
          <ReceiptFilter value={list.filters.receipt} onChange={(v) => list.setFilter('receipt', v)} />
          <DueFilter value={list.filters.due} onChange={(v) => list.setFilter('due', v)} />
          <PartyFilter partyType="Supplier" value={list.filters.partyId} onChange={(v) => list.setFilter('partyId', v)} />
        </FilterBar>

        <DataTable
          {...listTableProps(list, ordersQuery.data?.total)}
          label={t('poList.tableLabel')}
          itemLabel={t('poList.itemLabel')}
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
            title: t('poList.empty.title'),
            description: t('poList.empty.description'),
            action: canCreate ? (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                {t('poList.empty.action')}
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
