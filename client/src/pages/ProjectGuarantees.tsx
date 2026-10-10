/**
 * Project guarantee deposits (/project-guarantees). Status: Disetor → Selesai (settled as returned
 * or forfeited) | Dibatalkan. Individual settlements can be cancelled from the detail drawer.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Eye, Flame, ShieldCheck, Undo2, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { can, cap } from '@/lib/permissions';
import { formatDate, formatNumber, formatRupiah, toNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { useListState } from '@/hooks/useListState';
import { usePartyPicker } from '@/hooks/usePartyPicker';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ComboboxFilter,
  ConfirmDialog,
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
import ProjectGuaranteeModal from '@/components/ProjectGuaranteeModal';
import SettleGuaranteeModal from '@/components/SettleGuaranteeModal';
import {
  ProjectGuaranteeDetailSheet,
  type GuaranteeSettlementRow,
  type ProjectGuaranteeRow,
} from '@/components/ProjectGuaranteeDetailSheet';
import { DueDate } from '@/components/ProjectGuaranteeDueDate';

interface ProjectGuaranteeSummary {
  count: number;
  cancelledCount: number;
  activeCount: number;
  settledCount: number;
  totalDeposited: number;
  totalReturned: number;
  totalForfeited: number;
  totalOutstanding: number;
  overdueCount: number;
  overdueOutstanding: number;
  dueSoonCount: number;
  dueSoonOutstanding: number;
}

const ENDPOINT = '/project-guarantees';
const FILTER_KEYS = ['status', 'partyId', 'guaranteeType', 'due', 'startDate', 'endDate'] as const;
const STATUS_FILTER = statusOptions(['Disetor', 'Selesai', 'Dibatalkan'], 'project_guarantee');
const TYPE_FILTER = ['Penawaran', 'Pelaksanaan', 'Pemeliharaan', 'Lainnya'].map((t) => ({ value: t, label: t }));
const DUE_FILTER = [
  { value: 'overdue', label: 'Lewat jatuh tempo' },
  { value: 'dueSoon', label: 'Segera jatuh tempo (30 hari)' },
];
/** Same threshold as the server: an outstanding balance above this can still be settled. */
const OUTSTANDING_EPSILON = 0.01;
const FILTER_CLASS = 'w-[calc(50%-0.25rem)] sm:w-48';

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

const money = (v: string | number | null | undefined) => formatRupiah(toNumber(v) ?? 0, { symbol: false });

function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : fallback;
}

const activeSettlements = (g: ProjectGuaranteeRow) => (g.settlements ?? []).filter((s) => !s.isCancelled);

/** Settle: open guarantee with a remaining balance. */
const isSettleable = (g: ProjectGuaranteeRow) => g.status === 'Disetor' && g.outstanding > OUTSTANDING_EPSILON;
/** Cancel the deposit: not cancelled yet and no active settlement (server rule). */
const isCancellable = (g: ProjectGuaranteeRow) => g.status !== 'Dibatalkan' && activeSettlements(g).length === 0;

