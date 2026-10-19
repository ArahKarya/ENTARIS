/**
 * Draft Buku Kas (/cash-book-drafts) — cash book pages read from a photo/receipt by
 * AIRA (or pasted/uploaded by hand) wait here as drafts until a person reviews and
 * posts them. A draft has no effect on the ledger. List-kit page: status tabs, search,
 * date range and paging all live in the URL (see pages/SalesInvoices.tsx).
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, ClipboardPaste, Eye, FilePenLine, CheckCheck, Layers } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { getStatusLabel } from '@/lib/status';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { can } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DataTable,
  DocumentLink,
  FilterBar,
  PageHeader,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import { CashBookImportDialog } from '@/components/cash-book/CashBookImportDialog';
import { SourceChip } from '@/components/cash-book/SourceChip';
import { CB_ENDPOINT, type DraftListItem } from '@/components/cash-book/cash-book';

type ListResponse = Paginated<DraftListItem> & { counts: Record<string, number> };

const FILTER_KEYS = ['status', 'startDate', 'endDate'] as const;
const ALL_TAB = 'all';
/** "All" plus the draft statuses; status labels come from the status registry. */
const TABS: readonly string[] = [ALL_TAB, 'Draft', 'PartiallyPosted', 'Posted', 'Discarded'];

const money = (n: number) => formatRupiah(n, { symbol: false });

