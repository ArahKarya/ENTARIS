/** Bank reconciliation sessions (/reconciliation); ?recon=<id> opens the matching workspace. */
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ComboboxFilter,
  ConfirmDialog,
  DataTable,
  FilterBar,
  PageHeader,
  RowActions,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import ReconciliationModal from '@/components/ReconciliationModal';
import { ReconciliationWorkspace } from '@/components/reconciliation/ReconciliationWorkspace';

type Money = number | string;

interface ReconciliationRow {
  id: string;
  accountId: string;
  account: { id: string; name: string; accountNumber: string; balance: Money };
  statementDate: string;
  statementBalance: Money;
  bookBalance: Money;
  status: string;
  notes: string | null;
  _count?: { items: number };
  matchedCount?: number;
  createdAt: string;
}

interface CashAccount {
  id: string;
  name: string;
  accountNumber: string;
  accountType: string;
  isGroup?: boolean;
}

const ENDPOINT = '/reconciliation';
const FILTER_KEYS = ['status', 'accountId', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(['Draft', 'Completed']);
const RECON_PARAM = 'recon';

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);
const num = (v: Money | null | undefined) => toNumber(v) ?? 0;
const money = (v: Money | null | undefined) => formatRupiah(v, { symbol: false });
const difference = (r: ReconciliationRow) => num(r.statementBalance) - num(r.bookBalance);
const errorMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

/** Same source as ReconciliationModal (shared cache key): leaf cash/bank asset accounts. */
function useCashAccounts() {
  return useQuery<CashAccount[]>({
    queryKey: ['coa-cash-accounts'],
    queryFn: async () => {
      const res = await api.get('/coa/flat');
      const all: CashAccount[] = Array.isArray(res.data) ? res.data : res.data.data || [];
      return all.filter((a) => a.accountType === 'ASSET' && a.accountNumber.startsWith('1.1.') && !a.isGroup);
    },
  });
}

export const BankReconciliation = () => {
  const queryClient = useQueryClient();
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'statementDate', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ReconciliationRow | null>(null);
  const canEdit = can('reconciliation', 'edit');
  const selectedId = searchParams.get(RECON_PARAM);

  const openWorkspace = (id: string) =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set(RECON_PARAM, id);
      return next;
    });
  const closeWorkspace = () =>
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete(RECON_PARAM);
      return next;
    });

  const listQuery = useQuery({
    queryKey: ['reconciliations', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<ReconciliationRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
    enabled: !selectedId,
  });

  const accountsQuery = useCashAccounts();
  const accountOptions = useMemo(
    () => (accountsQuery.data ?? []).map((a) => ({ value: a.id, label: a.name, hint: a.accountNumber })),
    [accountsQuery.data],
  );

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`${ENDPOINT}/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      toast.success('Rekonsiliasi dihapus.');
    },
    onError: (e) => toast.error(errorMessage(e, 'Gagal menghapus.')),
  });

  const columns = useMemo<ColumnDef<ReconciliationRow>[]>(
    () => [
      {
        id: 'account',
        header: 'Akun',
        enableSorting: true,
        meta: { cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.account.name}</p>
            <p className="num truncate font-mono text-xs text-muted-foreground">
              {row.original.account.accountNumber}
              {/* Mobile: statement date stacked here because its column is hidden. */}
              <span className="md:hidden"> · {formatDate(row.original.statementDate)}</span>
            </p>
          </div>
        ),
      },
      {
        id: 'statementDate',
        header: 'Tanggal Statement',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.statementDate),
      },
      {
        id: 'bookBalance',
        header: () => withUnit('Saldo Buku'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'lg' },
        cell: ({ row }) => money(row.original.bookBalance),
      },
      {
        id: 'statementBalance',
        header: () => withUnit('Saldo Statement'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => money(row.original.statementBalance),
      },
      {
        id: 'difference',
        header: () => withUnit('Selisih'),
        meta: { align: 'right' },
        cell: ({ row }) => {
          const diff = difference(row.original);
          const balanced = Math.abs(diff) < 0.01;
          return (
            <div className="flex flex-col items-end gap-1">
              <span className={cn('font-medium', balanced ? 'text-success-text' : 'text-warning-text')}>
                {money(diff)}
                <span className="sr-only">{balanced ? ' (seimbang)' : ' (belum seimbang)'}</span>
              </span>
              {/* Mobile: status stacked here because its column is hidden. */}
              <StatusBadge status={row.original.status} className="sm:hidden" />
            </div>
          );
        },
      },
      {
        id: 'items',
        header: 'Tercocokkan',
        meta: { align: 'right', hideBelow: 'xl', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) =>
          `${formatNumber(row.original.matchedCount ?? 0)} / ${formatNumber(row.original._count?.items ?? 0)}`,
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <RowActions
              label={`Aksi untuk rekonsiliasi ${r.account.name} ${formatDate(r.statementDate)}`}
              actions={[
                {
                  label: r.status === 'Draft' && canEdit ? 'Buka pencocokan' : 'Lihat detail',
                  icon: Eye,
                  onSelect: () => openWorkspace(r.id),
                },
                {
                  label: 'Hapus',
                  icon: Trash2,
                  tone: 'danger',
                  hidden: !canEdit || r.status !== 'Draft',
                  onSelect: () => setConfirmDelete(r),
                },
              ]}
            />
          );
        },
      },
    ],
    // openWorkspace only wraps the stable setSearchParams.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit],
  );

  if (selectedId) {
    return <ReconciliationWorkspace id={selectedId} canEdit={canEdit} onBack={closeWorkspace} />;
  }

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Rekonsiliasi Bank"
        description="Cocokkan transaksi buku dengan mutasi bank."
        actions={
          canEdit && (
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus aria-hidden />
              Rekonsiliasi Baru
            </Button>
          )
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari rekonsiliasi"
          searchPlaceholder="Cari nama/nomor akun atau catatan"
          status={{ options: STATUS_FILTER }}
          dateRange={{ label: 'Rentang tanggal statement' }}
        >
          <ComboboxFilter
            label="Filter akun bank"
            allLabel="Semua akun bank"
            searchPlaceholder="Cari akun…"
            value={list.filters.accountId}
            onChange={(v) => list.setFilter('accountId', v)}
            options={accountOptions}
            loading={accountsQuery.isLoading}
            className="w-[calc(50%-0.25rem)] sm:w-52"
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, listQuery.data?.total)}
          label="Daftar rekonsiliasi bank"
          itemLabel="rekonsiliasi"
          columns={columns}
          data={listQuery.data?.data}
          getRowId={(row) => row.id}
          loading={listQuery.isLoading}
          fetching={listQuery.isFetching && listQuery.isPlaceholderData}
          error={listQuery.error}
          onRetry={() => listQuery.refetch()}
          onRowClick={(row) => openWorkspace(row.id)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada rekonsiliasi',
            description: 'Sesi rekonsiliasi rekening bank akan muncul di sini.',
            action: canEdit ? (
              <Button size="sm" onClick={() => setIsModalOpen(true)}>
                <Plus aria-hidden />
                Buat rekonsiliasi pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <ReconciliationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Hapus Rekonsiliasi"
        description="Yakin ingin menghapus rekonsiliasi ini? Data yang sudah dicocokkan akan hilang."
        confirmLabel="Hapus"
        tone="danger"
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete.id);
          setConfirmDelete(null);
        }}
      />
    </div>
  );
};
