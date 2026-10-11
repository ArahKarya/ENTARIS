/**
 * Official DO tab of /delivery-orders. "Sudah/Belum Diinvoice" are derived (Submitted ± invoice);
 * the server filter understands status=Submitted|Invoiced|Cancelled.
 */
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Plus, ReceiptText } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { getStatusLabel } from '@/lib/status';
import { can } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DocumentLink,
  FilterBar,
  PartyFilter,
  RowActions,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import DeliveryOrderDetailDrawer from '@/components/DeliveryOrderDetailDrawer';

interface DeliveryOrderRow {
  id: string;
  doNumber: string;
  date: string;
  status: string;
  partyId: string;
  nomorMobil: string | null;
  customer?: { id: string; name: string } | null;
  invoice?: { id: string; invoiceNumber: string } | null;
  salesOrder?: { id: string; soNumber: string; customerRefNo: string | null } | null;
  _count?: { items: number };
}

const ENDPOINT = '/delivery-orders';
const FILTER_KEYS = ['status', 'partyId', 'startDate', 'endDate'] as const;
// Filter values are what the API expects; labels match the row badges (built at render to follow the language).
const statusFilter = () => [
  { value: 'Submitted', label: getStatusLabel('Uninvoiced', 'delivery_order') },
  { value: 'Invoiced', label: getStatusLabel('Invoiced', 'delivery_order') },
  { value: 'Cancelled', label: getStatusLabel('Cancelled', 'delivery_order') },
];

/** Badge status: Submitted splits into Invoiced / Uninvoiced. */
function deliveryOrderDisplayStatus(row: Pick<DeliveryOrderRow, 'status' | 'invoice'>): string {
  if (row.status !== 'Submitted') return row.status;
  return row.invoice ? 'Invoiced' : 'Uninvoiced';
}

export interface DeliveryOrdersListProps {
  /** Opens the create modal (owned by the page header). */
  onCreate: () => void;
}

export function DeliveryOrdersList({ onCreate }: DeliveryOrdersListProps) {
  const { t } = useTranslation('sales');
  const navigate = useNavigate();
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canInvoice = can('sales_invoice', 'edit');

  const ordersQuery = useQuery({
    queryKey: ['delivery-orders', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<DeliveryOrderRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<DeliveryOrderRow>[]>(
    () => [
      {
        id: 'doNumber',
        header: t('deliveryOrdersOfficialPage.columns.number'),
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.doNumber}</DocumentLink>
            {/* Mobile: customer + date stacked here because their columns are hidden. */}
            <span className="max-w-44 truncate text-sm font-medium text-foreground sm:hidden">
              {row.original.customer?.name ?? '—'}
            </span>
            <span className="num text-xs text-muted-foreground md:hidden">{formatDate(row.original.date)}</span>
          </div>
        ),
      },
      {
        id: 'date',
        header: t('deliveryOrdersOfficialPage.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'customer',
        header: t('deliveryOrdersOfficialPage.columns.customer'),
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => <p className="truncate font-medium text-foreground">{row.original.customer?.name ?? '—'}</p>,
      },
      {
        id: 'poRef',
        header: t('deliveryOrdersOfficialPage.columns.poSoRef'),
        meta: { hideBelow: 'lg', cellClassName: 'min-w-32 whitespace-nowrap' },
        cell: ({ row }) => {
          const so = row.original.salesOrder;
          if (!so) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="flex flex-col">
              <span className="num font-mono text-xs text-foreground">{so.customerRefNo?.trim() || '—'}</span>
              <span className="num font-mono text-xs text-muted-foreground">{so.soNumber}</span>
            </div>
          );
        },
      },
      {
        id: 'nomorMobil',
        header: t('deliveryOrdersOfficialPage.columns.vehicle'),
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap font-mono text-xs uppercase text-muted-foreground' },
        cell: ({ row }) => row.original.nomorMobil || '—',
      },
      {
        id: 'items',
        header: t('deliveryOrdersOfficialPage.columns.items'),
        meta: { align: 'right', hideBelow: 'xl', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => formatNumber(row.original._count?.items ?? 0),
      },
      {
        id: 'status',
        header: t('deliveryOrdersOfficialPage.columns.status'),
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <StatusBadge status={deliveryOrderDisplayStatus(row.original)} docType="delivery_order" />
            {/* Mobile: invoice number stacked here because its column is hidden. */}
            {row.original.invoice && (
              <span className="num font-mono text-xs text-muted-foreground md:hidden">
                {row.original.invoice.invoiceNumber}
              </span>
            )}
          </div>
        ),
      },
      {
        id: 'invoice',
        header: t('deliveryOrdersOfficialPage.columns.invoice'),
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.invoice ? (
            <span className="num font-mono text-xs text-foreground">{row.original.invoice.invoiceNumber}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('deliveryOrdersOfficialPage.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const d = row.original;
          return (
            <RowActions
              label={t('deliveryOrdersOfficialPage.rowActions.label', { number: d.doNumber })}
              actions={[
                { label: t('deliveryOrdersOfficialPage.rowActions.view'), icon: Eye, onSelect: () => setSelectedId(d.id) },
                {
                  // Same deep link as the drawer's "Buat Invoice".
                  label: t('deliveryOrdersOfficialPage.rowActions.createInvoice'),
                  icon: ReceiptText,
                  hidden: !canInvoice || deliveryOrderDisplayStatus(d) !== 'Uninvoiced',
                  onSelect: () => navigate(`/sales?fromDO=${d.id}&party=${d.partyId}`),
                },
              ]}
            />
          );
        },
      },
    ],
    [canInvoice, navigate, t],
  );

  return (
    <div className="space-y-3">
      <FilterBar
        list={list}
        searchLabel={t('deliveryOrdersOfficialPage.searchLabel')}
        searchPlaceholder={t('deliveryOrdersOfficialPage.searchPlaceholder')}
        status={{ options: statusFilter() }}
        dateRange
      >
        <PartyFilter partyType="Customer" value={list.filters.partyId} onChange={(v) => list.setFilter('partyId', v)} />
      </FilterBar>

      <DataTable
        {...listTableProps(list, ordersQuery.data?.total)}
        label={t('deliveryOrdersOfficialPage.tableLabel')}
        itemLabel={t('deliveryOrdersOfficialPage.itemLabel')}
        columns={columns}
        data={ordersQuery.data?.data}
        getRowId={(row) => row.id}
        loading={ordersQuery.isLoading}
        fetching={ordersQuery.isFetching && ordersQuery.isPlaceholderData}
        error={ordersQuery.error}
        onRetry={() => ordersQuery.refetch()}
        onRowClick={(row) => setSelectedId(row.id)}
        density={density}
        onDensityChange={setDensity}
        empty={{
          title: t('deliveryOrdersOfficialPage.empty.title'),
          description: t('deliveryOrdersOfficialPage.empty.description'),
          action: (
            <Button size="sm" onClick={onCreate}>
              <Plus aria-hidden />
              {t('deliveryOrdersOfficialPage.empty.action')}
            </Button>
          ),
        }}
      />

      <DeliveryOrderDetailDrawer doId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

export default DeliveryOrdersList;