export const CashBookDrafts = () => {
  const { t } = useTranslation('finance');
  const navigate = useNavigate();
  const list = useListState({ filters: FILTER_KEYS, defaultSort: null });
  const [density, setDensity] = useTableDensity();
  const [importing, setImporting] = useState(false);
  const canEdit = can('journal', 'edit');

  const query = useQuery({
    queryKey: ['cash-book-drafts', 'list', list.params],
    queryFn: async () => (await api.get<ListResponse>(CB_ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });
  const counts = query.data?.counts ?? {};
  const tab = list.filters.status || ALL_TAB;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const countOf = (value: string) => (value === ALL_TAB ? total : counts[value] ?? 0);
  const open = (id: string) => navigate(`${CB_ENDPOINT}/${id}`);

  const columns = useMemo<ColumnDef<DraftListItem>[]>(
    () => [
      {
        id: 'draftNumber',
        header: t('cashBookDrafts.columns.number'),
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <DocumentLink onClick={() => open(r.id)}>{r.draftNumber}</DocumentLink>
              <span className="max-w-44 truncate text-sm text-foreground sm:hidden">{r.title}</span>
              <span className="num text-xs text-muted-foreground md:hidden">{formatDate(r.entryDate)}</span>
            </div>
          );
        },
      },
      {
        id: 'title',
        header: t('cashBookDrafts.columns.page'),
        meta: { hideBelow: 'sm', cellClassName: 'min-w-48 max-w-80' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground" title={row.original.title}>{row.original.title}</p>
            <p className="num truncate text-xs text-muted-foreground">
              {formatDate(row.original.entryDate)} · {row.original.cashAccount ? `${row.original.cashAccount.accountNumber} ${row.original.cashAccount.name}` : '—'}
            </p>
          </div>
        ),
      },
      {
        id: 'source',
        header: t('cashBookDrafts.columns.source'),
        meta: { hideBelow: 'lg' },
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <SourceChip source={row.original.source} />
            <span className="max-w-32 truncate text-xs text-muted-foreground">{row.original.createdBy.fullName ?? '—'}</span>
          </div>
        ),
      },
      {
        id: 'rowCount',
        header: t('cashBookDrafts.columns.rows'),
        meta: { align: 'right', hideBelow: 'md', cellClassName: 'num' },
        cell: ({ row }) => formatNumber(row.original.rowCount),
      },
      {
        id: 'totalMasuk',
        header: () => <>{t('cashBookDrafts.columns.in')} <span className="normal-case">(Rp)</span></>,
        meta: { align: 'right', hideBelow: 'md', cellClassName: 'num' },
        cell: ({ row }) => money(row.original.totalMasuk),
      },
      {
        id: 'totalKeluar',
        header: () => <>{t('cashBookDrafts.columns.out')} <span className="normal-case">(Rp)</span></>,
        meta: { align: 'right', cellClassName: 'num' },
        cell: ({ row }) => (
          <div className="flex flex-col items-end gap-1">
            <span className="font-medium text-foreground">{money(row.original.totalKeluar)}</span>
            <StatusBadge status={row.original.status} docType="cash_book_draft" className="sm:hidden" />
          </div>
        ),
      },
      {
        id: 'needsReview',
        header: t('cashBookDrafts.columns.needsReview'),
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ row }) => {
          const n = row.original.needsReviewCount;
          return n > 0 ? (
            <span className="num inline-flex items-center gap-1 font-medium text-warning-text">
              <AlertTriangle className="size-3.5" aria-hidden />
              {t('cashBookDrafts.rowCount', { count: n })}
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          );
        },
      },
      {
        id: 'status',
        header: t('cashBookDrafts.columns.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="cash_book_draft" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('cashBookDrafts.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={t('cashBookDrafts.rowActions', { number: row.original.draftNumber })}
            actions={[{ label: t('cashBookDrafts.actions.review'), icon: Eye, onSelect: () => open(row.original.id) }]}
          />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `open` only wraps the stable navigate
    [navigate, t],
  );

  return (
    <Tabs value={tab} onValueChange={(v) => list.setFilter('status', v === ALL_TAB ? '' : v)} activationMode="manual" className="space-y-5 pb-8">
      <PageHeader
        title={t('cashBookDrafts.title')}
        description={t('cashBookDrafts.description')}
        actions={
          canEdit ? (
            <Button onClick={() => setImporting(true)}>
              <ClipboardPaste aria-hidden />
              {t('cashBookDrafts.createFromPaste')}
            </Button>
          ) : undefined
        }
      >
        <TabsList variant="underline" aria-label={t('cashBookDrafts.tabs.label')} className="max-w-full">
            {TABS.map((value) => (
              <TabsTrigger key={value} value={value}>
                <span className="inline-flex items-center gap-1.5">
                  {value === ALL_TAB ? t('cashBookDrafts.tabs.all') : getStatusLabel(value, 'cash_book_draft')}
                  {countOf(value) > 0 && value !== 'Discarded' && (
                    <span className="num rounded-sm bg-muted px-1.5 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground">
                      {formatNumber(countOf(value))}
                    </span>
                  )}
                </span>
              </TabsTrigger>
            ))}
        </TabsList>
      </PageHeader>

      <TabsContent value={tab} className="mt-0 space-y-5">

      <section aria-label={t('cashBookDrafts.summary.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('cashBookDrafts.summary.waiting')} icon={FilePenLine} loading={!query.data} value={formatNumber(counts.Draft ?? 0)} hint={t('cashBookDrafts.summary.waitingHint')} />
        <StatCard label={t('cashBookDrafts.summary.partial')} icon={Layers} loading={!query.data} value={formatNumber(counts.PartiallyPosted ?? 0)} hint={t('cashBookDrafts.summary.partialHint')} />
        <StatCard label={t('cashBookDrafts.summary.posted')} icon={CheckCheck} loading={!query.data} value={formatNumber(counts.Posted ?? 0)} hint={t('cashBookDrafts.summary.postedHint')} />
        <StatCard label={t('cashBookDrafts.summary.all')} icon={ClipboardPaste} loading={!query.data} value={formatNumber(total)} hint={t('cashBookDrafts.summary.allHint')} />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('cashBookDrafts.filters.searchLabel')}
          searchPlaceholder={t('cashBookDrafts.filters.searchPlaceholder')}
          dateRange={{ label: t('cashBookDrafts.filters.dateRange') }}
        />
        <DataTable
          {...listTableProps(list, query.data?.total)}
          label={t('cashBookDrafts.table.label')}
          itemLabel={t('cashBookDrafts.table.itemLabel')}
          columns={columns}
          data={query.data?.data}
          getRowId={(row) => row.id}
          loading={query.isLoading}
          fetching={query.isFetching && query.isPlaceholderData}
          error={query.error}
          onRetry={() => query.refetch()}
          onRowClick={(row) => open(row.id)}
          rowClassName={(row) => (row.status === 'Discarded' ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('cashBookDrafts.empty.title'),
            description: t('cashBookDrafts.empty.description'),
            action: canEdit ? (
              <Button size="sm" onClick={() => setImporting(true)}>
                <ClipboardPaste aria-hidden />
                {t('cashBookDrafts.createFromPaste')}
              </Button>
            ) : undefined,
          }}
        />
      </div>

      </TabsContent>

      <CashBookImportDialog open={importing} onOpenChange={setImporting} onCreated={(id) => open(id)} />
    </Tabs>
  );
};
