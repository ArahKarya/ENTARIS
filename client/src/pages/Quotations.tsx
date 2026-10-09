/** Quotations (/quotations); lifecycle actions, PDF and conversion live in QuotationDetailDrawer, create/edit in QuotationModal. */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Clock, Download, Eye, FileText, Pencil, Percent, Plus } from 'lucide-react';
import { toast } from 'sonner';
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
const STATUS_FILTER = statusOptions(['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired', 'Cancelled'], 'quotation');
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

function toExportRows(quotations: QuotationRow[]): Record<string, unknown>[] {
  return quotations.flatMap((q) => {
    const items: Array<QuotationItemRow | null> = q.items && q.items.length > 0 ? q.items : [null];
    return items.map((it) => ({
      'No. Penawaran': q.quotationNumber,
      Tanggal: formatDate(q.date),
      'Berlaku Sampai': formatDate(q.validUntil),
      Pelanggan: q.customer?.name ?? '',
      Status: getStatusLabel(q.status, 'quotation'),
      'Nama Produk': it?.itemName ?? '',
      Qty: it ? num(it.quantity) : '',
      Unit: it?.unit ?? '',
      'Harga Satuan': it ? num(it.rate) : '',
      'Diskon (%)': it ? num(it.discount) : '',
      'PPN (%)': it ? num(it.taxPct) : '',
      'PPh (%)': it ? num(it.pphPct) : '',
      'Subtotal Item': it ? num(it.amount) : '',
      'Grand Total Penawaran': num(q.grandTotal),
      'Sales Invoice': q.salesInvoice?.invoiceNumber ?? '',
      Catatan: q.notes ?? '',
    }));
  });
}

export const Quotations = () => {
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
            ? `${payload.notes}\n\n[Dari inquiry ${payload.inquiryNumber}]`
            : `[Dari inquiry ${payload.inquiryNumber}]`,
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
  }, [searchParams, setSearchParams]);

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
  // On error the cards fall back to '-' instead of an endless skeleton.
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
      exportToExcel(toExportRows(rows), `penawaran-${stamp}`);
      if (truncated) toast.warning(`Ekspor dibatasi ${formatNumber(rows.length)} penawaran pertama. Persempit filter.`);
    } catch {
      toast.error('Gagal mengekspor penawaran. Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<QuotationRow>[]>(
    () => [
      {
        id: 'quotationNumber',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.quotationNumber}</DocumentLink>
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
        id: 'validUntil',
        header: 'Berlaku Sampai',
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap' },
        cell: ({ row }) => {
          const soon = isExpiringSoon(row.original);
          return (
            <span
              className={cn('inline-flex items-center gap-1', soon ? 'font-medium text-warning-text' : 'text-muted-foreground')}
              title={soon ? 'Segera kedaluwarsa (≤ 3 hari)' : undefined}
            >
              {formatDate(row.original.validUntil)}
              {soon && (
                <>
                  <AlertTriangle className="size-3.5" aria-hidden />
                  <span className="sr-only">(segera kedaluwarsa)</span>
                </>
              )}
            </span>
          );
        },
      },
      {
        id: 'grandTotal',
        header: () => withUnit('Total'),
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
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="quotation" />,
      },
      {
        id: 'conversion',
        header: 'Konversi',
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const q = row.original;
          if (q.salesInvoice) {
            return <span className="num font-mono text-xs text-success-text">{q.salesInvoice.invoiceNumber}</span>;
          }
          if (q.status === 'Accepted') return <span className="text-xs text-info-text">Belum dikonversi</span>;
          return <span className="text-muted-foreground">-</span>;
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const q = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${q.quotationNumber}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => setSelectedId(q.id) },
                {
                  label: 'Edit',
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
    [canEdit],
  );

  const sentHint = summary
    ? summary.expiringSoonCount > 0
      ? `${formatNumber(summary.expiringSoonCount)} segera kedaluwarsa`
      : 'menunggu konfirmasi'
    : undefined;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Penawaran"
        description="Kelola dokumen penawaran ke pelanggan dan konversi ke faktur penjualan."
        actions={
          <>
            <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!total}>
              <Download aria-hidden />
              <span className="sr-only sm:not-sr-only">Ekspor Excel</span>
            </Button>
            {canEdit && (
              <Button onClick={openCreate}>
                <Plus aria-hidden />
                Buat Penawaran
              </Button>
            )}
          </>
        }
      />

      <section aria-label="Ringkasan penawaran sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jumlah Penawaran"
          icon={FileText}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.count) : '-'}
          hint={summary ? `Nilai ${formatRupiah(summary.grandTotal)}` : undefined}
        />
        <StatCard
          label="Terkirim"
          icon={Clock}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.sentCount) : '-'}
          hint={sentHint}
        />
        <StatCard
          label="Diterima"
          icon={CheckCircle2}
          loading={summaryLoading}
          value={summary ? formatNumber(summary.acceptedCount) : '-'}
          hint={summary ? `${formatNumber(summary.awaitingConversionCount)} belum dikonversi` : undefined}
        />
        <StatCard
          label="Tingkat Konversi"
          icon={Percent}
          loading={summaryLoading}
          value={summary ? formatPercent(summary.conversionRate) : '-'}
          hint={summary ? `dari ${formatNumber(summary.issuedCount)} diterbitkan` : undefined}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari penawaran"
          searchPlaceholder="Cari nomor atau pelanggan"
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
          label="Daftar penawaran"
          itemLabel="penawaran"
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
            title: 'Belum ada penawaran',
            description: 'Penawaran yang Anda buat akan muncul di sini.',
            action: canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                Buat penawaran pertama
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
