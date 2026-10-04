/**
 * Jurnal Umum (/gl) — server-paginated journal list on the Phase 3 list kit
 * (pattern: pages/SalesInvoices.tsx). GET /journals keeps its original
 * response shape ({ data, total, page, limit }, each entry with its lines);
 * filters/sort live in server/src/services/journalList.ts.
 *
 * Opens on the current month (as before) unless the URL already carries list
 * params; Reset clears it to "all periods".
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarRange, ChevronDown, Eye, Info, Plus, Upload, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatRupiah, toNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { can } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ComboboxFilter,
  ConfirmDialog,
  DataTable,
  DocumentLink,
  FilterBar,
  PageHeader,
  RowActions,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import JournalEntryModal from '@/components/JournalEntryModal';
import ImportModal from '@/components/ImportModal';
import JournalDetailDrawer from '@/components/JournalDetailDrawer';

type Money = string | number;

interface JournalLine {
  id: string;
  debit: Money;
  credit: Money;
  description?: string | null;
  account: { accountNumber: string; name: string };
}

interface JournalRow {
  id: string;
  entryNumber: string;
  date: string;
  status: string;
  narration: string | null;
  items: JournalLine[];
  user?: { fullName: string } | null;
}

interface AccountOption {
  id: string;
  accountNumber: string;
  name: string;
  isGroup: boolean;
}

const ENDPOINT = '/journals';
const FILTER_KEYS = ['status', 'accountId', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(['Submitted', 'Cancelled'], 'journal');
/** Same guard as PATCH /journals/:id/cancel: auto journals are cancelled at their source. */
const AUTO_JOURNAL = /^JV-(PAY|SI|PI|COGS)/;
/** URL params that mean "the user already chose what to see". */
const LIST_URL_KEYS = ['q', 'page', 'sort', ...FILTER_KEYS];

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

const money = (v: number) => formatRupiah(v, { symbol: false });
/** Cancelled entries no longer count: amounts recede like the rest of the row. */
const amountClass = (status: string) =>
  status === 'Cancelled' ? 'text-muted-foreground' : 'font-medium text-foreground';

/** Sum in cents so many 2-decimal lines do not drift. */
function lineTotals(items: readonly JournalLine[]): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  for (const it of items) {
    debit += Math.round((toNumber(it.debit) ?? 0) * 100);
    credit += Math.round((toNumber(it.credit) ?? 0) * 100);
  }
  return { debit: debit / 100, credit: credit / 100 };
}

const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type Preset = 'today' | 'week' | 'month' | 'lastMonth' | 'year';

const PRESETS: Array<{ key: Preset; label: string }> = [
  { key: 'today', label: 'Hari ini' },
  { key: 'week', label: 'Minggu ini' },
  { key: 'month', label: 'Bulan ini' },
  { key: 'lastMonth', label: 'Bulan lalu' },
  { key: 'year', label: 'Tahun ini (YTD)' },
];

function presetRange(preset: Preset, now = new Date()): { startDate: string; endDate: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (preset) {
    case 'today':
      return { startDate: ymd(now), endDate: ymd(now) };
    case 'week': {
      // Monday → today
      const monday = new Date(y, m, now.getDate() - ((now.getDay() + 6) % 7));
      return { startDate: ymd(monday), endDate: ymd(now) };
    }
    case 'lastMonth':
      return { startDate: ymd(new Date(y, m - 1, 1)), endDate: ymd(new Date(y, m, 0)) };
    case 'year':
      return { startDate: ymd(new Date(y, 0, 1)), endDate: ymd(now) };
    case 'month':
    default:
      return { startDate: ymd(new Date(y, m, 1)), endDate: ymd(new Date(y, m + 1, 0)) };
  }
}

