/**
 * Stok & Produksi → Proses Produksi → "Draft" (?tab=production&view=draft).
 * Draft proses produksi: tersimpan tanpa efek stok / jurnal / HPP / OEE sampai
 * diposting. List-kit page over /inventory/production-runs/drafts. Row actions
 * (Edit, Posting, Hapus) are owned by the page (modal + confirm dialogs).
 */
import { useCallback, useMemo } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Eye, Pencil, Plus, Send, Trash2, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import api from '@/lib/api';
import { statusOptions } from '@/lib/status';
import { formatDate } from '@/lib/format';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  DataTable,
  DocumentLink,
  FilterBar,
  RowActions,
  StatusBadge,
  listTableProps,
} from '@/components/shared';
import {
  PRODUCTION_FILTER_KEYS,
  formatQty,
  type ProductionDraftList,
  type ProductionDraftRow,
} from './inventory-rows';

export const PRODUCTION_DRAFTS_ENDPOINT = '/inventory/production-runs/drafts';
const DRAFT_STATUSES = ['Draft', 'PendingApproval', 'Posted'] as const;

interface ProductionDraftsTabProps {
  canEdit: boolean;
  /** Posting / edit / hapus hanya untuk pembuat draft atau pemegang approval.bypass. */
  canManage: (draft: ProductionDraftRow) => boolean;
  onCreate?: () => void;
  onEdit: (draft: ProductionDraftRow) => void;
  onPost: (draft: ProductionDraftRow) => void;
  onDelete: (draft: ProductionDraftRow) => void;
  onOpenRun: (runId: string) => void;
}

export function ProductionDraftsTab({ canEdit, canManage, onCreate, onEdit, onPost, onDelete, onOpenRun }: ProductionDraftsTabProps) {
  const { t } = useTranslation('production');
  const list = useListState({ filters: PRODUCTION_FILTER_KEYS, defaultSort: { id: 'date', desc: true } });
  const [density, setDensity] = useTableDensity();

  const draftsQuery = useQuery({
    queryKey: ['production-runs', 'drafts', list.params],
    queryFn: async () => (await api.get<ProductionDraftList>(PRODUCTION_DRAFTS_ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const openRow = useCallback(
    (d: ProductionDraftRow) => {
      if (d.status === 'Draft' && canEdit && canManage(d)) onEdit(d);
      else if (d.status === 'Posted' && d.postedRunId) onOpenRun(d.postedRunId);
    },
    [canEdit, canManage, onEdit, onOpenRun],
  );

  const columns = useMemo<ColumnDef<ProductionDraftRow>[]>(
    () => [
      {
        id: 'draftNumber',
        header: t('productionDraftsTab.columns.draftNumber'),
        cell: ({ row }) => {
          const d = row.original;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <DocumentLink onClick={() => openRow(d)}>{d.draftNumber}</DocumentLink>
              <span className="num text-xs text-muted-foreground md:hidden">{formatDate(d.date)}</span>
              {d.lastError && (
                <span className="flex max-w-56 items-start gap-1 text-xs break-words text-danger-text">
                  <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                  <span className="line-clamp-2">{d.lastError}</span>
                </span>
              )}
            </div>
          );
        },
      },
      {
        id: 'date',
        header: t('productionDraftsTab.columns.date'),
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'summary',
        header: t('productionDraftsTab.columns.summary'),
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72 text-xs' },
        cell: ({ row }) => {
          const s = row.original.summary;
          if (!s) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="space-y-0.5">
              <div className="truncate font-medium text-foreground">{s.mainOutput ?? '—'}</div>
              <div className="num text-muted-foreground">
                {t('productionDraftsTab.summaryLine', { input: formatQty(s.inputQty), output: formatQty(s.outputQty) })}
              </div>
            </div>
          );
        },
      },
      {
        id: 'createdBy',
        header: t('productionDraftsTab.columns.createdBy'),
        meta: { hideBelow: 'lg', cellClassName: 'text-xs text-muted-foreground' },
        cell: ({ row }) => row.original.createdBy?.fullName ?? '—',
      },
      {
        id: 'status',
        header: t('productionDraftsTab.columns.status'),
        cell: ({ row }) => {
          const d = row.original;
          return (
            <div className="flex flex-col items-start gap-1">
              <StatusBadge status={d.status} docType="production_draft" />
              {d.status === 'Posted' && d.postedRunNumber && (
                <span className="num text-xs text-muted-foreground">{d.postedRunNumber}</span>
              )}
            </div>
          );
        },
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('productionDraftsTab.columns.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-32', cellClassName: 'w-32 py-0' },
        cell: ({ row }) => {
          const d = row.original;
          const editable = d.status === 'Draft' && canEdit && canManage(d);
          return (
            <div className="flex items-center justify-end gap-1">
              {editable && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => {
                    e.stopPropagation();
                    onPost(d);
                  }}
                  aria-label={t('productionDraftsTab.postNow', { number: d.draftNumber })}
                >
                  <Send className="h-3.5 w-3.5" />
                  {t('productionDraftsTab.actions.post')}
                </Button>
              )}
            <RowActions
              label={t('productionDraftsTab.actionsFor', { number: d.draftNumber })}
              actions={[
                { label: t('productionDraftsTab.actions.edit'), icon: Pencil, hidden: !editable, onSelect: () => onEdit(d) },
                {
                  label: t('productionDraftsTab.actions.viewRun'),
                  icon: Eye,
                  hidden: d.status !== 'Posted' || !d.postedRunId,
                  onSelect: () => d.postedRunId && onOpenRun(d.postedRunId),
                },
                { label: t('productionDraftsTab.actions.delete'), icon: Trash2, tone: 'danger', hidden: !editable, onSelect: () => onDelete(d) },
              ]}
            />
            </div>
          );
        },
      },
    ],
    [canEdit, canManage, openRow, onEdit, onPost, onDelete, onOpenRun, t],
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t('productionDraftsTab.info')}
      </p>
      <FilterBar
        list={list}
        searchLabel={t('productionDraftsTab.searchLabel')}
        searchPlaceholder={t('productionDraftsTab.searchPlaceholder')}
        status={{ options: statusOptions(DRAFT_STATUSES, 'production_draft'), label: t('productionDraftsTab.statusFilter'), allLabel: t('productionDraftsTab.allStatuses') }}
        dateRange
      />
      <DataTable
        {...listTableProps(list, draftsQuery.data?.total)}
        label={t('productionDraftsTab.tableLabel')}
        itemLabel={t('productionDraftsTab.itemLabel')}
        columns={columns}
        data={draftsQuery.data?.data}
        getRowId={(row) => row.id}
        loading={draftsQuery.isLoading}
        fetching={draftsQuery.isFetching && draftsQuery.isPlaceholderData}
        error={draftsQuery.error}
        onRetry={() => draftsQuery.refetch()}
        onRowClick={openRow}
        density={density}
        onDensityChange={setDensity}
        empty={{
          title: t('productionDraftsTab.empty.title'),
          description: t('productionDraftsTab.empty.description'),
          action: onCreate ? (
            <Button size="sm" onClick={onCreate}>
              <Plus aria-hidden />
              {t('productionDraftsTab.empty.action')}
            </Button>
          ) : undefined,
        }}
      />
    </div>
  );
}
