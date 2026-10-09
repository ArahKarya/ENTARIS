/**
 * Customers and vendors (/parties). Tabs (?type=Customer|Supplier, ?view=analysis) are not list
 * filters, so Reset keeps them; both type tabs include parties that are customer and vendor.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, FileText, Pencil, Plus, ShoppingCart, Trash2, Upload, Users, Wallet, Scale, PiggyBank } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import { formatNumber, formatRupiah, toNumber } from '@/lib/format';
import type { StatusTone } from '@/lib/status';
import { can, cap } from '@/lib/permissions';
import { LIST_PARAM, useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  ConfirmDialog,
  DataTable,
  FilterBar,
  PageHeader,
  RowActions,
  StatCard,
  StatusBadge,
  fetchAllPages,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import PartyFormModal from '@/components/PartyFormModal';
import ImportModal from '@/components/ImportModal';
import PartiesDashboardTab from '@/components/PartiesDashboardTab';

type Money = string | number;
type PartyType = 'Customer' | 'Supplier' | 'Both';

interface PartyRow {
  id: string;
  name: string;
  partyType: PartyType;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxId: string | null;
  outstandingAmount: Money;
  depositBalance: Money;
  customerDepositBalance: Money;
  isActive: boolean;
  isWapu: boolean;
}

interface PartySummary {
  total: number;
  activeCount: number;
  inactiveCount: number;
  byType: Record<PartyType, number>;
  totalReceivable: number;
  totalPayable: number;
  totalCustomerDeposit: number;
  totalVendorDeposit: number;
  withOutstandingCount: number;
}

type Tab = 'all' | 'Customer' | 'Supplier' | 'analysis';

const ENDPOINT = '/parties';
const FILTER_KEYS = ['isActive', 'hasOutstanding'] as const;
const TYPE_PARAM = 'type';
const VIEW_PARAM = 'view';
/** List params cleared when switching tabs (filters are kept). */
const TAB_RESET_KEYS = [LIST_PARAM.page];
const ACTIVE_FILTER = [
  { value: 'true', label: 'Aktif' },
  { value: 'false', label: 'Nonaktif' },
];
const ALL = '__all__';

const TYPE_META: Record<PartyType, { label: string; tone: StatusTone }> = {
  Customer: { label: 'Pelanggan', tone: 'info' },
  Supplier: { label: 'Vendor', tone: 'primary' },
  Both: { label: 'Pelanggan & Vendor', tone: 'neutral' },
};

