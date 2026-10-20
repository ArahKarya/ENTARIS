/** Proforma Invoice (/proforma-invoices); lifecycle, PDF and conversion live in ProformaDetailDrawer, create/edit in ProformaModal. */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { formatDate, formatRupiah, toNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { can } from '@/lib/permissions';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  DataTable, DocumentLink, FilterBar, PageHeader, PartyFilter, RowActions, StatusBadge, listTableProps, type Paginated,
} from '@/components/shared';
import ProformaModal from '@/components/ProformaModal';
import ProformaDetailDrawer from '@/components/ProformaDetailDrawer';

type Money = string | number;

interface ProformaRow {
  id: string;
  proformaNumber: string;
  date: string;
  validUntil: string;
  status: string;
  displayStatus: string;
  grandTotal: Money;
  customer?: { id: string; name: string; phone?: string | null } | null;
  quotation?: { quotationNumber: string } | null;
  salesOrder?: { soNumber: string } | null;
  salesInvoice?: { invoiceNumber: string } | null;
  payment: { target: number; paid: number; remaining: number; paidPct: number };
}

const ENDPOINT = '/proforma-invoices';
const FILTER_KEYS = ['status', 'partyId'] as const;
const statusFilter = () =>
  statusOptions(['Draft', 'Sent', 'PartiallyPaid', 'Paid', 'Expired', 'Converted', 'Cancelled'], 'proforma_invoice');

const money = (v: Money | null | undefined) => formatRupiah(toNumber(v) ?? 0, { symbol: false });

