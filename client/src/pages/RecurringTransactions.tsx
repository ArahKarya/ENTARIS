/** Recurring templates (/recurring). GET /recurring returns every template, so filtering runs in memory. */
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Pause, Pencil, Play, Plus, Zap } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatDate } from '@/lib/format';
import { can } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { ComboboxFilter, ConfirmDialog, DataTable, FilterBar, PageHeader, RowActions, StatusBadge } from '@/components/shared';
import RecurringTemplateModal from '@/components/RecurringTemplateModal';

interface RecurringTemplate {
  id: string;
  name: string;
  templateType: string;
  frequency: string;
  dayOfMonth?: number | null;
  nextRunDate: string;
  lastRunDate?: string | null;
  isActive: boolean;
  templateData: unknown;
  createdBy: string;
  user?: { fullName: string };
  createdAt: string;
  updatedAt: string;
}

const TYPE_LABELS: Record<string, string> = {
  journal: 'Jurnal',
  sales_invoice: 'Invoice Penjualan',
  purchase_invoice: 'Invoice Pembelian',
};

// One schedule period, used to explain how a manual run moves the next run.
const PERIOD_LABELS: Record<string, string> = {
  daily: '1 hari',
  weekly: '1 minggu',
  monthly: '1 bulan',
  quarterly: '3 bulan',
  yearly: '1 tahun',
};
const FREQUENCY_LABELS: Record<string, string> = {
  daily: 'Harian',
  weekly: 'Mingguan',
  monthly: 'Bulanan',
  quarterly: 'Triwulan',
  yearly: 'Tahunan',
};

const FILTER_KEYS = ['status', 'templateType'] as const;
const STATUS_FILTER = [
  { value: 'active', label: 'Aktif' },
  { value: 'inactive', label: 'Nonaktif' },
];
const TYPE_FILTER = Object.entries(TYPE_LABELS).map(([value, label]) => ({ value, label }));

const typeLabel = (t: string) => TYPE_LABELS[t] ?? TYPE_LABELS.journal;
const frequencyLabel = (t: RecurringTemplate) => {
  const base = FREQUENCY_LABELS[t.frequency] ?? t.frequency;
  return t.dayOfMonth && t.frequency === 'monthly' ? `${base} (tgl ${t.dayOfMonth})` : base;
};
const errorMessage = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

