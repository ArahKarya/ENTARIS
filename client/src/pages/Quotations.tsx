/** Quotations (/quotations); lifecycle actions, PDF and conversion live in QuotationDetailDrawer, create/edit in QuotationModal. */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Clock, Download, Eye, FileText, Pencil, Percent, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatDate, formatNumber, formatPercent, formatRupiah, toNumber } from '@/lib/format';
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
import QuotationModal from '@/components/QuotationModal';
import QuotationDetailDrawer from '@/components/QuotationDetailDrawer';

type Money = string | number;

interface QuotationItemRow {
  itemName?: string;
  quantity: Money;
  unit?: string;
  rate: Money;
  discount?: Money;
  taxPct?: Money;
  pphPct?: Money;
  amount: Money;
}

interface QuotationRow {
  id: string;
  quotationNumber: string;
  date: string;
  validUntil: string;
  status: string;
  grandTotal: Money;
  notes?: string | null;
  customer?: { id: string; name: string; phone?: string | null } | null;
  items?: QuotationItemRow[];
  salesInvoice?: { id: string; invoiceNumber: string } | null;
}

interface QuotationSummary {
  count: number;
  grandTotal: number;
  sentCount: number;
  acceptedCount: number;
  issuedCount: number;
  conversionRate: number;
  expiringSoonCount: number;
  awaitingConversionCount: number;
}

/** Stashed by InquiryDetailDrawer before navigating to ?from-inquiry=<id>. */
interface InquiryPrefill {
  inquiryId: string;
  inquiryNumber: string;
  partyId: string;
  notes?: string | null;
  items?: unknown[];
}

const ENDPOINT = '/quotations';
const FILTER_KEYS = ['status', 'partyId', 'startDate', 'endDate'] as const;
const statusFilter = () => statusOptions(['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Cancelled'], 'quotation');
/** Same window as the server's expiringSoonCount. */
const EXPIRING_SOON_DAYS = 3;

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

const num = (v: Money | null | undefined) => toNumber(v) ?? 0;
const money = (v: Money | null | undefined) => formatRupiah(v, { symbol: false });

/** Sent and valid for at most 3 more days. */
function isExpiringSoon(q: QuotationRow, now = Date.now()): boolean {
  if (q.status !== 'Sent' || !q.validUntil) return false;
  const days = (new Date(q.validUntil).getTime() - now) / 86_400_000;
  return days >= 0 && days <= EXPIRING_SOON_DAYS;
}

type ExportColumn =
  | 'number' | 'date' | 'validUntil' | 'customer' | 'status' | 'productName' | 'qty' | 'unit'
  | 'unitPrice' | 'discountPct' | 'vatPct' | 'pphPct' | 'itemSubtotal' | 'grandTotal' | 'salesInvoice' | 'notes';
const col = (key: ExportColumn): string => i18n.t(`sales:quotationsPage.export.${key}`);

function toExportRows(quotations: QuotationRow[]): Record<string, unknown>[] {
  return quotations.flatMap((q) => {
    const items: Array<QuotationItemRow | null> = q.items && q.items.length > 0 ? q.items : [null];
    return items.map((it) => ({
      [col('number')]: q.quotationNumber,
      [col('date')]: formatDate(q.date),
      [col('validUntil')]: formatDate(q.validUntil),
      [col('customer')]: q.customer?.name ?? '',
      [col('status')]: getStatusLabel(q.status, 'quotation'),
      [col('productName')]: it?.itemName ?? '',
      [col('qty')]: it ? num(it.quantity) : '',
      [col('unit')]: it?.unit ?? '',
      [col('unitPrice')]: it ? num(it.rate) : '',
      [col('discountPct')]: it ? num(it.discount) : '',
      [col('vatPct')]: it ? num(it.taxPct) : '',
      [col('pphPct')]: it ? num(it.pphPct) : '',
      [col('itemSubtotal')]: it ? num(it.amount) : '',
      [col('grandTotal')]: num(q.grandTotal),
      [col('salesInvoice')]: q.salesInvoice?.invoiceNumber ?? '',
      [col('notes')]: q.notes ?? '',
    }));
  });
}

