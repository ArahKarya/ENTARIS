/**
 * Stok & Produksi → tab "Gerakan Stok" (?tab=movements). List-kit page over
 * /inventory/movements with KPIs from /inventory/movements/summary. The
 * movement number opens a read-only detail drawer; edit/cancel follow the
 * server's blocking rules (see inventory-rows.movementEditBlock).
 */
import { useMemo, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Ban, Eye, Pencil, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatNumber, formatRupiah } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DocumentLink,
  FilterBar,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import { ItemFilter, SelectFilter, WarehouseFilter } from './filters';
import { useItemOptions, withUnit } from './list-helpers';
import { MovementDetailSheet } from './MovementDetailSheet';
import {
  MOVEMENT_FILTER_KEYS,
  MOVEMENT_TYPES,
  MOVEMENT_TYPE_LABEL,
  formatQty,
  isInbound,
  movementCancelBlock,
  movementEditBlock,
  movementTypeLabel,
  referenceTypeLabel,
  type StockMovementRow,
  type StockMovementSummary,
} from './inventory-rows';

const ENDPOINT = '/inventory/movements';
const TYPE_FILTER = MOVEMENT_TYPES.map((t) => ({ value: t, label: MOVEMENT_TYPE_LABEL[t] }));
const STATUS_FILTER = [
  { value: 'active', label: 'Diposting' },
  { value: 'cancelled', label: 'Dibatalkan' },
];

interface StockMovementsTabProps {
  canEdit: boolean;
  canCancel: boolean;
  onCreate?: () => void;
  onEdit: (m: StockMovementRow) => void;
  onCancel: (m: StockMovementRow) => void;
  onOpenProductionRun?: (runId: string) => void;
}

