/**
 * "Posting Penyusutan" tab: monthly depreciation run.
 *
 * Same flow as the former modal: pick a month (default: the previous, already
 * closed month) → dry-run preview (POST /fixed-assets/depreciate-bulk with
 * dryRun) → post. Posting creates one journal per asset and is always
 * confirmed in a dialog first.
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClock, Layers, Play, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog, DataTable, EmptyState, Field, StatCard } from '@/components/shared';
import { JournalPreview } from './JournalPreview';
import { apiError } from './errors';
import { MONTH_PATTERN, groupPreviewByCategory, monthLabel } from './fixed-asset-utils';
import type { BulkDepreciationResponse, BulkPreviewItem } from './types';

interface DepreciationRunPanelProps {
  month: string;
  onMonthChange: (month: string) => void;
}

const money = (v: number) => formatRupiah(v, { symbol: false });

const columns: ColumnDef<BulkPreviewItem>[] = [
  {
    id: 'assetNumber',
    accessorKey: 'assetNumber',
    header: 'No. Aset',
    enableSorting: true,
    meta: { cellClassName: 'num whitespace-nowrap font-mono text-xs' },
    cell: ({ row }) => (
      <div className="flex flex-col gap-0.5">
        <span>{row.original.assetNumber}</span>
        <span className="line-clamp-2 max-w-44 font-sans text-sm font-medium text-foreground sm:hidden">
          {row.original.name}
        </span>
      </div>
    ),
  },
  {
    id: 'name',
    accessorKey: 'name',
    header: 'Nama Aset',
    enableSorting: true,
    meta: { hideBelow: 'sm', cellClassName: 'min-w-40 font-medium text-foreground' },
  },
  {
    id: 'category',
    accessorKey: 'category',
    header: 'Kategori',
    enableSorting: true,
    meta: { hideBelow: 'md', cellClassName: 'text-muted-foreground' },
  },
  {
    id: 'periodDate',
    accessorKey: 'periodDate',
    header: 'Periode',
    meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
    cell: ({ row }) => formatDate(row.original.periodDate),
  },
  {
    id: 'amount',
    accessorKey: 'amount',
    header: () => (
      <>
        Beban <span className="normal-case">(Rp)</span>
      </>
    ),
    enableSorting: true,
    meta: { align: 'right', cellClassName: 'font-medium text-foreground' },
    cell: ({ row }) => money(row.original.amount),
  },
];

export function DepreciationRunPanel({ month, onMonthChange }: DepreciationRunPanelProps) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState(month);
  const [syncedMonth, setSyncedMonth] = useState(month);
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (month !== syncedMonth) {
    setSyncedMonth(month);
    setDraft(month);
  }

  const validMonth = MONTH_PATTERN.test(month);

  // Dry run is read-only server-side; keep it from refiring on focus.
  const previewQuery = useQuery({
    queryKey: ['fixed-assets', 'depreciation-preview', month],
    queryFn: async () =>
      (await api.post<BulkDepreciationResponse>('/fixed-assets/depreciate-bulk', { month, dryRun: true })).data,
    enabled: validMonth,
    refetchOnWindowFocus: false,
  });

  const postMut = useMutation({
    mutationFn: async () => (await api.post<BulkDepreciationResponse>('/fixed-assets/depreciate-bulk', { month })).data,
    onSuccess: (d) => {
      toast.success(d.message ?? `Berhasil post ${d.posted} depresiasi (total ${formatRupiah(d.totalAmount)})`);
      qc.invalidateQueries({ queryKey: ['fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['fixed-asset'] });
      qc.invalidateQueries({ queryKey: ['dashboard-fixed-assets'] });
      qc.invalidateQueries({ queryKey: ['financial-ratios'] });
    },
    onError: (err) => toast.error(apiError(err, 'Gagal posting depresiasi bulk')),
  });

  const preview = previewQuery.data;
  const items = useMemo(() => preview?.items ?? [], [preview]);
  const groups = useMemo(() => groupPreviewByCategory(items), [items]);
  const hasItems = items.length > 0;
  const loading = previewQuery.isLoading && validMonth;
  const label = monthLabel(month);

  const commitDraft = (value: string) => {
    setDraft(value);
    if (MONTH_PATTERN.test(value) && value !== month) onMonthChange(value);
  };

  return (
    <div className="space-y-5">
      <section
        aria-labelledby="dep-run-title"
        className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-1)] sm:p-5"
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <h2 id="dep-run-title" className="flex items-center gap-2 text-base font-semibold text-foreground">
              <CalendarClock className="size-5 text-muted-foreground" aria-hidden />
              Posting penyusutan bulanan
            </h2>
            <p className="max-w-prose text-sm text-muted-foreground">
              Memposting semua jadwal penyusutan aset aktif yang jatuh di bulan terpilih dan belum diposting — satu
              jurnal per aset agar mudah ditelusuri.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <Field
              label="Bulan periode"
              hint="Bawaan: bulan sebelumnya (sudah selesai)."
              error={!validMonth ? 'Format bulan harus YYYY-MM.' : undefined}
              className="w-full sm:w-56"
            >
              <Input
                type="month"
                value={draft}
                onChange={(e) => commitDraft(e.target.value)}
                disabled={postMut.isPending}
              />
            </Field>
            <Button
              className="sm:mt-7"
              onClick={() => setConfirmOpen(true)}
              disabled={!hasItems || previewQuery.isFetching}
              loading={postMut.isPending}
            >
              <Play aria-hidden />
              {hasItems ? `Posting ${formatNumber(items.length)} penyusutan` : 'Posting penyusutan'}
            </Button>
          </div>
        </div>
      </section>

      <section aria-label={`Ringkasan pratinjau ${label}`} className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard
          label="Jumlah aset"
          icon={Layers}
          loading={loading}
          value={preview ? formatNumber(items.length) : '-'}
          hint={preview ? `${formatNumber(items.length)} jurnal · ${label}` : undefined}
        />
        <StatCard
          label="Total beban"
          icon={Wallet}
          loading={loading}
          value={preview ? formatRupiah(preview.totalAmount, { compact: true }) : '-'}
          valueTitle={preview ? formatRupiah(preview.totalAmount) : undefined}
          hint={preview ? formatRupiah(preview.totalAmount) : undefined}
        />
        <StatCard
          label="Kategori"
          icon={CalendarClock}
          loading={loading}
          value={preview ? formatNumber(groups.length) : '-'}
          hint={groups.length ? groups.map((g) => g.category).join(', ') : undefined}
          className="col-span-2 lg:col-span-1"
        />
      </section>

      {previewQuery.isError ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            kind="error"
            title="Pratinjau gagal dimuat"
            description={apiError(previewQuery.error, 'Gagal mengambil preview depresiasi.')}
            action={
              <Button variant="outline" size="sm" onClick={() => previewQuery.refetch()}>
                Coba lagi
              </Button>
            }
          />
        </div>
      ) : preview && !hasItems ? (
        <div className="rounded-lg border border-border bg-card">
          <EmptyState
            icon={CalendarClock}
            title="Tidak ada penyusutan untuk periode ini"
            description={preview.message ?? 'Semua jadwal sudah diposting atau tidak ada aset di periode tersebut.'}
          />
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]">
          <DataTable
            label={`Pratinjau penyusutan ${label}`}
            itemLabel="aset"
            columns={columns}
            data={items}
            loading={loading}
            getRowId={(row) => `${row.assetNumber}-${row.periodDate}`}
            pageSize={25}
            maxHeight="28rem"
          />
          <aside className="space-y-4" aria-label="Rincian posting">
            {groups.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4 shadow-[var(--shadow-1)]">
                <h3 className="text-sm font-semibold text-foreground">Per kategori</h3>
                <ul className="mt-2 divide-y divide-border">
                  {groups.map((g) => (
                    <li key={g.category} className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
                      <span className="min-w-0">
                        <span className="font-medium text-foreground">{g.category}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{formatNumber(g.count)} aset</span>
                      </span>
                      <span className="num shrink-0 text-foreground">{formatRupiah(g.total)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <JournalPreview
              lines={[
                { side: 'DR', account: 'Beban penyusutan (akun beban tiap aset)' },
                { side: 'CR', account: 'Akumulasi penyusutan (akun akumulasi tiap aset)' },
              ]}
              note={`Satu jurnal per aset (${formatNumber(items.length)} jurnal), langsung berstatus diposting.`}
            />
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Posting penyusutan ${label}?`}
        description={`${formatNumber(items.length)} jurnal penyusutan akan dibuat dan langsung diposting ke buku besar.`}
        confirmLabel={`Ya, posting ${formatNumber(items.length)} jurnal`}
        loading={postMut.isPending}
        onConfirm={() => postMut.mutateAsync()}
      >
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">Aset</dt>
            <dd className="num font-medium text-foreground">{formatNumber(items.length)}</dd>
          </div>
          <div className="rounded-md border border-border px-3 py-2">
            <dt className="text-xs text-muted-foreground">Total beban</dt>
            <dd className="num font-medium text-foreground">{formatRupiah(preview?.totalAmount ?? 0)}</dd>
          </div>
        </dl>
      </ConfirmDialog>
    </div>
  );
}