export const ProformaInvoices = () => {
  const { t } = useTranslation('sales');
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [isModalOpen, setIsModalOpen] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [editTarget, setEditTarget] = useState<any>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canEdit = can('proforma_invoice', 'edit');

  // "Buat Proforma" dari Quotation / Sales Order mendarat di sini dengan ?fromQuotation= / ?fromSalesOrder=.
  const [searchParams, setSearchParams] = useSearchParams();
  const fromQuotation = searchParams.get('fromQuotation');
  const fromSalesOrder = searchParams.get('fromSalesOrder');
  useEffect(() => {
    if (!fromQuotation && !fromSalesOrder) return;
    const url = fromSalesOrder
      ? `/sales-orders/${encodeURIComponent(fromSalesOrder)}`
      : `/quotations/${encodeURIComponent(fromQuotation as string)}`;
    let cancelled = false;
    api
      .get(url)
      .then((res) => {
        if (cancelled) return;
        const src = res.data;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const items = (src.items ?? []).map((it: any) => ({
          itemName: it.itemName, itemType: it.itemType, inventoryItemId: it.inventoryItemId,
          serviceItemId: it.serviceItemId, accountId: it.accountId, description: it.description,
          quantity: it.quantity, unit: it.unit, rate: it.rate, discount: it.discount,
          taxPct: it.taxPct, pphPct: it.pphPct,
        }));
        setEditTarget({
          sourceKey: fromSalesOrder ?? fromQuotation,
          quotationId: fromSalesOrder ? src.quotationId ?? null : src.id,
          salesOrderId: fromSalesOrder ? src.id : null,
          partyId: src.partyId, customerRefNo: src.customerRefNo ?? '',
          notes: src.notes ?? '', terms: src.terms ?? undefined,
          potongan: src.potongan, biayaLain: src.biayaLain,
          labelPotongan: src.labelPotongan, labelBiaya: src.labelBiaya, items,
        });
        setIsModalOpen(true);
      })
      .catch(() => toast.error(t('proformaPage.errors.sourceLoadFailed')))
      .finally(() => {
        if (!cancelled) setSearchParams({}, { replace: true });
      });
    return () => { cancelled = true; };
  }, [fromQuotation, fromSalesOrder, setSearchParams, t]);

  const query = useQuery({
    queryKey: ['proforma-invoices', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<ProformaRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });
  const total = query.data?.total;

  const openCreate = () => {
    setEditTarget(null);
    setIsModalOpen(true);
  };

  const columns = useMemo<ColumnDef<ProformaRow>[]>(
    () => [
      {
        id: 'proformaNumber',
        header: t('proformaPage.columns.number'),
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.proformaNumber}</DocumentLink>
            <span className="max-w-44 truncate text-sm font-medium text-foreground sm:hidden">{row.original.customer?.name ?? '—'}</span>
            <span className="num text-xs text-muted-foreground md:hidden">{formatDate(row.original.date)}</span>
          </div>
        ),
      },
      {
        id: 'date',
        header: t('proformaPage.columns.date'),
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'customer',
        header: t('proformaPage.columns.customer'),
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => <p className="truncate font-medium text-foreground">{row.original.customer?.name ?? '—'}</p>,
      },
      {
        id: 'source',
        header: t('proformaPage.columns.source'),
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const r = row.original;
          const ref = r.salesOrder?.soNumber ?? r.quotation?.quotationNumber;
          return ref ? <span className="num font-mono text-xs text-muted-foreground">{ref}</span> : <span className="text-muted-foreground">—</span>;
        },
      },
      {
        id: 'validUntil',
        header: t('proformaPage.columns.validUntil'),
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.validUntil),
      },
      {
        id: 'grandTotal',
        header: () => (<>{t('proformaPage.columns.total')} <span className="normal-case">(Rp)</span></>),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex flex-col items-end gap-1">
            <span className="font-medium text-foreground">{money(row.original.grandTotal)}</span>
            <StatusBadge status={row.original.displayStatus} docType="proforma_invoice" className="sm:hidden" />
          </div>
        ),
      },
      {
        id: 'paid',
        header: t('proformaPage.columns.paid'),
        meta: { align: 'right', hideBelow: 'md', cellClassName: 'num whitespace-nowrap' },
        cell: ({ row }) => {
          const p = row.original.payment;
          if (row.original.status === 'Draft' || p.paid <= 0) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="text-success-text" title={t('proformaPage.paidOfTarget', { pct: p.paidPct })}>
              {money(p.paid)}
            </span>
          );
        },
      },
      {
        id: 'status',
        header: t('proformaPage.columns.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.displayStatus} docType="proforma_invoice" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('proformaPage.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <RowActions
              label={t('proformaPage.rowActions.label', { number: r.proformaNumber })}
              actions={[
                { label: t('proformaPage.rowActions.view'), icon: Eye, onSelect: () => setSelectedId(r.id) },
                {
                  label: t('proformaPage.rowActions.edit'),
                  icon: Pencil,
                  hidden: !canEdit || r.status !== 'Draft',
                  onSelect: () => {
                    setEditTarget(r);
                    setIsModalOpen(true);
                  },
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, t],
  );

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('proformaPage.title')}
        description={t('proformaPage.description')}
        actions={
          canEdit ? (
            <Button onClick={openCreate}>
              <Plus aria-hidden />
              {t('proformaPage.create')}
            </Button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('proformaPage.search.label')}
          searchPlaceholder={t('proformaPage.search.placeholder')}
          status={{ options: statusFilter() }}
        >
          <PartyFilter partyType="Customer" value={list.filters.partyId} onChange={(v) => list.setFilter('partyId', v)} />
        </FilterBar>

        <DataTable
          {...listTableProps(list, total)}
          label={t('proformaPage.table.label')}
          itemLabel={t('proformaPage.table.itemLabel')}
          columns={columns}
          data={query.data?.data}
          getRowId={(row) => row.id}
          loading={query.isLoading}
          fetching={query.isFetching && query.isPlaceholderData}
          error={query.error}
          onRetry={() => query.refetch()}
          onRowClick={(row) => setSelectedId(row.id)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('proformaPage.empty.title'),
            description: t('proformaPage.empty.description'),
            action: canEdit ? (
              <Button size="sm" onClick={openCreate}>
                <Plus aria-hidden />
                {t('proformaPage.empty.action')}
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <ProformaModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setEditTarget(null);
        }}
        editTarget={editTarget}
      />

      <ProformaDetailDrawer
        proformaId={selectedId}
        onClose={() => setSelectedId(null)}
        onEdit={(p) => {
          setSelectedId(null);
          setEditTarget(p);
          setIsModalOpen(true);
        }}
      />
    </div>
  );
};

export default ProformaInvoices;
