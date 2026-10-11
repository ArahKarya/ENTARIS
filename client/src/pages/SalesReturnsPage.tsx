/**
 * Sales returns (/sales-returns). Returns have no detail view yet, so rows are not clickable;
 * the source invoice number opens the invoice drawer.
 */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Ban, Plus } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cap, can } from '@/lib/permissions';
import { formatDate, formatRupiah, toNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DocumentLink,
  ConfirmDialog,
  FilterBar,
  PageHeader,
  PartyFilter,
  RowActions,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import SalesReturnModal from '@/components/SalesReturnModal';
import InvoiceDetailDrawer from '@/components/InvoiceDetailDrawer';

type Money = string | number;

interface SalesReturnRow {
  id: string;
  returnNumber: string;
  date: string;
  status: string;
  totalReturn: Money;
  arReducedAmount: Money;
  creditCreatedAmount: Money;
  reason?: string | null;
  customer?: { id: string; name: string } | null;
  salesInvoice?: { id: string; invoiceNumber: string } | null;
}

const ENDPOINT = '/sales-returns';
const FILTER_KEYS = ['status', 'partyId', 'startDate', 'endDate'] as const;
const STATUS_VALUES = ['Submitted', 'Cancelled'];

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

const money = (v: Money | null | undefined) => formatRupiah(toNumber(v) ?? 0, { symbol: false });

/** Amount cell: zero splits are shown muted so the meaningful leg stands out. */
function Amount({ value, strong = false }: { value: Money; strong?: boolean }) {
  const n = toNumber(value) ?? 0;
  if (n === 0) return <span className="text-muted-foreground">{money(0)}</span>;
  return <span className={strong ? 'font-medium text-foreground' : 'text-foreground'}>{money(n)}</span>;
}

function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : fallback;
}

export default function SalesReturnsPage() {
  const { t } = useTranslation('sales');
  // Built per render so status labels follow language changes.
  const statusFilter = statusOptions(STATUS_VALUES, 'sales_return');
  const queryClient = useQueryClient();
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [modalOpen, setModalOpen] = useState(false);
  const [invoiceId, setInvoiceId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; returnNumber: string } | null>(null);

  const canCreate = can('sales_return', 'edit');
  // Unchanged rule: only approvers may cancel a return (server also needs doc.cancel).
  const canCancel = cap('approval.decide') && canCreate;
  const canOpenInvoice = can('sales_invoice');

  const returnsQuery = useQuery({
    queryKey: ['sales-returns', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<SalesReturnRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const cancelMutation = useMutation({
    mutationFn: async (id: string) => api.post(`${ENDPOINT}/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-returns'] });
      queryClient.invalidateQueries({ queryKey: ['sales-invoices'] });
      toast.success(t('salesReturnsPage.toast.cancelled'));
    },
    onError: (err: unknown) => toast.error(errorMessage(err, t('salesReturnsPage.toast.cancelFailed'))),
  });

  const { isPending: cancelling } = cancelMutation;

  const columns = useMemo<ColumnDef<SalesReturnRow>[]>(() => {
    const invoiceRef = (r: SalesReturnRow, className?: string) => {
      const inv = r.salesInvoice;
      if (!inv) return <span className="text-muted-foreground">—</span>;
      if (!canOpenInvoice) return <span className={`num font-mono text-xs ${className ?? ''}`}>{inv.invoiceNumber}</span>;
      return (
        <DocumentLink focusable onClick={() => setInvoiceId(inv.id)} className={className}>
          {inv.invoiceNumber}
        </DocumentLink>
      );
    };

    return [
      {
        id: 'returnNumber',
        header: t('salesReturnsPage.columns.number'),
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <span className="num font-mono text-xs font-medium text-foreground">{row.original.returnNumber}</span>
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
        header: t('salesReturnsPage.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'customer',
        header: t('salesReturnsPage.columns.customer'),
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.customer?.name ?? '—'}</p>
            {row.original.reason && (
              <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                {row.original.reason}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'invoice',
        header: t('salesReturnsPage.columns.sourceInvoice'),
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => invoiceRef(row.original),
      },
      {
        id: 'totalReturn',
        header: () => withUnit(t('salesReturnsPage.columns.totalReturn')),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex flex-col items-end gap-1">
            <Amount value={row.original.totalReturn} strong />
            {/* Mobile: status stacked here because its column is hidden. */}
            <StatusBadge status={row.original.status} docType="sales_return" className="sm:hidden" />
          </div>
        ),
      },
      {
        id: 'arReducedAmount',
        header: () => withUnit(t('salesReturnsPage.columns.arReduced')),
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ row }) => <Amount value={row.original.arReducedAmount} />,
      },
      {
        id: 'creditCreatedAmount',
        header: () => withUnit(t('salesReturnsPage.columns.creditCreated')),
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ row }) => <Amount value={row.original.creditCreatedAmount} />,
      },
      {
        id: 'status',
        header: t('salesReturnsPage.columns.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="sales_return" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('salesReturnsPage.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <RowActions
              label={t('salesReturnsPage.rowActions', { number: r.returnNumber })}
              actions={[
                {
                  label: t('salesReturnsPage.cancelAction'),
                  icon: Ban,
                  tone: 'danger',
                  hidden: !canCancel || r.status !== 'Submitted',
                  disabled: cancelling,
                  onSelect: () => setCancelTarget({ id: r.id, returnNumber: r.returnNumber }),
                },
              ]}
            />
          );
        },
      },
    ];
  }, [canCancel, canOpenInvoice, cancelling, t]);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('salesReturnsPage.title')}
        description={t('salesReturnsPage.description')}
        actions={
          canCreate && (
            <Button onClick={() => setModalOpen(true)}>
              <Plus aria-hidden />
              {t('salesReturnsPage.create')}
            </Button>
          )
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('salesReturnsPage.searchLabel')}
          searchPlaceholder={t('salesReturnsPage.searchPlaceholder')}
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
          {...listTableProps(list, returnsQuery.data?.total)}
          label={t('salesReturnsPage.tableLabel')}
          itemLabel={t('salesReturnsPage.itemLabel')}
          columns={columns}
          data={returnsQuery.data?.data}
          getRowId={(row) => row.id}
          loading={returnsQuery.isLoading}
          fetching={returnsQuery.isFetching && returnsQuery.isPlaceholderData}
          error={returnsQuery.error}
          onRetry={() => returnsQuery.refetch()}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('salesReturnsPage.empty.title'),
            description: t('salesReturnsPage.empty.description'),
            action: canCreate ? (
              <Button size="sm" onClick={() => setModalOpen(true)}>
                <Plus aria-hidden />
                {t('salesReturnsPage.empty.action')}
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <SalesReturnModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        tone="danger"
        title={t('salesReturnsPage.confirm.title', { number: cancelTarget?.returnNumber ?? '' })}
        description={t('salesReturnsPage.confirm.description')}
        confirmLabel={t('salesReturnsPage.confirm.confirm')}
        cancelLabel={t('salesReturnsPage.confirm.cancel')}
        loading={cancelling}
        onConfirm={() => (cancelTarget ? cancelMutation.mutateAsync(cancelTarget.id) : undefined)}
      />
      <InvoiceDetailDrawer type="sales" invoiceId={invoiceId} onClose={() => setInvoiceId(null)} />
    </div>
  );
}
