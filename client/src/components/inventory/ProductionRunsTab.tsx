/**
 * Stok & Produksi → Proses Produksi → "Data Produksi" (?tab=production&view=data).
 * List-kit page over /inventory/production-runs (server-side search, status,
 * date range, sort) with KPIs from /inventory/production-runs/summary. The run
 * number / row opens ProductionDetailDrawer (owned by the page).
 */
import { useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Factory, Pencil, Percent, Plus, Scale, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { formatDate, formatNumber } from '@/lib/format';
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
import {
  PRODUCTION_FILTER_KEYS,
  formatQty,
  isByProductLine,
  splitRunLines,
  type ProductionRunLine,
  type ProductionRunRow,
  type ProductionRunSummary,
} from './inventory-rows';

const ENDPOINT = '/inventory/production-runs';
const STATUS_FILTER = [
  { value: 'active', label: 'Diposting' },
  { value: 'cancelled', label: 'Dibatalkan' },
];

interface ProductionRunsTabProps {
  canEdit: boolean;
  canCancel: boolean;
  onCreate?: () => void;
  onOpen: (runId: string) => void;
  onEdit: (run: ProductionRunRow) => void;
  onCancel: (run: ProductionRunRow) => void;
}

function Lines({ lines, cancelled }: { lines: ProductionRunLine[]; cancelled: boolean }) {
  if (lines.length === 0) return <span className="text-muted-foreground">-</span>;
  return (
    <ul className={cn('min-w-0 space-y-0.5 text-xs', cancelled && 'line-through')}>
      {lines.map((l, idx) => (
        <li
          key={l.id}
          className={cn('flex min-w-0 items-baseline gap-1.5', idx > 0 && 'group-data-[density=compact]/table:hidden')}
        >
          <span className="truncate font-medium text-foreground">{l.item?.name ?? '-'}</span>
          <span className="num shrink-0 text-muted-foreground">
            {formatQty(l.quantity)} {l.item?.unit}
          </span>
          {isByProductLine(l) && (
            <span className="shrink-0 rounded-sm bg-warning-subtle px-1 text-[11px] font-medium text-warning-text">Samping</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProductionRunsTab({ canEdit, canCancel, onCreate, onOpen, onEdit, onCancel }: ProductionRunsTabProps) {
  const list = useListState({ filters: PRODUCTION_FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();

  const runsQuery = useQuery({
    queryKey: ['production-runs', 'list', list.params],
    queryFn: async () => (await api.get<Paginated<ProductionRunRow>>(ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });
  const summaryQuery = useQuery({
    queryKey: ['production-runs', 'summary', list.filterParams],
    queryFn: async () => (await api.get<ProductionRunSummary>(`${ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const total = runsQuery.data?.total;
  const summary = summaryQuery.data;
  const kpiLoading = !summary && !summaryQuery.isError;
  const unit = summary?.unit ? ` ${summary.unit}` : '';

  const columns = useMemo<ColumnDef<ProductionRunRow>[]>(
    () => [
      {
        id: 'runNumber',
        header: 'Nomor',
        enableSorting: true,
        sortDescFirst: true,
        cell: ({ row }) => {
          const r = row.original;
          const { outputs } = splitRunLines(r);
          return (
            <div className="flex flex-col items-start gap-0.5">
              <DocumentLink onClick={() => onOpen(r.id)} className={cn(r.isCancelled && 'line-through')}>
                {r.runNumber}
              </DocumentLink>
              <span className="num text-xs text-muted-foreground md:hidden">{formatDate(r.date)}</span>
              {/* Mobile: main output stacked here because the output column is hidden. */}
              {outputs[0] && (
                <span className="line-clamp-2 max-w-40 text-xs break-words text-foreground sm:hidden">
                  {outputs[0].item?.name} {formatQty(outputs[0].quantity)} {outputs[0].item?.unit}
                  {outputs.length > 1 && <span className="text-muted-foreground"> +{outputs.length - 1}</span>}
                </span>
              )}
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
        id: 'reference',
        header: 'Referensi',
        meta: { hideBelow: 'xl', cellClassName: 'num font-mono text-xs text-muted-foreground' },
        cell: ({ row }) => row.original.referenceNumber || '-',
      },
      {
        id: 'inputs',
        header: 'Input',
        meta: { hideBelow: 'lg', cellClassName: 'min-w-40 max-w-64' },
        cell: ({ row }) => <Lines lines={splitRunLines(row.original).inputs} cancelled={row.original.isCancelled} />,
      },
      {
        id: 'outputs',
        header: 'Output',
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => <Lines lines={splitRunLines(row.original).outputs} cancelled={row.original.isCancelled} />,
      },
      {
        id: 'yieldPct',
        header: 'Rendemen',
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col items-end gap-1">
              <span className={cn(r.isCancelled ? 'text-muted-foreground line-through' : 'font-medium text-foreground')}>
                {r.yieldPct != null ? `${formatNumber(r.yieldPct, { decimals: 1 })}%` : '-'}
              </span>
              {r.isCancelled && <StatusBadge status="Cancelled" docType="production_run" />}
            </div>
          );
        },
      },
      {
        id: 'notes',
        header: 'Catatan',
        meta: { hideBelow: 'xl', cellClassName: 'max-w-44 truncate text-xs text-muted-foreground' },
        cell: ({ row }) => row.original.notes || '-',
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${r.runNumber}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => onOpen(r.id) },
                { label: 'Edit proses produksi', icon: Pencil, hidden: r.isCancelled || !canEdit, onSelect: () => onEdit(r) },
                {
                  label: 'Batalkan proses produksi',
                  icon: XCircle,
                  tone: 'danger',
                  hidden: r.isCancelled || !canCancel,
                  onSelect: () => onCancel(r),
                },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, canCancel, onOpen, onEdit, onCancel],
  );

  return (
    <div className="space-y-5">
      <section aria-label="Ringkasan proses produksi sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Proses Produksi"
          icon={Factory}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.activeCount) : '-'}
          hint={summary && summary.cancelledCount > 0 ? `${formatNumber(summary.cancelledCount)} dibatalkan` : 'diposting'}
        />
        <StatCard
          label="Total Input"
          icon={Scale}
          loading={kpiLoading}
          value={summary ? `${formatQty(summary.inputQty)}${unit}` : '-'}
          hint="bahan baku dipakai"
        />
        <StatCard
          label="Total Output"
          icon={Scale}
          loading={kpiLoading}
          value={summary ? `${formatQty(summary.outputQty)}${unit}` : '-'}
          hint={summary && summary.byproductQty > 0 ? `termasuk samping ${formatQty(summary.byproductQty)}${unit}` : 'produk dihasilkan'}
        />
        <StatCard
          label="Rendemen Rata-rata"
          icon={Percent}
          loading={kpiLoading}
          value={summary?.yieldPct != null ? `${formatNumber(summary.yieldPct, { decimals: 1 })}%` : '-'}
          hint="tertimbang input"
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari proses produksi"
          searchPlaceholder="Cari nomor, referensi, item, catatan"
          status={{ options: STATUS_FILTER, label: 'Status proses', allLabel: 'Semua status' }}
          dateRange
        />

        <DataTable
          {...listTableProps(list, total)}
          label="Daftar proses produksi"
          itemLabel="proses"
          columns={columns}
          data={runsQuery.data?.data}
          getRowId={(row) => row.id}
          loading={runsQuery.isLoading}
          fetching={runsQuery.isFetching && runsQuery.isPlaceholderData}
          error={runsQuery.error}
          onRetry={() => runsQuery.refetch()}
          onRowClick={(row) => onOpen(row.id)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: 'Belum ada proses produksi',
            description: 'Catat proses produksi untuk mengubah bahan baku menjadi produk jadi.',
            action: onCreate ? (
              <Button size="sm" onClick={onCreate}>
                <Plus aria-hidden />
                Catat proses produksi
              </Button>
            ) : undefined,
          }}
        />
      </div>
    </div>
  );
}
