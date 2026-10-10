/**
 * Temporary delivery notes (SJS) tab of /delivery-orders. The reminder banner uses the global,
 * unfiltered /summary, loaded by the page so the tab can show the open count too.
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
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
const STATUS_FILTER = statusOptions(['Open', 'Linked', 'Cancelled'], 'temporary_delivery_note');

export function SjsReminder({ summary }: { summary: SjsSummary | undefined }) {
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
        <b className="num">{formatNumber(summary.open)}</b> surat jalan sementara masih Terbuka (belum ditautkan ke surat
        jalan resmi)
        {late && (
          <>
            ,{' '}
            <b className="num">{formatNumber(summary.overdue)}</b> sudah lebih dari {SJS_REMINDER_DAYS} hari
          </>
        )}
        .
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
        header: 'Nomor',
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
        header: 'Tanggal',
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'customer',
        header: 'Pelanggan',
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-64' },
        cell: ({ row }) => <p className="truncate font-medium text-foreground">{row.original.customerName}</p>,
      },
      {
        id: 'nomorMobil',
        header: 'No. Mobil',
        meta: { hideBelow: 'lg', cellClassName: 'whitespace-nowrap font-mono text-xs uppercase text-muted-foreground' },
        cell: ({ row }) => row.original.nomorMobil || '—',
      },
      {
        id: 'ringkasan',
        header: 'Barang',
        meta: { hideBelow: 'md', cellClassName: 'max-w-72' },
        cell: ({ row }) => (
          <p className="truncate text-muted-foreground" title={row.original.ringkasan ?? undefined}>
            {row.original.ringkasan || '—'}
          </p>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const r = row.original;
          const stale = r.status === 'Open' && r.umur_hari > SJS_REMINDER_DAYS;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <StatusBadge status={r.status} docType="temporary_delivery_note" />
              {stale && (
                <span className="num text-xs font-medium text-danger-text">
                  {formatNumber(r.umur_hari)} hari<span className="sr-only"> belum ditautkan</span>
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'doNumber',
        header: 'DO Resmi',
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
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={`Aksi untuk ${row.original.number}`}
            actions={[{ label: 'Lihat detail', icon: Eye, onSelect: () => setSelectedId(row.original.id) }]}
          />
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Barang dikirim sebelum produksi diinput.{' '}
        <b className="font-medium text-foreground">Tidak memotong stok, tanpa jurnal, tidak bisa diinvoice.</b>{' '}
        Tautkan ke surat jalan resmi setelah produksi selesai.
      </p>

      <SjsReminder summary={summary} />

      <FilterBar
        list={list}
        searchLabel="Cari surat jalan sementara"
        searchPlaceholder="Cari nomor, pelanggan, no. mobil"
        status={{ options: STATUS_FILTER }}
        dateRange
      >
        <PartyFilter partyType="Customer" value={list.filters.partyId} onChange={(v) => list.setFilter('partyId', v)} />
      </FilterBar>

      <DataTable
        {...listTableProps(list, notesQuery.data?.total)}
        label="Daftar surat jalan sementara"
        itemLabel="surat jalan sementara"
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
          title: 'Belum ada surat jalan sementara',
          description: 'Gunakan saat barang harus dikirim sebelum produksi diinput.',
          action: onCreate ? (
            <Button size="sm" onClick={onCreate}>
              <Plus aria-hidden />
              Buat surat jalan sementara
            </Button>
          ) : undefined,
        }}
      />

      <TemporaryDeliveryNoteDrawer noteId={selectedId} onClose={() => setSelectedId(null)} />
    </div>
  );
}

export default TemporaryDeliveryNotesList;
