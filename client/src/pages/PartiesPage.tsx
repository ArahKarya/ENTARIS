/**
 * Customers and vendors (/parties). Tabs (?type=Customer|Supplier, ?view=analysis) are not list
 * filters, so Reset keeps them; both type tabs include parties that are customer and vendor.
 */
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, FileText, Pencil, Plus, ShoppingCart, Trash2, Upload, Users, Wallet, Scale, PiggyBank } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { exportToExcel } from '@/lib/exportExcel';
import i18n from '@/i18n';
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
const activeFilterOptions = () => [
  { value: 'true', label: i18n.t('sales:partiesPage.status.active') },
  { value: 'false', label: i18n.t('sales:partiesPage.status.inactive') },
];
const ALL = '__all__';

const TYPE_META: Record<PartyType, { labelKey: 'customer' | 'supplier' | 'both'; tone: StatusTone }> = {
  Customer: { labelKey: 'customer', tone: 'info' },
  Supplier: { labelKey: 'supplier', tone: 'primary' },
  Both: { labelKey: 'both', tone: 'neutral' },
};
const typeLabel = (type: PartyType): string | undefined => {
  const meta = TYPE_META[type];
  return meta ? i18n.t(`sales:partiesPage.type.${meta.labelKey}`) : undefined;
};