/** Leaf accounts for the account filter (shares the ['coa-flat'] cache). */
function useAccountOptions() {
  const query = useQuery<AccountOption[] | { data: AccountOption[] }>({
    queryKey: ['coa-flat'],
    queryFn: async () => (await api.get('/coa/flat')).data,
    staleTime: 5 * 60_000,
  });
  const options = useMemo(() => {
    const raw = query.data;
    const all = Array.isArray(raw) ? raw : (raw?.data ?? []);
    return all
      .filter((a) => !a.isGroup)
      .map((a) => ({ value: a.id, label: a.name, hint: a.accountNumber }));
  }, [query.data]);
  return { options, loading: query.isLoading };
}

export const GeneralLedger = () => {
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; entryNumber: string } | null>(null);
  const canEdit = can('journal', 'edit');
  const queryClient = useQueryClient();
  const accounts = useAccountOptions();

  // Default to the current month so recent entries are not buried (since
  // 2026-05-24); skipped when the URL already says what to show.
  const [pendingDefault, setPendingDefault] = useState(() => !LIST_URL_KEYS.some((k) => searchParams.has(k)));
  useEffect(() => {
    if (!pendingDefault) return;
    const next = new URLSearchParams(searchParams);
    const range = presetRange('month');
    next.set('startDate', range.startDate);
    next.set('endDate', range.endDate);
    setSearchParams(next, { replace: true });
    setPendingDefault(false);
    // Runs once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const journalsQuery = useQuery({
    queryKey: ['journals', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<JournalRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
    enabled: !pendingDefault,
  });
  const total = journalsQuery.data?.total;

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/journals/${id}/cancel`),
    onSuccess: () => {
      toast.success('Jurnal berhasil dibatalkan.');
      queryClient.invalidateQueries({ queryKey: ['journals'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(message || 'Gagal membatalkan jurnal.');
    },
  });

  const columns = useMemo<ColumnDef<JournalRow>[]>(
    () => [
      {
        id: 'entryNumber',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.entryNumber}</DocumentLink>
            {/* Mobile: narration and date stacked here because their columns are hidden. */}
            <span className="line-clamp-2 max-w-48 text-sm break-words sm:hidden">
              {row.original.narration || '-'}
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
        id: 'narration',
        header: 'Keterangan',
        meta: { hideBelow: 'sm', cellClassName: 'min-w-44 max-w-80' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="line-clamp-2 break-words" title={row.original.narration ?? undefined}>
              {row.original.narration || '-'}
            </p>
            {row.original.user?.fullName && (
              <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                oleh {row.original.user.fullName}
              </p>
            )}
          </div>
        ),
      },
      {
        id: 'accounts',
        header: 'Rincian Akun',
        meta: { hideBelow: 'lg', cellClassName: 'min-w-52 max-w-72' },
        cell: ({ row }) => {
          const lines = row.original.items;
          return (
            <ul className="flex min-w-0 flex-col gap-0.5 text-xs">
              {lines.slice(0, 2).map((it) => (
                <li key={it.id} className="flex min-w-0 items-baseline gap-1.5">
                  <span className="num shrink-0 text-muted-foreground">{it.account.accountNumber}</span>
                  <span className="truncate text-foreground">{it.account.name}</span>
                </li>
              ))}
              {lines.length > 2 && <li className="font-medium text-primary">+{lines.length - 2} lainnya</li>}
            </ul>
          );
        },
      },
      {
        id: 'debit',
        header: () => withUnit('Debit'),
        meta: { align: 'right' },
        cell: ({ row }) => {
          const { debit } = lineTotals(row.original.items);
          return (
            <div className="flex flex-col items-end gap-1">
              <span className={amountClass(row.original.status)}>{money(debit)}</span>
              {/* Mobile: status stacked here because its column is hidden. */}
              <StatusBadge status={row.original.status} docType="journal" className="sm:hidden" />
            </div>
          );
        },
      },
      {
        id: 'credit',
        header: () => withUnit('Kredit'),
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => (
          <span className={amountClass(row.original.status)}>{money(lineTotals(row.original.items).credit)}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="journal" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const je = row.original;
          const auto = AUTO_JOURNAL.test(je.entryNumber);
          return (
            <RowActions
              label={`Aksi untuk ${je.entryNumber}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => setSelectedId(je.id) },
                {
                  label: auto ? 'Batalkan dari modul asal' : 'Batalkan jurnal',
                  icon: XCircle,
                  tone: 'danger',
                  disabled: auto,
                  hidden: !canEdit || je.status === 'Cancelled',
                  onSelect: () => setCancelTarget({ id: je.id, entryNumber: je.entryNumber }),
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Jurnal Umum"
        description="Kelola dan tinjau semua transaksi jurnal harian."
        actions={
          canEdit ? (
            <>
              <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                <Upload aria-hidden />
                <span className="sr-only sm:not-sr-only">Impor</span>
              </Button>
              <Button onClick={() => setIsModalOpen(true)}>
                <Plus aria-hidden />
                Buat Jurnal
              </Button>
            </>
          ) : undefined
        }
      />

      {canEdit && (
        <aside
          aria-label="Cara kerja pembatalan jurnal"
          className="flex gap-2.5 rounded-md border border-warning/30 bg-warning-subtle px-3.5 py-2.5 text-sm text-warning-text"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Jurnal otomatis (<span className="num">JV-PAY</span>, <span className="num">JV-SI</span>,{' '}
            <span className="num">JV-PI</span>, <span className="num">JV-COGS</span>) dibatalkan dari modul asalnya
            agar faktur, pembayaran, dan saldo ikut diperbarui. Halaman ini hanya membatalkan jurnal manual.
          </p>
        </aside>
      )}

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari jurnal"
          searchPlaceholder="Cari nomor, keterangan, akun"
          status={{ options: STATUS_FILTER }}
          dateRange
        >
          <ComboboxFilter
            label="Akun"
            allLabel="Semua akun"
            searchPlaceholder="Cari nomor/nama akun…"
            value={list.filters.accountId}
            onChange={(v) => list.setFilter('accountId', v)}
            options={accounts.options}
            loading={accounts.loading}
            className="w-[calc(50%-0.25rem)] sm:w-52"
          />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <CalendarRange aria-hidden />
                Periode
                <ChevronDown aria-hidden className="text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              {PRESETS.map((p) => (
                <DropdownMenuItem key={p.key} onSelect={() => list.setFilters(presetRange(p.key))}>
                  {p.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </FilterBar>

        <DataTable
          {...listTableProps(list, total)}
          label="Daftar jurnal umum"
          itemLabel="jurnal"
          columns={columns}
          data={journalsQuery.data?.data}
          getRowId={(row) => row.id}
          loading={pendingDefault || journalsQuery.isLoading}
          fetching={journalsQuery.isFetching && journalsQuery.isPlaceholderData}
          error={journalsQuery.error}
          onRetry={() => journalsQuery.refetch()}
          onRowClick={(row) => setSelectedId(row.id)}
          rowClassName={(row) => (row.status === 'Cancelled' ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada transaksi jurnal',
            description: 'Jurnal manual dan jurnal otomatis dari modul lain akan muncul di sini.',
            action: canEdit ? (
              <Button size="sm" onClick={() => setIsModalOpen(true)}>
                <Plus aria-hidden />
                Buat jurnal pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <JournalEntryModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      <ImportModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} importType="journals" />

      <JournalDetailDrawer journalEntryId={selectedId} onClose={() => setSelectedId(null)} />

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        tone="danger"
        title="Batalkan Jurnal"
        description={`Apakah Anda yakin ingin membatalkan jurnal ${cancelTarget?.entryNumber ?? ''}? Saldo akun terkait akan dikembalikan. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Ya, Batalkan"
        loading={cancelMutation.isPending}
        onConfirm={() => (cancelTarget ? cancelMutation.mutateAsync(cancelTarget.id) : undefined)}
      />
    </div>
  );
};
