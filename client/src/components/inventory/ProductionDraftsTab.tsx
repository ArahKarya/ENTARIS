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
import api from '@/lib/api';
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
const STATUS_FILTER = [
  { value: 'Draft', label: 'Draft' },
  { value: 'PendingApproval', label: 'Menunggu persetujuan' },
  { value: 'Posted', label: 'Diposting' },
];

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
        header: 'Nomor draft',
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
        header: 'Tanggal',
        meta: { hideBelow: 'md', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.date),
      },
      {
        id: 'summary',
        header: 'Ringkasan',
        meta: { hideBelow: 'sm', cellClassName: 'min-w-40 max-w-72 text-xs' },
        cell: ({ row }) => {
          const s = row.original.summary;
          if (!s) return <span className="text-muted-foreground">-</span>;
          return (
            <div className="space-y-0.5">
              <div className="truncate font-medium text-foreground">{s.mainOutput ?? '-'}</div>
              <div className="num text-muted-foreground">
                Input {formatQty(s.inputQty)} → Output {formatQty(s.outputQty)}
              </div>
            </div>
          );
        },
      },
      {
        id: 'createdBy',
        header: 'Dibuat oleh',
        meta: { hideBelow: 'lg', cellClassName: 'text-xs text-muted-foreground' },
        cell: ({ row }) => row.original.createdBy?.fullName ?? '-',
      },
      {
        id: 'status',
        header: 'Status',
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
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const d = row.original;
          const editable = d.status === 'Draft' && canEdit && canManage(d);
          return (
            <RowActions
              label={`Aksi untuk ${d.draftNumber}`}
              actions={[
                { label: 'Edit draft', icon: Pencil, hidden: !editable, onSelect: () => onEdit(d) },
                { label: 'Posting', icon: Send, hidden: !editable, onSelect: () => onPost(d) },
                {
                  label: 'Lihat proses produksi',
                  icon: Eye,
                  hidden: d.status !== 'Posted' || !d.postedRunId,
                  onSelect: () => d.postedRunId && onOpenRun(d.postedRunId),
                },
                { label: 'Hapus draft', icon: Trash2, tone: 'danger', hidden: !editable, onSelect: () => onDelete(d) },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, canManage, openRow, onEdit, onPost, onDelete, onOpenRun],
  );

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Draft belum memengaruhi stok, jurnal, HPP, laporan, maupun OEE. Efek baru terjadi setelah draft diposting.
      </p>
      <FilterBar
        list={list}
        searchLabel="Cari draft produksi"
        searchPlaceholder="Cari nomor draft, catatan"
        status={{ options: STATUS_FILTER, label: 'Status draft', allLabel: 'Semua status' }}
        dateRange
      />
      <DataTable
        {...listTableProps(list, draftsQuery.data?.total)}
        label="Daftar draft proses produksi"
        itemLabel="draft"
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
          title: 'Belum ada draft produksi',
          description: 'Input produksi disimpan sebagai draft lebih dulu, lalu diposting setelah dicek.',
          action: onCreate ? (
            <Button size="sm" onClick={onCreate}>
              <Plus aria-hidden />
              Buat draft produksi
            </Button>
          ) : undefined,
        }}
      />
    </div>
  );
}