function QtyCell({ m }: { m: StockMovementRow }) {
  const inbound = isInbound(m.movementType);
  const Icon = inbound ? ArrowDownLeft : ArrowUpRight;
  return (
    <span
      className={cn(
        'inline-flex items-center justify-end gap-1 whitespace-nowrap font-medium',
        m.isCancelled ? 'text-muted-foreground line-through' : inbound ? 'text-success-text' : 'text-foreground',
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className="sr-only">{inbound ? 'Masuk' : 'Keluar'}: </span>
      {inbound ? '+' : '−'}
      {formatQty(m.quantity)}
      <span className="text-xs font-normal text-muted-foreground">{m.item?.unit ?? ''}</span>
    </span>
  );
}

export function StockMovementsTab({ canEdit, canCancel, onCreate, onEdit, onCancel, onOpenProductionRun }: StockMovementsTabProps) {
  const list = useListState({ filters: MOVEMENT_FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();
  const [selected, setSelected] = useState<StockMovementRow | null>(null);
  const { data: itemOptions } = useItemOptions();
  const filteredItem = itemOptions?.find((i) => i.id === list.filters.itemId);

  const movementsQuery = useQuery({
    queryKey: ['stock-movements', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<StockMovementRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: ['stock-movements', 'summary', list.filterParams],
    queryFn: async () => (await api.get<StockMovementSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const total = movementsQuery.data?.total;
  const summary = summaryQuery.data;
  const kpiLoading = !summary && !summaryQuery.isError;

  const editFor = canEdit ? onEdit : undefined;
  const cancelFor = canEdit && canCancel ? onCancel : undefined;

  const columns = useMemo<ColumnDef<StockMovementRow>[]>(
    () => [
      {
        id: 'movementNumber',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <DocumentLink onClick={() => setSelected(m)} className={cn(m.isCancelled && 'line-through')}>
                {m.movementNumber ?? m.id.slice(0, 8)}
              </DocumentLink>
              {/* Mobile: item and date stacked here because their columns are hidden. */}
              <span className="line-clamp-2 max-w-40 text-sm font-medium break-words text-foreground sm:hidden">
                {m.item?.name ?? '-'}
              </span>
              <span className="num text-xs text-muted-foreground md:hidden">{formatDate(m.date)}</span>
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
        id: 'item',
        header: 'Item',
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-32 max-w-56' },
        cell: ({ row }) => {
          const m = row.original;
          return (
            <div className="min-w-0">
              <p className="truncate font-medium text-foreground">{m.item?.name ?? '-'}</p>
              <p className="num truncate font-mono text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                {m.item?.code}
                <span className="font-sans xl:hidden">{m.warehouse ? ` · ${m.warehouse.name}` : ''}</span>
              </p>
            </div>
          );
        },
      },
      {
        id: 'warehouse',
        header: 'Gudang',
        meta: { hideBelow: 'xl', cellClassName: 'max-w-32 text-muted-foreground' },
        cell: ({ row }) => row.original.warehouse?.name ?? '-',
      },
      {
        id: 'movementType',
        header: 'Tipe',
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const t = row.original.movementType;
          const Icon = t.startsWith('Transfer') ? ArrowLeftRight : isInbound(t) ? ArrowDownLeft : ArrowUpRight;
          return (
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Icon className="size-3.5 text-muted-foreground" aria-hidden />
              {movementTypeLabel(t)}
            </span>
          );
        },
      },
      {
        id: 'quantity',
        header: 'Kuantitas',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => (
          <div className="flex flex-col items-end gap-1">
            <QtyCell m={row.original} />
            {row.original.isCancelled && <StatusBadge status="Cancelled" />}
          </div>
        ),
      },
      {
        id: 'totalValue',
        header: () => withUnit('Nilai'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right', hideBelow: 'md' },
        cell: ({ row }) => {
          const m = row.original;
          return (
            <span className={cn(m.isCancelled ? 'text-muted-foreground line-through' : 'text-foreground')}>
              {m.totalValue != null ? formatRupiah(m.totalValue, { symbol: false }) : '-'}
            </span>
          );
        },
      },
      {
        id: 'reference',
        header: 'Referensi',
        meta: { hideBelow: 'xl', cellClassName: 'max-w-36' },
        cell: ({ row }) => {
          const m = row.original;
          if (!m.referenceNumber) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="min-w-0 text-xs">
              <p className="truncate text-muted-foreground">{referenceTypeLabel(m.referenceType)}</p>
              <p className="num truncate font-mono text-foreground">{m.referenceNumber}</p>
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const m = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${m.movementNumber ?? 'gerakan stok'}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => setSelected(m) },
                { label: 'Edit gerakan', icon: Pencil, hidden: !editFor || !!movementEditBlock(m), onSelect: () => onEdit(m) },
                {
                  label: 'Batalkan gerakan',
                  icon: XCircle,
                  tone: 'danger',
                  hidden: !cancelFor || !!movementCancelBlock(m),
                  onSelect: () => onCancel(m),
                },
              ]}
            />
          );
        },
      },
    ],
    [editFor, cancelFor, onEdit, onCancel],
  );

  const unit = filteredItem?.unit;
  const qtyHint = (count: number | undefined, qty: number | undefined) => {
    if (count === undefined) return undefined;
    const base = `${formatNumber(count)} gerakan`;
    return unit && qty !== undefined ? `${base} · ${formatQty(qty)} ${unit}` : base;
  };

  return (
    <div className="space-y-5">
      <section aria-label="Ringkasan gerakan stok sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jumlah Gerakan"
          icon={ArrowLeftRight}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.count) : '-'}
          hint={summary ? `${formatNumber(summary.count - summary.cancelledCount)} diposting` : undefined}
        />
        <StatCard
          label="Nilai Masuk"
          icon={ArrowDownLeft}
          loading={kpiLoading}
          value={summary ? formatRupiah(summary.inValue, { compact: true }) : '-'}
          valueTitle={summary ? formatRupiah(summary.inValue) : undefined}
          hint={qtyHint(summary?.inCount, summary?.inQty)}
        />
        <StatCard
          label="Nilai Keluar"
          icon={ArrowUpRight}
          loading={kpiLoading}
          value={summary ? formatRupiah(summary.outValue, { compact: true }) : '-'}
          valueTitle={summary ? formatRupiah(summary.outValue) : undefined}
          hint={qtyHint(summary?.outCount, summary?.outQty)}
        />
        <StatCard
          label="Dibatalkan"
          icon={Ban}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.cancelledCount) : '-'}
          hint="tidak dihitung di nilai"
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari gerakan stok"
          searchPlaceholder="Cari nomor, item, referensi, catatan"
          status={{ options: TYPE_FILTER, key: 'movementType', label: 'Tipe gerakan', allLabel: 'Semua tipe' }}
          dateRange
        >
          <SelectFilter
            label="Status gerakan"
            allLabel="Semua status"
            options={STATUS_FILTER}
            value={list.filters.status}
            onChange={(v) => list.setFilter('status', v)}
          />
          <ItemFilter value={list.filters.itemId} onChange={(v) => list.setFilter('itemId', v)} />
          <WarehouseFilter value={list.filters.warehouseId} onChange={(v) => list.setFilter('warehouseId', v)} />
        </FilterBar>

        <DataTable
          {...listTableProps(list, total)}
          label="Riwayat gerakan stok"
          itemLabel="gerakan"
          columns={columns}
          data={movementsQuery.data?.data}
          getRowId={(row) => row.id}
          loading={movementsQuery.isLoading}
          fetching={movementsQuery.isFetching && movementsQuery.isPlaceholderData}
          error={movementsQuery.error}
          onRetry={() => movementsQuery.refetch()}
          onRowClick={(row) => setSelected(row)}
          rowClassName={(row) => (row.isCancelled ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada gerakan stok',
            description: 'Gerakan dari STT, surat jalan, produksi, opname, dan input manual muncul di sini.',
            action: onCreate ? (
              <Button size="sm" onClick={onCreate}>
                Catat gerakan
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <MovementDetailSheet
        movement={selected}
        onClose={() => setSelected(null)}
        onEdit={
          editFor
            ? (m) => {
                setSelected(null);
                onEdit(m);
              }
            : undefined
        }
        onCancel={
          cancelFor
            ? (m) => {
                setSelected(null);
                onCancel(m);
              }
            : undefined
        }
        onOpenProductionRun={
          onOpenProductionRun
            ? (id) => {
                setSelected(null);
                onOpenProductionRun(id);
              }
            : undefined
        }
      />
    </div>
  );
}
