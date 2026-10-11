/**
 * Temporary delivery notes (SJS) tab of /delivery-orders. The reminder banner uses the global,
 * unfiltered /summary, loaded by the page so the tab can show the open count too.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import type { ColumnDef } from '@tanstack/react-table';
import { Clock, Eye, Plus } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { cn } from '@/lib/utils';
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
import TemporaryDeliveryNoteDrawer from '@/components/TemporaryDeliveryNoteDrawer';

/** Keputusan Ndoro: pengingat SJS Terbuka > 7 hari. */
export const SJS_REMINDER_DAYS = 7;

export interface SjsSummary {
  open: number;
  overdue: number;
  days: number;
}

interface TemporaryNoteRow {
  id: string;
  number: string;
  date: string;
  status: string;
  nomorMobil: string | null;
  customerName: string;
  doNumber: string | null;
  ringkasan: string | null;
  umur_hari: number;
}

const ENDPOINT = '/temporary-delivery-notes';
const FILTER_KEYS = ['status', 'partyId', 'startDate', 'endDate'] as const;
/** Built at render so labels follow the UI language. */
const statusFilter = () => statusOptions(['Open', 'Linked', 'Cancelled'], 'temporary_delivery_note');

export function SjsReminder({ summary }: { summary: SjsSummary | undefined }) {
  const { t } = useTranslation('sales');
  if (!summary || summary.open <= 0) return null;
  const late = summary.overdue > 0;
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-2 rounded-lg border px-3 py-2 text-sm',
        late ? 'border-danger/30 bg-danger-subtle text-danger-text' : 'border-warning/30 bg-warning-subtle text-warning-text',
      )}
    >
      <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        {late ? (
          <Trans
            t={t}
            i18nKey="temporaryDeliveryNotesPage.reminder.openLate"
            count={summary.open}
            values={{ open: formatNumber(summary.open), overdue: formatNumber(summary.overdue), days: SJS_REMINDER_DAYS }}
            components={{ b: <b className="num" /> }}
          />
        ) : (
          <Trans
            t={t}
            i18nKey="temporaryDeliveryNotesPage.reminder.open"
            count={summary.open}
            values={{ open: formatNumber(summary.open) }}
            components={{ b: <b className="num" /> }}
          />
        )}
      </span>
    </div>
  );
}

export interface TemporaryDeliveryNotesListProps {
  summary: SjsSummary | undefined;
  /** Opens the create modal; undefined when the user may not create. */
  onCreate?: () => void;
}

export function TemporaryDeliveryNotesList({ summary, onCreate }: TemporaryDeliveryNotesListProps) {
  const { t } = useTranslation('sales');
  const list = useListState({ filters: FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const notesQuery = useQuery({
    queryKey: ['temporary-delivery-notes', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<TemporaryNoteRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const columns = useMemo<ColumnDef<TemporaryNoteRow>[]>(
    () => [
      {
        id: 'number',
        header: t('temporaryDeliveryNotesPage.columns.number'),
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => (
          <div className="flex flex-col items-start gap-0.5">
            <DocumentLink onClick={() => setSelectedId(row.original.id)}>{row.original.number}</DocumentLink>
            {/* Mobile: customer + date stacked here because their columns are hidden. */}
            <span className="max-w-44 truncate text-sm font-medium text-foreground sm:hidden">
              {row.original.customerName}
            </span>
            <span className="num text-xs text-muted-foreground md:hidden">{formatDate(row.original.date)}</span>
          </div>
        ),
      },
      {
        id: 'date',
        header: t('temporaryDeliveryNotesPage.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'customer',
        header: t('temporaryDeliveryNotesPage.columns.customer'),
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-64' },
        cell: ({ row }) => <p className="truncate font-medium text-foreground">{row.original.customerName}</p>,
      },
      {
        id: 'nomorMobil',
        header: t('temporaryDeliveryNotesPage.columns.vehicle'),
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap font-mono text-xs uppercase text-muted-foreground' },
        cell: ({ row }) => row.original.nomorMobil || '—',
      },
      {
        id: 'ringkasan',
        header: t('temporaryDeliveryNotesPage.columns.items'),
        meta: { hideBelow: 'md', cellClassName: 'max-w-72' },
        cell: ({ row }) => (
          <p className="truncate text-muted-foreground" title={row.original.ringkasan ?? undefined}>
            {row.original.ringkasan || '—'}
          </p>
        ),
      },
      {
        id: 'status',
        header: t('temporaryDeliveryNotesPage.columns.status'),
        cell: ({ row }) => {
          const r = row.original;
          const stale = r.status === 'Open' && r.umur_hari > SJS_REMINDER_DAYS;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <StatusBadge status={r.status} docType="temporary_delivery_note" />
              {stale && (
                <span className="num text-xs font-medium text-danger-text">
                  {t('temporaryDeliveryNotesPage.ageDays', { count: r.umur_hari, days: formatNumber(r.umur_hari) })}<span className="sr-only"> {t('temporaryDeliveryNotesPage.notLinked')}</span>
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'doNumber',
        header: t('temporaryDeliveryNotesPage.columns.officialDo'),
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) =>
          row.original.doNumber ? (
            <span className="num font-mono text-xs text-foreground">{row.original.doNumber}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('temporaryDeliveryNotesPage.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={t('temporaryDeliveryNotesPage.rowActions.label', { number: row.original.number })}
            actions={[{ label: t('temporaryDeliveryNotesPage.rowActions.view'), icon: Eye, onSelect: () => setSelectedId(row.original.id) }]}
          />
        ),
      },
    ],
    [t],
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        <Trans t={t} i18nKey="temporaryDeliveryNotesPage.intro" components={{ b: <b className="font-medium text-foreground" /> }} />
      </p>

      <SjsReminder summary={summary} />

      <FilterBar
        list={list}
        searchLabel={t('temporaryDeliveryNotesPage.searchLabel')}
        searchPlaceholder={t('temporaryDeliveryNotesPage.searchPlaceholder')}
        status={{ options: statusFilter() }}
        dateRange
      >
        <PartyFilter partyType="Customer" value={list.filters.partyId} onChange={(v) => list.setFilter('partyId', v)} />
      </FilterBar>

      <DataTable
        {...listTableProps(list, notesQuery.data?.total)}
        label={t('temporaryDeliveryNotesPage.tableLabel')}
        itemLabel={t('temporaryDeliveryNotesPage.itemLabel')}
        columns={columns}
        data={notesQuery.data?.data}
        getRowId={(row) => row.id}
        loading={notesQuery.isLoading}
        fetching={notesQuery.isFetching && notesQuery.isPlaceholderData}
        error={notesQuery.error}
        onRetry={() => notesQuery.refetch()}
        onRowClick={(row) => setSelectedId(row.id)}
        density={density}
        onDensityChange={setDensity}
        empty={{
          title: t('temporaryDeliveryNotesPage.empty.title'),
          description: t('temporaryDeliveryNotesPage.empty.description'),
          action: onCreate ? (
            <Button size="sm" onClick={onCreate}>
              <Plus aria-hidden />
              {t('temporaryDeliveryNotesPage.empty.action')}
            </Button>
          ) : undefined,
        }}
      />

      <TemporaryDeliveryNoteDrawer noteId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

export default TemporaryDeliveryNotesList;
