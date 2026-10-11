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
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { statusOptions } from '@/lib/status';
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
const RUN_STATUSES = ['active', 'cancelled'] as const;

interface ProductionRunsTabProps {
  canEdit: boolean;
  canCancel: boolean;
  onCreate?: () => void;
  onOpen: (runId: string) => void;
  onEdit: (run: ProductionRunRow) => void;
  onCancel: (run: ProductionRunRow) => void;
}

function Lines({ lines, cancelled }: { lines: ProductionRunLine[]; cancelled: boolean }) {
  const { t } = useTranslation('production');
  if (lines.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <ul className={cn('min-w-0 space-y-0.5 text-xs', cancelled && 'line-through')}>
      {lines.map((l, idx) => (
        <li
          key={l.id}
          className={cn('flex min-w-0 items-baseline gap-1.5', idx > 0 && 'group-data-[density=compact]/table:hidden')}
        >
          <span className="truncate font-medium text-foreground">{l.item?.name ?? '—'}</span>
          <span className="num shrink-0 text-muted-foreground">
            {formatQty(l.quantity)} {l.item?.unit}
          </span>
          {isByProductLine(l) && (
            <span className="shrink-0 rounded-sm bg-warning-subtle px-1 text-[11px] font-medium text-warning-text">{t('productionRunsTab.byProductBadge')}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

export function ProductionRunsTab({ canEdit, canCancel, onCreate, onOpen, onEdit, onCancel }: ProductionRunsTabProps) {
  const { t } = useTranslation('production');
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
        header: t('productionRunsTab.columns.number'),
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
        header: t('productionRunsTab.columns.date'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'reference',
        header: t('productionRunsTab.columns.reference'),
        meta: { hideBelow: 'xl', cellClassName: 'num font-mono text-xs text-muted-foreground' },
        cell: ({ row }) => row.original.referenceNumber || '—',
      },
      {
        id: 'inputs',
        header: t('productionRunsTab.columns.inputs'),
        meta: { hideBelow: 'lg', cellClassName: 'min-w-40 max-w-64' },
        cell: ({ row }) => <Lines lines={splitRunLines(row.original).inputs} cancelled={row.original.isCancelled} />,
      },
      {
        id: 'outputs',
        header: t('productionRunsTab.columns.outputs'),
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72' },
        cell: ({ row }) => <Lines lines={splitRunLines(row.original).outputs} cancelled={row.original.isCancelled} />,
      },
      {
        id: 'yieldPct',
        header: t('productionRunsTab.columns.yield'),
        enableSorting: true,
        sortDescFirst: true,
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col items-end gap-1">
              <span className={cn(r.isCancelled ? 'text-muted-foreground line-through' : 'font-medium text-foreground')}>
                {r.yieldPct != null ? `${formatNumber(r.yieldPct, { decimals: 1 })}%` : '—'}
              </span>
              {r.isCancelled && <StatusBadge status="Cancelled" docType="production_run" />}
            </div>
          );
        },
      },
      {
        id: 'notes',
        header: t('productionRunsTab.columns.notes'),
        meta: { hideBelow: 'xl', cellClassName: 'max-w-44 truncate text-xs text-muted-foreground' },
        cell: ({ row }) => row.original.notes || '—',
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('productionRunsTab.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <RowActions
              label={t('productionRunsTab.actionsFor', { number: r.runNumber })}
              actions={[
                { label: t('productionRunsTab.actions.view'), icon: Eye, onSelect: () => onOpen(r.id) },
                { label: t('productionRunsTab.actions.edit'), icon: Pencil, hidden: r.isCancelled || !canEdit, onSelect: () => onEdit(r) },
                {
                  label: t('productionRunsTab.actions.cancel'),
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
    [canEdit, canCancel, onOpen, onEdit, onCancel, t],
  );

  return (
    <div className="space-y-5">
      <section aria-label={t('productionRunsTab.kpi.sectionAria')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('productionRunsTab.kpi.runs')}
          icon={Factory}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.activeCount) : '—'}
          hint={summary && summary.cancelledCount > 0 ? t('productionRunsTab.kpi.cancelledHint', { value: formatNumber(summary.cancelledCount) }) : t('productionRunsTab.kpi.postedHint')}
        />
        <StatCard
          label={t('productionRunsTab.kpi.totalInput')}
          icon={Scale}
          loading={kpiLoading}
          value={summary ? `${formatQty(summary.inputQty)}${unit}` : '—'}
          hint={t('productionRunsTab.kpi.totalInputHint')}
        />
        <StatCard
          label={t('productionRunsTab.kpi.totalOutput')}
          icon={Scale}
          loading={kpiLoading}
          value={summary ? `${formatQty(summary.outputQty)}${unit}` : '—'}
          hint={summary && summary.byproductQty > 0 ? t('productionRunsTab.kpi.byProductHint', { value: `${formatQty(summary.byproductQty)}${unit}` }) : t('productionRunsTab.kpi.totalOutputHint')}
        />
        <StatCard
          label={t('productionRunsTab.kpi.avgYield')}
          icon={Percent}
          loading={kpiLoading}
          value={summary?.yieldPct != null ? `${formatNumber(summary.yieldPct, { decimals: 1 })}%` : '—'}
          hint={t('productionRunsTab.kpi.avgYieldHint')}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('productionRunsTab.searchLabel')}
          searchPlaceholder={t('productionRunsTab.searchPlaceholder')}
          status={{ options: statusOptions(RUN_STATUSES, 'production_run'), label: t('productionRunsTab.statusFilter'), allLabel: t('productionRunsTab.allStatuses') }}
          dateRange
        />

        <DataTable
          {...listTableProps(list, total)}
          label={t('productionRunsTab.tableLabel')}
          itemLabel={t('productionRunsTab.itemLabel')}
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
            title: t('productionRunsTab.empty.title'),
            description: t('productionRunsTab.empty.description'),
            action: onCreate ? (
              <Button size="sm" onClick={onCreate}>
                <Plus aria-hidden />
                {t('productionRunsTab.empty.action')}
              </Button>
            ) : undefined,
          }}
        />
      </div>
    </div>
  );
}