const isCustomerSide = (p: PartyRow) => p.partyType === 'Customer' || p.partyType === 'Both';
const isSupplierSide = (p: PartyRow) => p.partyType === 'Supplier' || p.partyType === 'Both';
const num = (v: Money | null | undefined) => toNumber(v) ?? 0;
const money = (v: Money | null | undefined) => formatRupiah(v, { symbol: false });
const kpiMoney = (v: number | undefined) => (v === undefined ? '—' : formatRupiah(v, { compact: true }));
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
  if (value < 0) return i18n.t('sales:partiesPage.outstanding.overpaid');
  if (value === 0) return '';
  if (p.partyType === 'Customer') return i18n.t('sales:partiesPage.outstanding.receivable');
  if (p.partyType === 'Supplier') return i18n.t('sales:partiesPage.outstanding.payable');
  return i18n.t('sales:partiesPage.outstanding.owed');
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
  const { t } = useTranslation('sales');
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
      if (res.data.deactivated) toast.info(res.data.message || t('partiesPage.toast.deactivated'));
      else toast.success(res.data.message || t('partiesPage.toast.deleted'));
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(errorMessage(err, t('partiesPage.toast.deleteFailed')));
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
      exportToExcel(toExportRows(rows), t('partiesPage.export.fileName'));
      if (truncated) toast.warning(t('partiesPage.export.truncated', { total: formatNumber(rows.length) }));
    } catch {
      toast.error(t('partiesPage.export.failed'));
    } finally {
      setExporting(false);
    }
  };

  const columns = useMemo<ColumnDef<PartyRow>[]>(
    () => [
      {
        id: 'name',
        header: t('partiesPage.columns.name'),
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
                {!p.isActive && <StatusBadge tone="neutral" label={t('partiesPage.status.inactive')} dot={false} className="px-1.5" />}
              </div>
              {contact && (
                <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                  {contact}
                </p>
              )}
              {/* Mobile: type stacked here because its column is hidden. */}
              <p className="mt-0.5 text-xs text-muted-foreground md:hidden">{typeLabel(p.partyType)}</p>
            </div>
          );
        },
      },
      {
        id: 'type',
        header: t('partiesPage.columns.type'),
        meta: { hideBelow: 'md' },
        cell: ({ row }) => {
          const meta = TYPE_META[row.original.partyType];
          return meta ? <StatusBadge tone={meta.tone} label={typeLabel(row.original.partyType) ?? ''} /> : null;
        },
      },
      {
        id: 'taxId',
        header: t('partiesPage.columns.taxId'),
        meta: { hideBelow: 'xl', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => row.original.taxId || '—',
      },
      {
        id: 'outstanding',
        header: () => (
          <Trans
            t={t}
            i18nKey="partiesPage.columns.outstanding"
            components={{ wide: <span className="hidden sm:inline" />, unit: <span className="normal-case" /> }}
          />
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
        header: () => withUnit(t('partiesPage.columns.deposit')),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'sm' },
        cell: ({ row }) => {
          const p = row.original;
          const lines: Array<{ label: string; value: number }> = [];
          if (isCustomerSide(p)) lines.push({ label: t('partiesPage.type.customer'), value: num(p.customerDepositBalance) });
          if (isSupplierSide(p)) lines.push({ label: t('partiesPage.type.supplier'), value: num(p.depositBalance) });
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
        header: () => <span className="sr-only">{t('partiesPage.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const p = row.original;
          return (
            <RowActions
              label={t('partiesPage.actions.menuLabel', { name: p.name })}
              actions={[
                { label: t('partiesPage.actions.edit'), icon: Pencil, hidden: !canEdit, onSelect: () => openEdit(p) },
                {
                  label: t('partiesPage.actions.viewSalesInvoices'),
                  icon: FileText,
                  hidden: !isCustomerSide(p),
                  onSelect: () => navigate(`/sales?partyId=${encodeURIComponent(p.id)}`),
                },
                {
                  label: t('partiesPage.actions.viewPurchaseInvoices'),
                  icon: ShoppingCart,
                  hidden: !isSupplierSide(p),
                  onSelect: () => navigate(`/purchase?partyId=${encodeURIComponent(p.id)}`),
                },
                { label: t('partiesPage.actions.delete'), icon: Trash2, tone: 'danger', hidden: !canDelete, onSelect: () => setDeleteTarget(p) },
              ]}
            />
          );
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [canEdit, canDelete, t],
  );

  const summary = summaryQuery.data;
  const kpiLoading = !summary && !summaryQuery.isError;
  const total = partiesQuery.data?.total;

  return (
    // Manual activation: avoids two history entries per click (see DeliveryOrders).
    <Tabs value={tab} onValueChange={changeTab} activationMode="manual" className="pb-8">
      <PageHeader
        title={t('partiesPage.title')}
        description={t('partiesPage.description')}
        actions={
          <>
            {tab !== 'analysis' && (
              <Button variant="outline" onClick={handleExport} loading={exporting} disabled={!total}>
                <Download aria-hidden />
                <span className="sr-only sm:not-sr-only">{t('partiesPage.exportExcel')}</span>
              </Button>
            )}
            {canEdit && (
              <Button variant="outline" onClick={() => setImportOpen(true)}>
                <Upload aria-hidden />
                <span className="sr-only sm:not-sr-only">{t('partiesPage.import')}</span>
              </Button>
            )}
            {canEdit && (
              <Button onClick={openCreate}>
                <Plus aria-hidden />
                {t('partiesPage.addPartner')}
              </Button>
            )}
          </>
        }
      >
        <TabsList variant="underline" aria-label={t('partiesPage.tabs.label')}>
          <TabsTrigger value="all">{t('partiesPage.tabs.all')}</TabsTrigger>
          <TabsTrigger value="Customer">{t('partiesPage.tabs.customer')}</TabsTrigger>
          <TabsTrigger value="Supplier">{t('partiesPage.tabs.supplier')}</TabsTrigger>
          <TabsTrigger value="analysis">{t('partiesPage.tabs.analysis')}</TabsTrigger>
        </TabsList>
      </PageHeader>

      {tab !== 'analysis' && (
        <TabsContent value={tab} className="mt-0 space-y-5">
          <section aria-label={t('partiesPage.kpi.label')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label={t('partiesPage.kpi.count')}
              icon={Users}
              loading={kpiLoading}
              value={summary ? formatNumber(summary.total) : '—'}
              hint={
                summary
                  ? t('partiesPage.kpi.countHint', {
                      customers: formatNumber(summary.byType.Customer),
                      suppliers: formatNumber(summary.byType.Supplier),
                    })
                  : undefined
              }
            />
            <StatCard
              label={t('partiesPage.kpi.receivable')}
              icon={Wallet}
              loading={kpiLoading}
              value={kpiMoney(summary?.totalReceivable)}
              valueTitle={summary ? formatRupiah(summary.totalReceivable) : undefined}
              hint={summary ? t('partiesPage.kpi.customerDepositHint', { amount: formatRupiah(summary.totalCustomerDeposit, { compact: true }) }) : undefined}
            />
            <StatCard
              label={t('partiesPage.kpi.payable')}
              icon={Scale}
              loading={kpiLoading}
              value={kpiMoney(summary?.totalPayable)}
              valueTitle={summary ? formatRupiah(summary.totalPayable) : undefined}
              hint={summary ? t('partiesPage.kpi.supplierDepositHint', { amount: formatRupiah(summary.totalVendorDeposit, { compact: true }) }) : undefined}
            />
            <StatCard
              label={t('partiesPage.kpi.withBalance')}
              icon={PiggyBank}
              loading={kpiLoading}
              value={summary ? formatNumber(summary.withOutstandingCount) : '—'}
              hint={summary ? t('partiesPage.kpi.inactiveHint', { total: formatNumber(summary.inactiveCount) }) : undefined}
            />
          </section>

          <div className="space-y-3">
            <FilterBar
              list={list}
              searchLabel={t('partiesPage.filters.searchLabel')}
              searchPlaceholder={t('partiesPage.filters.searchPlaceholder')}
              status={{ key: 'isActive', options: activeFilterOptions(), label: t('partiesPage.filters.statusLabel'), allLabel: t('partiesPage.filters.allStatus') }}
            >
              <div className="w-[calc(50%-0.25rem)] sm:w-48">
                <label htmlFor="parties-outstanding" className="sr-only">
                  {t('partiesPage.filters.outstandingLabel')}
                </label>
                <Select
                  value={list.filters.hasOutstanding || ALL}
                  onValueChange={(v) => list.setFilter('hasOutstanding', v === ALL ? '' : v)}
                >
                  <SelectTrigger id="parties-outstanding">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>{t('partiesPage.filters.allBalances')}</SelectItem>
                    <SelectItem value="true">{t('partiesPage.filters.hasOutstanding')}</SelectItem>
                    <SelectItem value="false">{t('partiesPage.filters.noOutstanding')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </FilterBar>

            <DataTable
              {...listTableProps(list, total)}
              label={t('partiesPage.table.label')}
              itemLabel={t('partiesPage.table.itemLabel')}
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
                title: t('partiesPage.empty.title'),
                description: t('partiesPage.empty.description'),
                action: canEdit ? (
                  <Button size="sm" onClick={openCreate}>
                    <Plus aria-hidden />
                    {t('partiesPage.empty.action')}
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
        title={t('partiesPage.delete.title')}
        description={
          <Trans
            t={t}
            i18nKey="partiesPage.delete.description"
            values={{ name: deleteTarget?.name ?? '' }}
            components={{ name: <span className="font-medium text-foreground" /> }}
          />
        }
        confirmLabel={t('partiesPage.delete.confirm')}

        loading={deleteMutation.isPending}
        onConfirm={() => {
          if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
        }}
      />

      <ImportModal isOpen={importOpen} onClose={() => setImportOpen(false)} importType="parties" />
    </Tabs>
  );
};