export const RecurringTransactions = () => {
  const queryClient = useQueryClient();
  const list = useListState({ filters: FILTER_KEYS });
  const [density, setDensity] = useTableDensity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<RecurringTemplate | null>(null);
  // "Jalankan sekarang" posts a real journal, so it asks for confirmation first.
  const [runTarget, setRunTarget] = useState<RecurringTemplate | null>(null);
  const canEdit = can('recurring', 'edit');

  const templatesQuery = useQuery({
    queryKey: ['recurring-templates'],
    queryFn: async () => (await api.get('/recurring')).data.data as RecurringTemplate[],
  });

  const executeMutation = useMutation({
    mutationFn: (id: string) => api.post(`/recurring/${id}/execute`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      if (res.data.success) toast.success('Template dijalankan.');
      else toast.error(res.data.error || 'Gagal mengeksekusi template.');
    },
    onError: (e) => toast.error(errorMessage(e, 'Gagal mengeksekusi template.')),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) => api.put(`/recurring/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['recurring-templates'] });
      toast.success('Status template diperbarui.');
    },
    onError: (e) => toast.error(errorMessage(e, 'Gagal mengubah status template.')),
  });

  const openCreate = () => {
    setEditTemplate(null);
    setIsModalOpen(true);
  };
  const openEdit = (template: RecurringTemplate) => {
    setEditTemplate(template);
    setIsModalOpen(true);
  };
  const closeModal = () => {
    setIsModalOpen(false);
    setEditTemplate(null);
  };

  const { search, filters } = list;
  const rows = useMemo(() => {
    const q = search.toLowerCase();
    return (templatesQuery.data ?? []).filter(
      (t) =>
        (!q || t.name.toLowerCase().includes(q)) &&
        (!filters.status || (filters.status === 'active') === t.isActive) &&
        (!filters.templateType || t.templateType === filters.templateType),
    );
  }, [templatesQuery.data, search, filters]);

  const columns = useMemo<ColumnDef<RecurringTemplate>[]>(
    () => [
      {
        id: 'name',
        accessorFn: (t) => t.name,
        header: 'Nama',
        enableSorting: true,
        meta: { cellClassName: 'min-w-36 max-w-44 sm:max-w-80' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{row.original.name}</p>
            {/* Mobile: type + frequency stacked here because their columns are hidden. */}
            <p className="truncate text-xs text-muted-foreground md:hidden">
              {typeLabel(row.original.templateType)} · {frequencyLabel(row.original)}
            </p>
          </div>
        ),
      },
      {
        id: 'templateType',
        accessorFn: (t) => typeLabel(t.templateType),
        header: 'Tipe',
        enableSorting: true,
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap text-muted-foreground' },
        cell: ({ getValue }) => getValue<string>(),
      },
      {
        id: 'frequency',
        accessorFn: (t) => frequencyLabel(t),
        header: 'Frekuensi',
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap text-muted-foreground' },
        cell: ({ getValue }) => getValue<string>(),
      },
      {
        id: 'nextRunDate',
        accessorFn: (t) => new Date(t.nextRunDate).getTime(),
        header: () => (
          <>
            <span className="sm:hidden">Jadwal</span>
            <span className="hidden sm:inline">Jadwal Berikutnya</span>
          </>
        ),
        enableSorting: true,
        meta: { cellClassName: 'num whitespace-nowrap' },
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-1">
            <span className="text-foreground">{formatDate(row.original.nextRunDate)}</span>
            {/* Mobile: status stacked here because its column is hidden. */}
            <StatusBadge status={row.original.isActive ? 'Active' : 'Inactive'} className="sm:hidden" />
          </div>
        ),
      },
      {
        id: 'lastRunDate',
        accessorFn: (t) => (t.lastRunDate ? new Date(t.lastRunDate).getTime() : 0),
        header: 'Terakhir Dijalankan',
        enableSorting: true,
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => (row.original.lastRunDate ? formatDate(row.original.lastRunDate) : '-'),
      },
      {
        id: 'status',
        accessorFn: (t) => (t.isActive ? 0 : 1),
        header: 'Status',
        enableSorting: true,
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.isActive ? 'Active' : 'Inactive'} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const t = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${t.name}`}
              actions={[
                { label: 'Edit', icon: Pencil, hidden: !canEdit, onSelect: () => openEdit(t) },
                {
                  label: 'Jalankan sekarang',
                  icon: Zap,
                  hidden: !canEdit,
                  disabled: executeMutation.isPending,
                  onSelect: () => setRunTarget(t),
                },
                {
                  label: t.isActive ? 'Nonaktifkan' : 'Aktifkan',
                  icon: t.isActive ? Pause : Play,
                  hidden: !canEdit,
                  disabled: toggleMutation.isPending,
                  onSelect: () => toggleMutation.mutate({ id: t.id, isActive: !t.isActive }),
                },
              ]}
            />
          );
        },
      },
    ],
    // Mutations/openEdit are stable enough; re-create when pending flags flip.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, executeMutation.isPending, toggleMutation.isPending],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Transaksi Berulang"
        description="Kelola template transaksi otomatis berdasarkan jadwal."
        actions={
          canEdit && (
            <Button onClick={openCreate}>
              <Plus aria-hidden />
              Buat Template
            </Button>
          )
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari template"
          searchPlaceholder="Cari nama template"
          status={{ options: STATUS_FILTER }}
        >
          <ComboboxFilter
            label="Filter tipe template"
            allLabel="Semua tipe"
            searchPlaceholder="Cari tipe…"
            value={list.filters.templateType}
            onChange={(v) => list.setFilter('templateType', v)}
            options={TYPE_FILTER}
            className="w-[calc(50%-0.25rem)] sm:w-52"
          />
        </FilterBar>

        <DataTable
          label="Daftar template transaksi berulang"
          itemLabel="template"
          columns={columns}
          data={templatesQuery.data ? rows : undefined}
          getRowId={(row) => row.id}
          pageSize={25}
          loading={templatesQuery.isLoading}
          error={templatesQuery.error}
          onRetry={() => templatesQuery.refetch()}
          filtered={list.hasActiveFilters}
          onClearFilters={list.resetFilters}
          onRowClick={canEdit ? openEdit : undefined}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada template transaksi berulang',
            description: 'Template jurnal yang dijadwalkan akan muncul di sini.',
            action: canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                Buat template pertama
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <RecurringTemplateModal isOpen={isModalOpen} onClose={closeModal} editTemplate={editTemplate} />

      <ConfirmDialog
        open={runTarget !== null}
        onOpenChange={(open) => !open && setRunTarget(null)}
        title="Jalankan template sekarang?"
        description={
          runTarget ? (
            <>
              Template <strong>{runTarget.name}</strong> akan langsung membuat jurnal bertanggal hari ini yang
              terposting ke buku besar. Jadwal berikutnya dihitung ulang menjadi{' '}
              <strong>{PERIOD_LABELS[runTarget.frequency] ?? 'satu periode'}</strong> setelah hari ini (jadwal
              saat ini: {formatDate(runTarget.nextRunDate)}).
            </>
          ) : null
        }
        confirmLabel="Ya, jalankan"
        loading={executeMutation.isPending}
        onConfirm={() => (runTarget ? executeMutation.mutateAsync(runTarget.id) : undefined)}
      />
    </div>
  );
};
