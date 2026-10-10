/**
 * Sales invoices (/sales): the reference list page other list pages copy.
 * KPIs come from the summary endpoint with the same filters, never from the visible page.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Download, Eye, Plus, Receipt, Undo2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
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
const STATUS_FILTER_VALUES = ['Submitted', 'PartiallyPaid', 'Paid', 'Cancelled'];
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

function toExportRows(invoices: SalesInvoiceRow[], t: TFunction<'sales'>): Record<string, unknown>[] {
  const c = (key: string) => t(`salesInvoicesPage.export.${key}` as 'salesInvoicesPage.export.date');
  const now = new Date();
  return invoices.flatMap((inv) => {
    const totalPaid = num(inv.grandTotal) - num(inv.outstanding);
    const status = getStatusLabel(inv.status, 'sales_invoice');
    const statusLabel = isOverdue(inv, now) ? t('salesInvoicesPage.export.overdueStatus', { status }) : status;
    const items: Array<SalesInvoiceItemRow | null> = inv.items && inv.items.length > 0 ? inv.items : [null];
    return items.map((it) => ({
      [c('date')]: formatDate(inv.date),
      [c('documentNumber')]: inv.invoiceNumber,
      [c('customer')]: inv.customer?.name ?? '',
      [c('phone')]: inv.customer?.phone ?? '',
      [c('dueDate')]: inv.dueDate ? formatDate(inv.dueDate) : '',
      [c('itemType')]: it ? (it.itemType === 'service' ? t('salesInvoicesPage.export.service') : t('salesInvoicesPage.export.product')) : '',
      [c('productName')]: it?.itemName ?? '',
      [c('description')]: it?.description ?? '',
      [c('qty')]: it ? num(it.quantity) : '',
      [c('unit')]: it?.unit ?? '',
      [c('unitPrice')]: it ? num(it.rate) : '',
      [c('discountPct')]: it ? num(it.discount) : '',
      [c('vatPct')]: it ? num(it.taxPct) : '',
      [c('pphPct')]: it ? num(it.pphPct) : '',
      [c('itemSubtotal')]: it ? num(it.amount) : '',
      [c('invoiceTotal')]: num(inv.grandTotal),
      [c('paid')]: totalPaid,
      [c('outstanding')]: num(inv.outstanding),
      [c('status')]: statusLabel,
      [c('notes')]: inv.notes ?? '',
    }));
  });
}

export const SalesInvoices = () => {
  const { t } = useTranslation('sales');
  const statusFilter = statusOptions(STATUS_FILTER_VALUES, 'sales_invoice');
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
      exportToExcel(toExportRows(rows, t), t('salesInvoicesPage.export.fileName', { stamp }));
      if (truncated) toast.warning(t('salesInvoicesPage.export.truncated', { count: formatNumber(rows.length) }));
    } catch {
      toast.error(t('salesInvoicesPage.export.failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<SalesInvoiceRow>[]>(
    () => [
      {
        id: 'invoiceNumber',
        header: t('salesInvoicesPage.columns.number'),
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.invoiceNumber}</DocumentLink>
            {/* Mobile: customer stacked here because its column is hidden. */}
            <span className="line-clamp-2 max-w-44 text-sm font-medium break-words text-foreground sm:hidden">
              {row.original.customer?.name ?? '—'}
            </span>
            <span className="num text-xs text-muted-foreground md:hidden">{formatDate(row.original.date)}</span>
          </div>
        ),
      },
      {
        id: 'date',
        header: t('salesInvoicesPage.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'customer',
        header: t('salesInvoicesPage.columns.customer'),
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.customer?.name ?? '—'}</p>
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
        header: t('salesInvoicesPage.columns.dueDate'),
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap' },
        cell: ({ row }) => {
          const inv = row.original;
          if (!inv.dueDate) return <span className="text-muted-foreground">—</span>;
          const late = isOverdue(inv);
          return (
            <span className={cn('inline-flex items-center gap-1', late ? 'font-medium text-danger-text' : 'text-muted-foreground')}>
              {formatDate(inv.dueDate)}
              {late && (
                <>
                  <AlertTriangle className="size-3.5" aria-hidden />
                  <span className="sr-only">{t('salesInvoicesPage.columns.overdueSr')}</span>
                </>
              )}
            </span>
          );
        },
      },
      {
        id: 'items',
        header: t('salesInvoicesPage.columns.items'),
        meta: { align: 'right', hideBelow: 'xl', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => formatNumber(row.original.items?.length ?? 0),
      },
      {
        id: 'grandTotal',
        header: () => withUnit(t('salesInvoicesPage.columns.total')),
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
                  title={t('salesInvoicesPage.columns.deductionTitle', { deduction: formatRupiah(deduction), net: formatRupiah(num(inv.grandTotal) - deduction) })}
                >
                  {t('salesInvoicesPage.columns.deductionShort', { deduction: money(deduction), net: money(num(inv.grandTotal) - deduction) })}
                </div>
              )}
            </div>
          );
        },
      },
      {
        id: 'outstanding',
        header: () => withUnit(t('salesInvoicesPage.columns.outstanding')),
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
        header: t('salesInvoicesPage.columns.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="sales_invoice" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('salesInvoicesPage.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const inv = row.original;
          return (
            <RowActions
              label={t('salesInvoicesPage.actions.label', { number: inv.invoiceNumber })}
              actions={[
                { label: t('salesInvoicesPage.actions.view'), icon: Eye, onSelect: () => setSelectedId(inv.id) },
                {
                  label: t('salesInvoicesPage.actions.createReturn'),
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
    [canReturn, t],
  );

  const kpiMoney = (v: number | undefined) => (v === undefined ? '—' : formatRupiah(v, { compact: true }));

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('salesInvoicesPage.title')}
        description={t('salesInvoicesPage.description')}
        actions={
          <>
            <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!total}>
              <Download aria-hidden />
              <span className="sr-only sm:not-sr-only">{t('salesInvoicesPage.exportExcel')}</span>
            </Button>
            {canReturn && (
              <Button variant="outline" onClick={() => setReturnModal({ open: true })}>
                <Undo2 aria-hidden />
                <span className="sr-only sm:not-sr-only">{t('salesInvoicesPage.return')}</span>
              </Button>
            )}
            {canCreate && (
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus aria-hidden />
                {t('salesInvoicesPage.create')}
              </Button>
            )}
          </>
        }
      />

      <section aria-label={t('salesInvoicesPage.kpi.sectionLabel')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('salesInvoicesPage.kpi.count')}
          icon={Receipt}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.count) : '—'}
          hint={summary ? t('salesInvoicesPage.kpi.countHint', { amount: formatRupiah(summary.grandTotal) }) : undefined}
        />
        <StatCard
          label={t('salesInvoicesPage.kpi.receivables')}
          icon={Wallet}
          loading={!summary && !summaryQuery.isError}
          value={kpiMoney(summary?.outstanding)}
          valueTitle={summary ? formatRupiah(summary.outstanding) : undefined}
          hint={summary ? formatRupiah(summary.outstanding) : undefined}
        />
        <StatCard
          label={t('salesInvoicesPage.kpi.paid')}
          icon={CheckCircle2}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.paidCount) : '—'}
          hint={t('salesInvoicesPage.kpi.paidHint')}
        />
        <StatCard
          label={t('salesInvoicesPage.kpi.overdue')}
          icon={AlertTriangle}
          loading={!summary && !summaryQuery.isError}
          value={summary ? formatNumber(summary.overdueCount) : '—'}
          hint={summary ? t('salesInvoicesPage.kpi.overdueHint', { amount: formatRupiah(summary.overdueOutstanding) }) : undefined}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('salesInvoicesPage.search.label')}
          searchPlaceholder={t('salesInvoicesPage.search.placeholder')}
          status={{ options: statusFilter }}
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
          label={t('salesInvoicesPage.table.label')}
          itemLabel={t('salesInvoicesPage.table.itemLabel')}
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
            title: t('salesInvoicesPage.empty.title'),
            description: t('salesInvoicesPage.empty.description'),
            action: canCreate ? (
              <Button size="sm" onClick={() => setIsModalOpen(true)}>
                <Plus aria-hidden />
                {t('salesInvoicesPage.empty.action')}
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