export const Quotations = () => {
  const { t } = useTranslation('sales');
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  // QuotationModal reads a full quotation (or an inquiry prefill) as editTarget.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editTarget, setEditTarget] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inquiryPrefill, setInquiryPrefill] = useState<InquiryPrefill | null>(null);
  const [exporting, setExporting] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();
  const canEdit = can('quotation', 'edit');

  // Handle deep-link from Inquiry → Quotation conversion. The inquiry drawer
  // stashes the prefill payload in sessionStorage and navigates with
  // ?from-inquiry=<inquiryId>. We pop it here and open the modal pre-filled.
  useEffect(() => {
    const inquiryId = searchParams.get('from-inquiry');
    if (!inquiryId) return;
    try {
      const raw = sessionStorage.getItem('inquiry-convert-prefill');
      if (raw) {
        const payload = JSON.parse(raw) as InquiryPrefill;
        sessionStorage.removeItem('inquiry-convert-prefill');
        setInquiryPrefill(payload);
        setEditTarget({
          partyId: payload.partyId,
          notes: payload.notes
            ? `${payload.notes}\n\n${t('quotationsPage.fromInquiryNote', { number: payload.inquiryNumber })}`
            : t('quotationsPage.fromInquiryNote', { number: payload.inquiryNumber }),
          items: payload.items ?? [],
        });
        setIsModalOpen(true);
      }
    } catch {
      /* ignore malformed prefill */
    }
    // Clear param so refresh doesn't re-trigger
    searchParams.delete('from-inquiry');
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, setSearchParams, t]);

  const quotationsQuery = useQuery({
    queryKey: ['quotations', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<QuotationRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ['quotations', 'summary', list.filterParams],
    queryFn: async () =>
      (await api.get<QuotationSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const total = quotationsQuery.data?.total;
  const summary = summaryQuery.data;
  // On error the cards fall back to '—' instead of an endless skeleton.
  const summaryLoading = !summary && !summaryQuery.isError;

  const openCreate = () => {
    setEditTarget(null);
    setIsModalOpen(true);
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = { ...list.filterParams, ...(list.params.sort ? { sort: list.params.sort } : {}) };
      const { rows, truncated } = await fetchAllPages<QuotationRow>(ENDPOINT, params);
      const stamp = new Date().toISOString().slice(0, 10);
      exportToExcel(toExportRows(rows), `${t('quotationsPage.export.fileName')}-${stamp}`);
      if (truncated) toast.warning(t('quotationsPage.export.truncated', { count: rows.length, formatted: formatNumber(rows.length) }));
    } catch {
      toast.error(t('quotationsPage.export.failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<QuotationRow>[]>(
    () => [
      {
        id: 'quotationNumber',
        header: t('quotationsPage.columns.number'),
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.quotationNumber}</DocumentLink>
            {/* Mobile: customer stacked here because its column is hidden. */}
            <span className="max-w-44 truncate text-sm font-medium text-foreground sm:hidden">
              {row.original.customer?.name ?? '—'}
            </span>
            <span className="num text-xs text-muted-foreground md:hidden">{formatDate(row.original.date)}</span>
          </div>
        ),
      },
      {
        id: 'date',
        header: t('quotationsPage.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'customer',
        header: t('quotationsPage.columns.customer'),
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
        id: 'validUntil',
        header: t('quotationsPage.columns.validUntil'),
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap' },
        cell: ({ row }) => {
          const soon = isExpiringSoon(row.original);
          return (
            <span
              className={cn('inline-flex items-center gap-1', soon ? 'font-medium text-warning-text' : 'text-muted-foreground')}
              title={soon ? t('quotationsPage.expiringSoonTitle', { count: EXPIRING_SOON_DAYS }) : undefined}
            >
              {formatDate(row.original.validUntil)}
              {soon && (
                <>
                  <AlertTriangle className="size-3.5" aria-hidden />
                  <span className="sr-only">{t('quotationsPage.expiringSoonSr')}</span>
                </>
              )}
            </span>
          );
        },
      },
      {
        id: 'grandTotal',
        header: () => withUnit(t('quotationsPage.columns.total')),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex flex-col items-end gap-1">
            <span className="font-medium text-foreground">{money(row.original.grandTotal)}</span>
            {/* Mobile: status stacked here because its column is hidden. */}
            <StatusBadge status={row.original.status} docType="quotation" className="sm:hidden" />
          </div>
        ),
      },
      {
        id: 'status',
        header: t('quotationsPage.columns.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="quotation" />,
      },
      {
        id: 'conversion',
        header: t('quotationsPage.columns.conversion'),
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const q = row.original;
          if (q.salesInvoice) {
            return <span className="num font-mono text-xs text-success-text">{q.salesInvoice.invoiceNumber}</span>;
          }
          if (q.status === 'Accepted') return <span className="text-xs text-info-text">{t('quotationsPage.notConverted')}</span>;
          return <span className="text-muted-foreground">—</span>;
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('quotationsPage.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const q = row.original;
          return (
            <RowActions
              label={t('quotationsPage.rowActions.label', { number: q.quotationNumber })}
              actions={[
                { label: t('quotationsPage.rowActions.view'), icon: Eye, onSelect: () => setSelectedId(q.id) },
                {
                  label: t('quotationsPage.rowActions.edit'),
                  icon: Pencil,
                  hidden: !canEdit || q.status !== 'Draft',
                  onSelect: () => {
                    setEditTarget(q);
                    setIsModalOpen(true);
                  },
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, t],
  );

  const sentHint = summary
    ? summary.expiringSoonCount > 0
      ? t('quotationsPage.stats.expiringSoon', { count: summary.expiringSoonCount, formatted: formatNumber(summary.expiringSoonCount) })
      : t('quotationsPage.stats.awaitingConfirmation')
    : undefined;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('quotationsPage.title')}
        description={t('quotationsPage.description')}
        actions={
          <>
            <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!total}>
              <Download aria-hidden />
              <span className="sr-only sm:not-sr-only">{t('quotationsPage.exportExcel')}</span>
            </Button>
            {canEdit && (
              <Button onClick={openCreate}>
                <Plus aria-hidden />
                {t('quotationsPage.create')}
              </Button>
            )}
          </>
        }
      />

      <section aria-label={t('quotationsPage.stats.regionLabel')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('quotationsPage.stats.count')}
          icon={FileText}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.count) : '—'}
          hint={summary ? t('quotationsPage.stats.value', { amount: formatRupiah(summary.grandTotal) }) : undefined}
        />
        <StatCard
          label={t('quotationsPage.stats.sent')}
          icon={Clock}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.sentCount) : '—'}
          hint={sentHint}
        />
        <StatCard
          label={t('quotationsPage.stats.accepted')}
          icon={CheckCircle2}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.acceptedCount) : '—'}
          hint={summary ? t('quotationsPage.stats.awaitingConversion', { count: summary.awaitingConversionCount, formatted: formatNumber(summary.awaitingConversionCount) }) : undefined}
        />
        <StatCard
          label={t('quotationsPage.stats.conversionRate')}
          icon={Percent}
          loading={summaryLoading}
          value={summary ? formatPercent(summary.conversionRate) : '—'}
          hint={summary ? t('quotationsPage.stats.ofIssued', { count: summary.issuedCount, formatted: formatNumber(summary.issuedCount) }) : undefined}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('quotationsPage.search.label')}
          searchPlaceholder={t('quotationsPage.search.placeholder')}
          status={{ options: statusFilter() }}
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
          label={t('quotationsPage.table.label')}
          itemLabel={t('quotationsPage.table.itemLabel')}
          columns={columns}
          data={quotationsQuery.data?.data}
          getRowId={(row) => row.id}
          loading={quotationsQuery.isLoading}
          fetching={quotationsQuery.isFetching && quotationsQuery.isPlaceholderData}
          error={quotationsQuery.error}
          onRetry={() => quotationsQuery.refetch()}
          onRowClick={(row) => setSelectedId(row.id)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('quotationsPage.empty.title'),
            description: t('quotationsPage.empty.description'),
            action: canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                {t('quotationsPage.empty.action')}
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <QuotationModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditTarget(null);
          setInquiryPrefill(null);
        }}
        editTarget={editTarget}
        onCreated={async (q) => {
          if (inquiryPrefill?.inquiryId && q?.id) {
            try {
              await api.post(`/inquiries/${inquiryPrefill.inquiryId}/link`, { salesInvoiceId: undefined, quotationId: q.id });
            } catch {
              /* ignore */
            }
            setInquiryPrefill(null);
          }
        }}
      />

      <QuotationDetailDrawer
        quotationId={selectedId}
        onClose={() => setSelectedId(null)}
        onEdit={(q) => {
          setSelectedId(null);
          setEditTarget(q);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
};

export default Quotations;
