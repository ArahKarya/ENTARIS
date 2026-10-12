/**
 * Purchase invoices (/purchase), plus ?tab=approval for approval requests and resubmits.
 * Switching tabs drops the list params.
 */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Download, Eye, PencilLine, Plus, Receipt, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
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
const STATUS_FILTER_VALUES = ['Submitted', 'PartiallyPaid', 'Paid', 'Cancelled'];
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
  const { t } = useTranslation('purchasing');
  // Built per render (not at module load) so the labels follow the UI language.
  const statusFilter = statusOptions(STATUS_FILTER_VALUES, 'purchase_invoice');
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
      toast.success(t('invoiceList.toastRecreate', { number: invoice.invoiceNumber }));
      setEditPrefill(toPurchaseInvoicePrefill(invoice, { keepLinks: false }));
      setSelectedId(null);
      setIsModalOpen(true);
      queryClient.invalidateQueries({ queryKey: ['purchase-invoices'] });
    } catch (err) {
      toast.error(errorMessage(err, t('invoiceList.errorCancel')));
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
      exportToExcel(toPurchaseInvoiceExportRows(rows), t('invoiceList.exportFileName', { date: stamp }));
      if (truncated) toast.warning(t('invoiceList.exportTruncated', { count: formatNumber(rows.length) }));
    } catch {
      toast.error(t('invoiceList.exportFailed'));
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<PurchaseInvoiceRow>[]>(
    () => [
      {
        id: 'invoiceNumber',
        header: t('invoiceList.columns.number'),
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.invoiceNumber}</DocumentLink>
            {/* Mobile: supplier stacked here because its column is hidden. */}
            <span className="line-clamp-2 max-w-44 text-sm font-medium break-words text-foreground sm:hidden">
              {row.original.supplier?.name ?? '—'}
            </span>
            <span className="num text-xs text-muted-foreground md:hidden">{formatDate(row.original.date)}</span>
          </div>
        ),
      },
      {
        id: 'date',
        header: t('invoiceList.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'supplier',
        header: t('invoiceList.columns.supplier'),
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.supplier?.name ?? '—'}</p>
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
        header: t('invoiceList.columns.dueDate'),
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap' },
        cell: ({ row }) => {
          const inv = row.original;
          if (!inv.dueDate) return <span className="text-muted-foreground">—</span>;
          const late = isPurchaseInvoiceOverdue(inv);
          return (
            <span className={cn('inline-flex items-center gap-1', late ? 'font-medium text-danger-text' : 'text-muted-foreground')}>
              {formatDate(inv.dueDate)}
              {late && (
                <>
                  <AlertTriangle className="size-3.5" aria-hidden />
                  <span className="sr-only">{t('invoiceList.overdueSr')}</span>
                </>
              )}
            </span>
          );
        },
      },
      {
        id: 'items',
        header: t('invoiceList.columns.items'),
        meta: { align: 'right', hideBelow: 'xl', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => formatNumber(row.original.items?.length ?? 0),
      },
      {
        id: 'grandTotal',
        header: () => withUnit(t('invoiceList.columns.total')),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => <span className="font-medium text-foreground">{money(row.original.grandTotal)}</span>,
      },
      {
        id: 'outstanding',
        header: () => withUnit(t('invoiceList.columns.outstanding')),
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
        header: t('invoiceList.columns.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="purchase_invoice" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('invoiceList.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const inv = row.original;
          return (
            <RowActions
              label={t('invoiceList.rowActions', { number: inv.invoiceNumber })}
              actions={[
                { label: t('invoiceList.actions.view'), icon: Eye, onSelect: () => setSelectedId(inv.id) },
                {
                  label: t('invoiceList.actions.editFull'),
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
    [canRecreate, t],
  );

  const kpiMoney = (v: number | undefined) => (v === undefined ? '—' : formatRupiah(v, { compact: true }));

  return (
    // Manual activation: avoids two history entries per click (see DeliveryOrders).
    <Tabs value={tab} onValueChange={changeTab} activationMode="manual" className="pb-8">
      <PageHeader
        title={t('invoiceList.title')}
        description={t('invoiceList.description')}
        actions={
          <>
            {tab === 'list' && (
              <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!total}>
                <Download aria-hidden />
                <span className="sr-only sm:not-sr-only">{t('invoiceList.export')}</span>
              </Button>
            )}
            {canPay && (
              <Button variant="outline" onClick={() => setIsPayOpen(true)}>
                <Wallet aria-hidden />
                <span className="sr-only sm:not-sr-only">{t('invoiceList.payPayables')}</span>
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus aria-hidden />
                {t('invoiceList.create')}
              </Button>
            )}
          </>
        }
      >
        <TabsList variant="underline" aria-label={t('invoiceList.tabsLabel')}>
          <TabsTrigger value="list">{t('invoiceList.tabs.list')}</TabsTrigger>
          <TabsTrigger value="approval">{t('invoiceList.tabs.approval')}</TabsTrigger>
        </TabsList>
      </PageHeader>

      <TabsContent value="list" className="mt-0 space-y-5">
        <section aria-label={t('invoiceList.kpi.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            label={t('invoiceList.kpi.count')}
            icon={Receipt}
            loading={kpiLoading}
            value={summary ? formatNumber(summary.count) : '—'}
            hint={summary ? t('invoiceList.kpi.countHint', { amount: formatRupiah(summary.grandTotal) }) : undefined}
          />
          <StatCard
            label={t('invoiceList.kpi.outstanding')}
            icon={Wallet}
            loading={kpiLoading}
            value={kpiMoney(summary?.outstanding)}
            valueTitle={summary ? formatRupiah(summary.outstanding) : undefined}
          />
          <StatCard
            label={t('invoiceList.kpi.paid')}
            icon={CheckCircle2}
            loading={kpiLoading}
            value={summary ? formatNumber(summary.paidCount) : '—'}
            hint={t('invoiceList.kpi.paidHint')}
          />
          <StatCard
            label={t('invoiceList.kpi.overdue')}
            icon={AlertTriangle}
            loading={kpiLoading}
            value={summary ? formatNumber(summary.overdueCount) : '—'}
            hint={summary ? t('invoiceList.kpi.overdueHint', { amount: formatRupiah(summary.overdueOutstanding) }) : undefined}
          />
        </section>

        <div className="space-y-3">
          <FilterBar
            list={list}
            searchLabel={t('invoiceList.searchLabel')}
            searchPlaceholder={t('invoiceList.searchPlaceholder')}
            status={{ options: statusFilter }}
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
            label={t('invoiceList.tableLabel')}
            itemLabel={t('invoiceList.itemLabel')}
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
              title: t('invoiceList.empty.title'),
              description: t('invoiceList.empty.description'),
              action: canCreate ? (
                <Button size="sm" onClick={() => setIsModalOpen(true)}>
                  <Plus aria-hidden />
                  {t('invoiceList.empty.action')}
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
        title={t('invoiceList.confirmEditFull.title')}
        description={t('invoiceList.confirmEditFull.description', { number: editConfirmTarget?.invoiceNumber ?? '' })}
        confirmLabel={t('invoiceList.confirmEditFull.confirm')}
        onConfirm={async () => {
          if (editConfirmTarget) await performEditFull(editConfirmTarget);
        }}
      />
    </Tabs>
  );
};