const isCustomerSide = (p: PartyRow) => p.partyType === 'Customer' || p.partyType === 'Both';
const isSupplierSide = (p: PartyRow) => p.partyType === 'Supplier' || p.partyType === 'Both';
const num = (v: Money | null | undefined) => toNumber(v) ?? 0;
const money = (v: Money | null | undefined) => formatRupiah(v, { symbol: false });
const kpiMoney = (v: number | undefined) => (v === undefined ? '-' : formatRupiah(v, { compact: true }));
const errorMessage = (err: unknown, fallback: string) =>
  (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? fallback;

const withUnit = (label: string) => (
  <>
    {label} <span className="normal-case">(Rp)</span>
  </>
);

/** What a positive / negative outstanding means for this party. */
function outstandingCaption(p: PartyRow): string {
  const value = num(p.outstandingAmount);
  if (value < 0) return 'Lebih bayar';
  if (value === 0) return '';
  if (p.partyType === 'Customer') return 'Piutang';
  if (p.partyType === 'Supplier') return 'Hutang';
  return 'Terutang';
}

function toExportRows(rows: PartyRow[]): Record<string, unknown>[] {
  // Same columns/keys as the previous "Download" so re-import keeps working.
  return rows.map((p) => ({
    name: p.name,
    partyType: p.partyType,
    phone: p.phone ?? '',
    email: p.email ?? '',
    address: p.address ?? '',
    taxId: p.taxId ?? '',
    outstandingAmount: num(p.outstandingAmount),
    depositBalance: num(p.depositBalance),
    customerDepositBalance: num(p.customerDepositBalance),
  }));
}

export const PartiesPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const rawType = searchParams.get(TYPE_PARAM);
  const type: PartyType | '' = rawType === 'Customer' || rawType === 'Supplier' ? rawType : '';
  const tab: Tab = searchParams.get(VIEW_PARAM) === 'analysis' ? 'analysis' : type || 'all';

  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'name', desc: false } });
  const [density, setDensity] = useTableDensity();
  const [formOpen, setFormOpen] = useState(false);
  const [editParty, setEditParty] = useState<PartyRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PartyRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const canEdit = can('parties', 'edit');
  const canDelete = canEdit && cap('doc.cancel');

  const params = useMemo(() => (type ? { ...list.params, type } : list.params), [list.params, type]);
  const filterParams = useMemo(
    () => (type ? { ...list.filterParams, type } : list.filterParams),
    [list.filterParams, type],
  );

  const partiesQuery = useQuery({
    queryKey: ['parties', 'list', params],
    queryFn: async () => (await api.get<Paginated<PartyRow>>(ENDPOINT, { params })).data,
    placeholderData: keepPreviousData,
    enabled: tab !== 'analysis',
  });

  const summaryQuery = useQuery({
    queryKey: ['parties', 'summary', filterParams],
    queryFn: async () => (await api.get<PartySummary>(`${ENDPOINT}/summary`, { params: filterParams })).data,
    placeholderData: keepPreviousData,
    enabled: tab !== 'analysis',
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete<{ message?: string; deactivated?: boolean }>(`${ENDPOINT}/${id}`),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['parties'] });
      queryClient.invalidateQueries({ queryKey: ['parties-all'] });
      if (res.data.deactivated) toast.info(res.data.message || 'Mitra dinonaktifkan karena memiliki transaksi terkait.');
      else toast.success(res.data.message || 'Mitra berhasil dihapus.');
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(errorMessage(err, 'Gagal menghapus mitra.'));
      setDeleteTarget(null);
    },
  });

  const changeTab = (next: string) => {
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      for (const key of TAB_RESET_KEYS) p.delete(key);
      p.delete(TYPE_PARAM);
      p.delete(VIEW_PARAM);
      if (next === 'analysis') p.set(VIEW_PARAM, 'analysis');
      else if (next === 'Customer' || next === 'Supplier') p.set(TYPE_PARAM, next);
      return p;
    });
  };

  const openCreate = () => {
    setEditParty(null);
    setFormOpen(true);
  };

  const openEdit = (party: PartyRow) => {
    setEditParty(party);
    setFormOpen(true);
  };

  const invoicesLink = (party: PartyRow) =>
    `${isCustomerSide(party) ? '/sales' : '/purchase'}?partyId=${encodeURIComponent(party.id)}`;

  const handleExport = async () => {
    setExporting(true);
    try {
      const exportParams = { ...filterParams, sort: String(list.params.sort ?? 'name') };
      const { rows, truncated } = await fetchAllPages<PartyRow>(ENDPOINT, exportParams);
      exportToExcel(toExportRows(rows), 'pelanggan-vendor');
      if (truncated) toast.warning(`Ekspor dibatasi ${formatNumber(rows.length)} mitra pertama. Persempit filter.`);
    } catch {
      toast.error('Gagal mengekspor data mitra. Coba lagi.');
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<PartyRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Nama',
        enableSorting: true,
        meta: { cellClassName: 'min-w-32 max-w-80 sm:min-w-44' },
        cell: ({ row }) => {
          const p = row.original;
          const contact = [p.phone, p.email].filter(Boolean).join(' · ');
          return (
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-medium break-words text-foreground">{p.name}</span>
                {p.isWapu && (
                  <StatusBadge
                    tone="warning"
                    label="WAPU"
                    dot={false}
                    className="px-1.5"
                  />
                )}
                {!p.isActive && <StatusBadge tone="neutral" label="Nonaktif" dot={false} className="px-1.5" />}
              </div>
              {contact && (
                <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                  {contact}
                </p>
              )}
              {/* Mobile: type stacked here because its column is hidden. */}
              <p className="mt-0.5 text-xs text-muted-foreground md:hidden">{TYPE_META[p.partyType]?.label}</p>
            </div>
          );
        },
      },
      {
        id: 'type',
        header: 'Jenis',
        meta: { hideBelow: 'md' },
        cell: ({ row }) => {
          const meta = TYPE_META[row.original.partyType];
          return meta ? <StatusBadge tone={meta.tone} label={meta.label} /> : null;
        },
      },
      {
        id: 'taxId',
        header: 'NPWP',
        meta: { hideBelow: 'xl', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => row.original.taxId || '-',
      },
      {
        id: 'outstanding',
        header: () => (
          <>
            Saldo<span className="hidden sm:inline"> Terutang</span> <span className="normal-case">(Rp)</span>
          </>
        ),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const p = row.original;
          const value = num(p.outstandingAmount);
          const caption = outstandingCaption(p);
          return (
            <div className="flex flex-col items-end">
              <span
                className={
                  value > 0 ? 'font-semibold text-foreground' : value < 0 ? 'text-success-text' : 'text-muted-foreground'
                }
              >
                {money(Math.abs(value))}
              </span>
              {caption && <span className="text-xs text-muted-foreground">{caption}</span>}
            </div>
          );
        },
      },
      {
        id: 'deposit',
        header: () => withUnit('Uang Muka'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => {
          const p = row.original;
          const lines: Array<{ label: string; value: number }> = [];
          if (isCustomerSide(p)) lines.push({ label: 'Pelanggan', value: num(p.customerDepositBalance) });
          if (isSupplierSide(p)) lines.push({ label: 'Vendor', value: num(p.depositBalance) });
          return (
            <div className="flex flex-col items-end">
              {lines.map((l) => (
                <span key={l.label} className={l.value > 0 ? 'text-foreground' : 'text-muted-foreground'}>
                  {money(l.value)}
                  {lines.length > 1 && <span className="ml-1 text-xs text-muted-foreground">{l.label}</span>}
                </span>
              ))}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const p = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${p.name}`}
              actions={[
                { label: 'Edit', icon: Pencil, hidden: !canEdit, onSelect: () => openEdit(p) },
                {
                  label: 'Lihat faktur penjualan',
                  icon: FileText,
                  hidden: !isCustomerSide(p),
                  onSelect: () => navigate(`/sales?partyId=${encodeURIComponent(p.id)}`),
                },
                {
                  label: 'Lihat faktur pembelian',
                  icon: ShoppingCart,
                  hidden: !isSupplierSide(p),
                  onSelect: () => navigate(`/purchase?partyId=${encodeURIComponent(p.id)}`),
                },
                { label: 'Hapus', icon: Trash2, tone: 'danger', hidden: !canDelete, onSelect: () => setDeleteTarget(p) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, canDelete],
  );

  const summary = summaryQuery.data;
  const kpiLoading = !summary && !summaryQuery.isError;
  const total = partiesQuery.data?.total;

  return (
    // Manual activation: avoids two history entries per click (see DeliveryOrders).
    <Tabs value={tab} onValueChange={changeTab} activationMode="manual" className="pb-8">
      <PageHeader
        title="Pelanggan & Vendor"
        description="Kelola data mitra bisnis, saldo piutang, dan hutang usaha."
        actions={
          <>
            {tab !== 'analysis' && (
              <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!total}>
                <Download aria-hidden />
                <span className="sr-only sm:not-sr-only">Ekspor Excel</span>
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload aria-hidden />
                <span className="sr-only sm:not-sr-only">Impor</span>
              </Button>
            )}
            {canEdit && (
              <Button onClick={openCreate}>
                <Plus aria-hidden />
                Tambah Mitra
              </Button>
            )}
          </>
        }
      >
        <TabsList variant="underline" aria-label="Jenis mitra">
          <TabsTrigger value="all">Semua</TabsTrigger>
          <TabsTrigger value="Customer">Pelanggan</TabsTrigger>
          <TabsTrigger value="Supplier">Vendor</TabsTrigger>
          <TabsTrigger value="analysis">Analisis</TabsTrigger>
        </TabsList>
      </PageHeader>

      {tab !== 'analysis' && (
        <TabsContent value={tab} className="mt-0 space-y-5">
          <section aria-label="Ringkasan mitra sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Jumlah Mitra"
              icon={Users}
              loading={kpiLoading}
              value={summary ? formatNumber(summary.total) : '-'}
              hint={
                summary
                  ? `${formatNumber(summary.byType.Customer)} pelanggan · ${formatNumber(summary.byType.Supplier)} vendor`
                  : undefined
              }
            />
            <StatCard
              label="Total Piutang"
              icon={Wallet}
              loading={kpiLoading}
              value={kpiMoney(summary?.totalReceivable)}
              valueTitle={summary ? formatRupiah(summary.totalReceivable) : undefined}
              hint={summary ? `UM pelanggan ${formatRupiah(summary.totalCustomerDeposit, { compact: true })}` : undefined}
            />
            <StatCard
              label="Total Hutang"
              icon={Scale}
              loading={kpiLoading}
              value={kpiMoney(summary?.totalPayable)}
              valueTitle={summary ? formatRupiah(summary.totalPayable) : undefined}
              hint={summary ? `UM vendor ${formatRupiah(summary.totalVendorDeposit, { compact: true })}` : undefined}
            />
            <StatCard
              label="Mitra dengan Saldo"
              icon={PiggyBank}
              loading={kpiLoading}
              value={summary ? formatNumber(summary.withOutstandingCount) : '-'}
              hint={summary ? `${formatNumber(summary.inactiveCount)} nonaktif` : undefined}
            />
          </section>

          <div className="space-y-3">
            <FilterBar
              list={list}
              searchLabel="Cari mitra"
              searchPlaceholder="Cari nama, email, telepon, atau NPWP"
              status={{ key: 'isActive', options: ACTIVE_FILTER, label: 'Status mitra', allLabel: 'Semua status' }}
            >
              <div className="w-[calc(50%-0.25rem)] sm:w-48">
                <label htmlFor="parties-outstanding" className="sr-only">
                  Saldo terutang
                </label>
                <Select
                  value={list.filters.hasOutstanding || ALL}
                  onValueChange={(v) => list.setFilter('hasOutstanding', v === ALL ? '' : v)}
                >
                  <SelectTrigger id="parties-outstanding">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Semua saldo</SelectItem>
                    <SelectItem value="true">Ada saldo terutang</SelectItem>
                    <SelectItem value="false">Tanpa saldo terutang</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </FilterBar>

            <DataTable
              {...listTableProps(list, total)}
              label="Daftar pelanggan dan vendor"
              itemLabel="mitra"
              columns={columns}
              data={partiesQuery.data?.data}
              getRowId={(row) => row.id}
              loading={partiesQuery.isLoading}
              fetching={partiesQuery.isFetching && partiesQuery.isPlaceholderData}
              error={partiesQuery.error}
              onRetry={() => partiesQuery.refetch()}
              onRowClick={(row) => (canEdit ? openEdit(row) : navigate(invoicesLink(row)))}
              rowClassName={(row) => (row.isActive ? undefined : 'opacity-60')}
              density={density}
              onDensityChange={setDensity}
              empty={{
                title: 'Belum ada mitra',
                description: 'Pelanggan dan vendor yang Anda tambahkan akan muncul di sini.',
                action: canEdit ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus aria-hidden />
                    Tambah mitra pertama
                  </Button>
                ) : undefined,
              }}
            />
          </div>
        </TabsContent>
      )}

      <TabsContent value="analysis" className="mt-0">
        {tab === 'analysis' && <PartiesDashboardTab />}
      </TabsContent>

      <PartyFormModal
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditParty(null);
        }}
        editParty={editParty}
      />

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && !deleteMutation.isPending && setDeleteTarget(null)}
        tone="danger"
        title="Hapus mitra?"
        description={
          <>
            <span className="font-medium text-foreground">{deleteTarget?.name}</span> akan dihapus. Jika mitra memiliki
            transaksi terkait (faktur/pembayaran), data akan dinonaktifkan, bukan dihapus permanen.
          </>
        }
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />

      <ImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} importType="parties" />
    </Tabs>
  );
};