export const ProjectGuarantees = () => {
  const queryClient = useQueryClient();
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selected, setSelected] = useState<ProjectGuaranteeRow | null>(null);
  const [settleTarget, setSettleTarget] = useState<ProjectGuaranteeRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ id: string; guaranteeNumber: string } | null>(null);
  const [cancelSettlementTarget, setCancelSettlementTarget] = useState<{ id: string; label: string } | null>(null);

  const canEdit = can('project_guarantee', 'edit');
  // Cancelling also needs the doc.cancel capability (server: requireCap).
  const canCancel = canEdit && cap('doc.cancel');

  const guaranteesQuery = useQuery({
    queryKey: ['project-guarantees', 'list', list.params],
    queryFn: async () =>
      (await api.get<Paginated<ProjectGuaranteeRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: ['project-guarantees', 'summary', list.filterParams],
    queryFn: async () =>
      (await api.get<ProjectGuaranteeSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const partyPicker = usePartyPicker({ selectedId: list.filters.partyId || null });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['project-guarantees'] });
    queryClient.invalidateQueries({ queryKey: ['journals'] });
    queryClient.invalidateQueries({ queryKey: ['coa'] });
  };

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`${ENDPOINT}/${id}/cancel`),
    onSuccess: () => {
      toast.success('Uang jaminan dibatalkan.');
      invalidate();
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Gagal membatalkan uang jaminan.')),
  });

  const cancelSettlementMutation = useMutation({
    mutationFn: (id: string) => api.post(`${ENDPOINT}/settlements/${id}/cancel`),
    onSuccess: () => {
      toast.success('Settlement dibatalkan.');
      invalidate();
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Gagal membatalkan settlement.')),
  });

  const rows = guaranteesQuery.data?.data;
  // Keep the drawer in sync with refetched rows (e.g. after a settlement is cancelled).
  const selectedRow = selected ? rows?.find((r) => r.id === selected.id) ?? selected : null;
  const summary = summaryQuery.data;

  const columns = useMemo<ColumnDef<ProjectGuaranteeRow>[]>(
    () => [
      {
        id: 'guaranteeNumber',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => {
          const g = row.original;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <DocumentLink onClick={() => setSelected(g)}>{g.guaranteeNumber}</DocumentLink>
              {/* Mobile: party + project + date stacked here because their columns are hidden. */}
              <span className="max-w-40 truncate text-sm font-medium text-foreground sm:hidden">{g.party?.name ?? '—'}</span>
              <span className="max-w-40 truncate text-xs text-muted-foreground sm:hidden">{g.projectName}</span>
              <span className="num text-xs text-muted-foreground md:hidden">{formatDate(g.date)}</span>
            </div>
          );
        },
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
        id: 'party',
        header: 'Pemberi Proyek',
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-44 max-w-80' },
        cell: ({ row }) => {
          const g = row.original;
          return (
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{g.party?.name ?? '—'}</p>
              <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden" title={g.projectName}>
                {g.guaranteeType} · {g.projectName}
              </p>
            </div>
          );
        },
      },
      {
        id: 'expectedReturnDate',
        header: 'Jatuh Tempo',
        enableSorting: true,
        meta: { hideBelow: 'md' },
        cell: ({ row }) => <DueDate date={row.original.expectedReturnDate} dueState={row.original.dueState} />,
      },
      {
        id: 'amount',
        header: () => withUnit('Jumlah'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => <span className="text-foreground">{money(row.original.amount)}</span>,
      },
      {
        id: 'outstanding',
        header: () => withUnit('Sisa'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const g = row.original;
          const open = g.status !== 'Dibatalkan' && g.outstanding > OUTSTANDING_EPSILON;
          return (
            <div className="flex flex-col items-end gap-1">
              <span className={open ? 'font-semibold text-foreground' : 'text-muted-foreground'}>{money(g.outstanding)}</span>
              {/* Mobile: status + due marker stacked here because their columns are hidden. */}
              <StatusBadge status={g.status} docType="project_guarantee" className="sm:hidden" />
              <DueDate dueState={g.dueState} markerOnly className="items-end md:hidden" />
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="project_guarantee" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const g = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${g.guaranteeNumber}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => setSelected(g) },
                {
                  label: 'Settlement (kembali/hangus)',
                  icon: Undo2,
                  hidden: !canEdit || !isSettleable(g),
                  onSelect: () => setSettleTarget(g),
                },
                {
                  label: 'Batalkan setoran',
                  icon: XCircle,
                  tone: 'danger',
                  hidden: !canCancel || !isCancellable(g),
                  onSelect: () => setCancelTarget({ id: g.id, guaranteeNumber: g.guaranteeNumber }),
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, canCancel],
  );

  const kpiMoney = (v: number | undefined) => (v === undefined ? '—' : formatRupiah(v, { compact: true }));
  const kpiLoading = !summary && !summaryQuery.isError;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Uang Jaminan Proyek"
        description="Setoran jaminan tender/pelaksanaan ke pemberi proyek."
        actions={
          canEdit && (
            <Button onClick={() => setIsModalOpen(true)}>
              <ShieldCheck aria-hidden />
              Setor Jaminan
            </Button>
          )
        }
      />

      <section aria-label="Ringkasan uang jaminan sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Sisa di Luar"
          icon={ShieldCheck}
          loading={kpiLoading}
          value={kpiMoney(summary?.totalOutstanding)}
          valueTitle={summary ? formatRupiah(summary.totalOutstanding) : undefined}
          hint={summary ? `${formatNumber(summary.activeCount)} jaminan aktif` : undefined}
        />
        <StatCard
          label="Dikembalikan"
          icon={CheckCircle2}
          loading={kpiLoading}
          value={kpiMoney(summary?.totalReturned)}
          valueTitle={summary ? formatRupiah(summary.totalReturned) : undefined}
          hint={summary ? `dari ${formatRupiah(summary.totalDeposited, { compact: true })} disetor` : undefined}
        />
        <StatCard
          label="Hangus"
          icon={Flame}
          loading={kpiLoading}
          value={kpiMoney(summary?.totalForfeited)}
          valueTitle={summary ? formatRupiah(summary.totalForfeited) : undefined}
          hint="dibebankan ke biaya"
        />
        <StatCard
          label="Lewat Jatuh Tempo"
          icon={AlertTriangle}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.overdueCount) : '—'}
          hint={
            summary
              ? summary.overdueCount > 0
                ? `Sisa ${formatRupiah(summary.overdueOutstanding, { compact: true })}`
                : `${formatNumber(summary.dueSoonCount)} segera jatuh tempo`
              : undefined
          }
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari uang jaminan"
          searchPlaceholder="Cari nomor, pihak, atau proyek"
          status={{ options: STATUS_FILTER }}
          dateRange={{ label: 'Rentang tanggal setor' }}
        >
          <ComboboxFilter
            label="Filter pemberi proyek"
            allLabel="Semua pemberi proyek"
            searchPlaceholder="Cari pihak…"
            value={list.filters.partyId}
            onChange={(v) => list.setFilter('partyId', v)}
            {...partyPicker.pickerProps}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label="Filter jenis jaminan"
            allLabel="Semua jenis"
            searchPlaceholder="Cari jenis…"
            value={list.filters.guaranteeType}
            onChange={(v) => list.setFilter('guaranteeType', v)}
            options={TYPE_FILTER}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label="Filter jatuh tempo"
            allLabel="Semua jatuh tempo"
            searchPlaceholder="Cari…"
            value={list.filters.due}
            onChange={(v) => list.setFilter('due', v)}
            options={DUE_FILTER}
            className={FILTER_CLASS}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, guaranteesQuery.data?.total)}
          label="Daftar uang jaminan proyek"
          itemLabel="uang jaminan"
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          loading={guaranteesQuery.isLoading}
          fetching={guaranteesQuery.isFetching && guaranteesQuery.isPlaceholderData}
          error={guaranteesQuery.error}
          onRetry={() => guaranteesQuery.refetch()}
          onRowClick={(row) => setSelected(row)}
          rowClassName={(row) => (row.status === 'Dibatalkan' ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada uang jaminan proyek',
            description: 'Setoran jaminan tender atau pelaksanaan ke pemberi proyek akan muncul di sini.',
            action: canEdit ? (
              <Button size="sm" onClick={() => setIsModalOpen(true)}>
                <ShieldCheck aria-hidden />
                Setor jaminan pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <ProjectGuaranteeDetailSheet
        guarantee={selectedRow}
        onClose={() => setSelected(null)}
        onSettle={
          canEdit && selectedRow && isSettleable(selectedRow)
            ? () => {
                setSettleTarget(selectedRow);
                setSelected(null);
              }
            : undefined
        }
        onCancel={
          canCancel && selectedRow && isCancellable(selectedRow)
            ? () => setCancelTarget({ id: selectedRow.id, guaranteeNumber: selectedRow.guaranteeNumber })
            : undefined
        }
        onCancelSettlement={
          canCancel && selectedRow?.status !== 'Dibatalkan'
            ? (s: GuaranteeSettlementRow) =>
                setCancelSettlementTarget({
                  id: s.id,
                  label: `${formatDate(s.date)} · ${formatRupiah((toNumber(s.returnAmount) ?? 0) + (toNumber(s.forfeitAmount) ?? 0))}`,
                })
            : undefined
        }
      />

      <ProjectGuaranteeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      {/* Conditional mount = fresh state per open; key ties to guarantee id. */}
      {settleTarget && (
        <SettleGuaranteeModal
          key={settleTarget.id}
          isOpen={true}
          onClose={() => setSettleTarget(null)}
          guarantee={{
            id: settleTarget.id,
            guaranteeNumber: settleTarget.guaranteeNumber,
            projectName: settleTarget.projectName,
            party: settleTarget.party ?? undefined,
            amount: toNumber(settleTarget.amount) ?? 0,
            outstanding: settleTarget.outstanding,
          }}
        />
      )}

      <ConfirmDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
        title="Batalkan Uang Jaminan"
        description={`Apakah Anda yakin ingin membatalkan setoran ${cancelTarget?.guaranteeNumber ?? ''}? Saldo akun akan dikembalikan seperti sebelum setor.`}
        confirmLabel="Ya, Batalkan"
        tone="danger"
        loading={cancelMutation.isPending}
        onConfirm={async () => {
          if (!cancelTarget) return;
          await cancelMutation.mutateAsync(cancelTarget.id);
          setCancelTarget(null);
          setSelected(null);
        }}
      />

      <ConfirmDialog
        open={cancelSettlementTarget !== null}
        onOpenChange={(open) => !open && setCancelSettlementTarget(null)}
        title="Batalkan Settlement"
        description={`Batalkan settlement ${cancelSettlementTarget?.label ?? ''}? Jurnal settlement dibalik dan sisa jaminan kembali bertambah.`}
        confirmLabel="Ya, Batalkan"
        tone="danger"
        loading={cancelSettlementMutation.isPending}
        onConfirm={async () => {
          if (!cancelSettlementTarget) return;
          await cancelSettlementMutation.mutateAsync(cancelSettlementTarget.id);
          setCancelSettlementTarget(null);
        }}
      />
    </div>
  );
};
