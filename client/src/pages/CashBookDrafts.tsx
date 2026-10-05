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
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { can } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
const TABS: ReadonlyArray<{ value: string; label: string }> = [
  { value: ALL_TAB, label: 'Semua' },
  { value: 'Draft', label: 'Draft' },
  { value: 'PartiallyPosted', label: 'Sebagian Diposting' },
  { value: 'Posted', label: 'Diposting' },
  { value: 'Discarded', label: 'Dibuang' },
];

const money = (n: number) => formatRupiah(n, { symbol: false });

export const CashBookDrafts = () => {
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
        header: 'Nomor',
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
        header: 'Halaman Buku Kas',
        meta: { hideBelow: 'sm', cellClassName: 'min-w-48 max-w-80' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground" title={row.original.title}>{row.original.title}</p>
            <p className="num truncate text-xs text-muted-foreground">
              {formatDate(row.original.entryDate)} · {row.original.cashAccount ? `${row.original.cashAccount.accountNumber} ${row.original.cashAccount.name}` : '-'}
            </p>
          </div>
        ),
      },
      {
        id: 'source',
        header: 'Sumber',
        meta: { hideBelow: 'lg' },
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <SourceChip source={row.original.source} />
            <span className="max-w-32 truncate text-xs text-muted-foreground">{row.original.createdBy.fullName ?? '-'}</span>
          </div>
        ),
      },
      {
        id: 'rowCount',
        header: 'Baris',
        meta: { align: 'right', hideBelow: 'md', cellClassName: 'num' },
        cell: ({ row }) => formatNumber(row.original.rowCount),
      },
      {
        id: 'totalMasuk',
        header: () => <>Masuk <span className="normal-case">(Rp)</span></>,
        meta: { align: 'right', hideBelow: 'md', cellClassName: 'num' },
        cell: ({ row }) => money(row.original.totalMasuk),
      },
      {
        id: 'totalKeluar',
        header: () => <>Keluar <span className="normal-case">(Rp)</span></>,
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
        header: 'Perlu Ditinjau',
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ row }) => {
          const n = row.original.needsReviewCount;
          return n > 0 ? (
            <span className="num inline-flex items-center gap-1 font-medium text-warning-text">
              <AlertTriangle className="size-3.5" aria-hidden />
              {formatNumber(n)} baris
            </span>
          ) : (
            <span className="text-muted-foreground">-</span>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="cash_book_draft" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions label={`Aksi untuk ${row.original.draftNumber}`} actions={[{ label: 'Tinjau', icon: Eye, onSelect: () => open(row.original.id) }]} />
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `open` only wraps the stable navigate
    [navigate],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Draft Buku Kas"
        description="Halaman buku kas dari foto nota (AIRA) atau tempel/CSV menunggu ditinjau sebelum menjadi jurnal. Draft belum berefek ke buku besar."
        actions={
          canEdit ? (
            <Button onClick={() => setImporting(true)}>
              <ClipboardPaste aria-hidden />
              Buat dari Tempel/CSV
            </Button>
          ) : undefined
        }
      >
        <Tabs value={tab} onValueChange={(v) => list.setFilter('status', v === ALL_TAB ? '' : v)} activationMode="manual">
          <TabsList variant="underline" aria-label="Status draft" className="max-w-full">
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                <span className="inline-flex items-center gap-1.5">
                  {t.label}
                  {countOf(t.value) > 0 && t.value !== 'Discarded' && (
                    <span className="num rounded-full bg-muted px-1.5 py-0.5 text-[11px] font-semibold leading-none text-muted-foreground">
                      {formatNumber(countOf(t.value))}
                    </span>
                  )}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </PageHeader>

      <section aria-label="Ringkasan draft buku kas" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Menunggu Ditinjau" icon={FilePenLine} loading={!query.data} value={formatNumber(counts.Draft ?? 0)} hint="berstatus Draft" />
        <StatCard label="Sebagian Diposting" icon={Layers} loading={!query.data} value={formatNumber(counts.PartiallyPosted ?? 0)} hint="ada baris tersisa" />
        <StatCard label="Sudah Diposting" icon={CheckCheck} loading={!query.data} value={formatNumber(counts.Posted ?? 0)} hint="jurnal terbentuk" />
        <StatCard label="Semua Draft Aktif" icon={ClipboardPaste} loading={!query.data} value={formatNumber(total)} hint="tidak termasuk dibuang" />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari draft buku kas"
          searchPlaceholder="Cari nomor, judul, atau catatan sumber"
          dateRange={{ label: 'Rentang tanggal halaman' }}
        />
        <DataTable
          {...listTableProps(list, query.data?.total)}
          label="Daftar draft buku kas"
          itemLabel="draft"
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
            title: 'Belum ada draft buku kas',
            description: 'Kirim foto nota atau halaman buku kas ke AIRA, atau tempel baris dari Excel/CSV untuk membuat draft.',
            action: canEdit ? (
              <Button size="sm" onClick={() => setImporting(true)}>
                <ClipboardPaste aria-hidden />
                Buat dari Tempel/CSV
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <CashBookImportDialog open={importing} onOpenChange={setImporting} onCreated={(id) => open(id)} />
    </div>
  );
};
