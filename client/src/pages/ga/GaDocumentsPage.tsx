/**
 * Legal documents and certificates (/ga/documents) with versioned PDFs; `expiryState` is derived
 * server-side. ?doc=<id> opens the version history. Writes need ga_documents edit.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertTriangle, CheckCircle2, Clock, Download, Eye, FileText, FileUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatNumber } from '@/lib/format';
import { statusOptions } from '@/lib/status';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ComboboxFilter,
  ConfirmDialog,
  DataTable,
  DocumentLink,
  FilterBar,
  PageHeader,
  RowActions,
  StatCard,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import { SelectFilter } from '@/components/inventory/filters';
import { ExpiryDate } from '@/components/ga/documents/ExpiryDate';
import { GaDocumentDetailSheet } from '@/components/ga/documents/GaDocumentDetailSheet';
import { GaDocumentFormSheet } from '@/components/ga/documents/GaDocumentFormSheet';
import { UploadVersionDialog } from '@/components/ga/documents/UploadVersionDialog';
import { useTranslation } from 'react-i18next';
import {
  DOCUMENTS_ENDPOINT,
  DOC_FILTER_KEYS,
  DOC_PARAM,
  DOC_STATUSES,
  EXPIRY_FILTER,
  EXPIRING_SOON_DAYS,
  GA_DOCUMENTS_KEY,
  downloadVersion,
  errorMessage,
  type GaAssetOption,
  type GaDocTypeOption,
  type GaDocumentRow,
  type GaDocumentSummary,
} from '@/components/ga/documents/ga-document-model';

const FILTER_CLASS = 'w-[calc(50%-0.25rem)] sm:w-48';

export const GaDocumentsPage = () => {
  const { t } = useTranslation('eam');
  const statusFilter = useMemo(() => statusOptions(DOC_STATUSES, 'ga_document'), []);
  const queryClient = useQueryClient();
  const list = useListState({ filters: DOC_FILTER_KEYS, defaultSort: { id: 'expiryDate', desc: false } });
  const [density, setDensity] = useTableDensity();
  const [searchParams, setSearchParams] = useSearchParams();
  const canEdit = can('ga_documents', 'edit');

  const [formTarget, setFormTarget] = useState<{ doc: GaDocumentRow | null } | null>(null);
  const [uploadTarget, setUploadTarget] = useState<GaDocumentRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<GaDocumentRow | null>(null);

  // Detail sheet lives in the URL (?doc=<id>) so it can be linked and survives refresh.
  const openDocId = searchParams.get(DOC_PARAM);
  const setOpenDoc = useCallback(
    (id: string | null) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set(DOC_PARAM, id);
        else next.delete(DOC_PARAM);
        return next;
      }),
    [setSearchParams],
  );

  const { data: docTypes = [] } = useQuery({
    queryKey: ['ga-document-types'],
    queryFn: async () => (await api.get<GaDocTypeOption[]>('/ga/master/document-types')).data,
    staleTime: 5 * 60_000,
  });

  const assetsQuery = useQuery({
    queryKey: ['ga-assets-options'],
    queryFn: async () => {
      const res = await api.get('/ga/assets', { params: { limit: 500 } });
      return (Array.isArray(res.data) ? res.data : res.data?.data ?? []) as GaAssetOption[];
    },
    staleTime: 5 * 60_000,
  });
  const assets = useMemo(() => assetsQuery.data ?? [], [assetsQuery.data]);

  const docsQuery = useQuery({
    queryKey: [GA_DOCUMENTS_KEY, 'list', list.params],
    queryFn: async () => (await api.get<Paginated<GaDocumentRow>>(DOCUMENTS_ENDPOINT, { params: list.params })).data,
    placeholderData: keepPreviousData,
  });

  const summaryQuery = useQuery({
    queryKey: [GA_DOCUMENTS_KEY, 'summary', list.filterParams],
    queryFn: async () =>
      (await api.get<GaDocumentSummary>(`${DOCUMENTS_ENDPOINT}/summary`, { params: list.filterParams })).data,
    placeholderData: keepPreviousData,
  });

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: [GA_DOCUMENTS_KEY] });
    // Documents linked to an asset also show in the asset documents drawer.
    queryClient.invalidateQueries({ queryKey: ['ga-asset-documents'] });
  }, [queryClient]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`${DOCUMENTS_ENDPOINT}/${id}`),
    onSuccess: (_res, id) => {
      toast.success(t('gaDocuments.page.deleted'));
      if (openDocId === id) setOpenDoc(null);
      invalidate();
    },
    onError: (err: unknown) => toast.error(errorMessage(err, t('gaDocuments.page.deleteFailed'))),
  });

  const typeOptions = useMemo(() => docTypes.map((dt) => ({ value: dt.id, label: dt.name })), [docTypes]);
  const assetOptions = useMemo(() => assets.map((a) => ({ value: a.id, label: a.name, hint: a.code })), [assets]);

  const columns = useMemo<ColumnDef<GaDocumentRow>[]>(
    () => [
      {
        id: 'code',
        header: t('gaDocuments.page.code'),
        enableSorting: true,
        cell: ({ row }) => {
          const d = row.original;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <DocumentLink onClick={() => setOpenDoc(d.id)}>{d.code}</DocumentLink>
              {/* Mobile: title + expiry marker stacked here because their columns are hidden. */}
              <span className="line-clamp-2 max-w-48 text-sm font-medium break-words text-foreground sm:hidden">{d.title}</span>
              <span className="max-w-48 truncate text-xs text-muted-foreground lg:hidden">{d.type?.name ?? '—'}</span>
              <ExpiryDate date={d.expiryDate} state={d.expiryState} markerOnly className="md:hidden" />
            </div>
          );
        },
      },
      {
        id: 'title',
        header: t('gaDocuments.page.title'),
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-44 max-w-80' },
        cell: ({ row }) => {
          const d = row.original;
          return (
            <div className="min-w-0">
              <p className="line-clamp-2 font-medium break-words text-foreground">{d.title}</p>
              {(d.issuedNumber || d.issuedBy) && (
                <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                  {[d.issuedNumber, d.issuedBy].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: 'type',
        header: t('gaDocuments.page.type'),
        meta: { hideBelow: 'lg', cellClassName: 'max-w-48 text-muted-foreground' },
        cell: ({ row }) => row.original.type?.name ?? '—',
      },
      {
        id: 'asset',
        header: t('gaDocuments.page.asset'),
        meta: { hideBelow: 'xl', cellClassName: 'max-w-52' },
        cell: ({ row }) => {
          const a = row.original.asset;
          if (!a) return <span className="text-muted-foreground">—</span>;
          return (
            <div className="min-w-0 text-sm">
              <p className="truncate text-foreground">{a.name}</p>
              <p className="num truncate font-mono text-xs text-muted-foreground">{a.code}</p>
            </div>
          );
        },
      },
      {
        id: 'expiryDate',
        header: t('gaDocuments.page.validity'),
        enableSorting: true,
        meta: { hideBelow: 'md' },
        cell: ({ row }) => <ExpiryDate date={row.original.expiryDate} state={row.original.expiryState} />,
      },
      {
        id: 'version',
        header: t('gaDocuments.page.version'),
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => {
          const v = row.original.versions?.[0];
          return v ? `v${v.versionNo}` : <span className="text-xs">{t('gaDocuments.page.noFile')}</span>;
        },
      },
      {
        id: 'status',
        header: t('shared.status'),
        meta: { align: 'right' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="ga_document" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const d = row.original;
          const latest = d.versions?.[0];
          return (
            <RowActions
              label={t('shared.actionsFor', { name: d.code })}
              actions={[
                { label: t('gaDocuments.page.viewDetail'), icon: Eye, onSelect: () => setOpenDoc(d.id) },
                {
                  label: latest ? t('gaDocuments.page.downloadLatestVersion', { version: latest.versionNo }) : t('gaDocuments.page.downloadLatest'),
                  icon: Download,
                  hidden: !latest,
                  onSelect: () => latest && downloadVersion(d, latest),
                },
                { label: t('gaDocuments.page.uploadVersion'), icon: FileUp, hidden: !canEdit, onSelect: () => setUploadTarget(d) },
                { label: t('gaDocuments.page.edit'), icon: Pencil, hidden: !canEdit, onSelect: () => setFormTarget({ doc: d }) },
                { label: t('gaDocuments.page.delete'), icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(d) },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, setOpenDoc, t],
  );

  const summary = summaryQuery.data;
  const kpiLoading = !summary && !summaryQuery.isError;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('gaDocuments.page.pageTitle')}
        description={t('gaDocuments.page.description')}
        actions={
          canEdit && (
            <Button onClick={() => setFormTarget({ doc: null })}>
              <Plus aria-hidden />
              {t('gaDocuments.page.new')}
            </Button>
          )
        }
      />

      <section aria-label={t('gaDocuments.page.summaryLabel')} className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={t('gaDocuments.page.kpiCount')}
          icon={FileText}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.count) : '—'}
          hint={t('gaDocuments.page.kpiCountHint')}
        />
        <StatCard
          label={t('gaDocuments.page.kpiExpired')}
          icon={AlertTriangle}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.expiredCount) : '—'}
          hint={t('gaDocuments.page.kpiExpiredHint')}
        />
        <StatCard
          label={t('gaDocuments.page.kpiExpiring')}
          icon={Clock}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.expiringCount) : '—'}
          hint={t('gaDocuments.page.kpiExpiringHint', { days: EXPIRING_SOON_DAYS })}
        />
        <StatCard
          label={t('gaDocuments.page.kpiValid')}
          icon={CheckCircle2}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.validCount) : '—'}
          hint={t('gaDocuments.page.kpiValidHint')}
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('gaDocuments.page.searchLabel')}
          searchPlaceholder={t('gaDocuments.page.searchPlaceholder')}
          status={{ options: statusFilter }}
        >
          <SelectFilter
            label={t('gaDocuments.page.expiryFilter')}
            allLabel={t('gaDocuments.page.allExpiry')}
            options={EXPIRY_FILTER}
            value={list.filters.expiry}
            onChange={(v) => list.setFilter('expiry', v)}
            className={FILTER_CLASS}
          />
          <SelectFilter
            label={t('gaDocuments.page.typeFilter')}
            allLabel={t('gaDocuments.page.allTypes')}
            options={typeOptions}
            value={list.filters.typeId}
            onChange={(v) => list.setFilter('typeId', v)}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label={t('gaDocuments.page.assetFilter')}
            allLabel={t('gaDocuments.page.allAssets')}
            searchPlaceholder={t('gaDocuments.page.assetSearch')}
            value={list.filters.assetId}
            onChange={(v) => list.setFilter('assetId', v)}
            options={assetOptions}
            loading={assetsQuery.isLoading}
            className={FILTER_CLASS}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, docsQuery.data?.total)}
          label={t('gaDocuments.page.tableLabel')}
          itemLabel={t('gaDocuments.page.itemLabel')}
          columns={columns}
          data={docsQuery.data?.data}
          getRowId={(row) => row.id}
          loading={docsQuery.isLoading}
          fetching={docsQuery.isFetching && docsQuery.isPlaceholderData}
          error={docsQuery.error}
          onRetry={() => docsQuery.refetch()}
          onRowClick={(row) => setOpenDoc(row.id)}
          rowClassName={(row) => (row.status === 'REVOKED' || row.status === 'ARCHIVED' ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('gaDocuments.page.emptyTitle'),
            description: t('gaDocuments.page.emptyDescription'),
            action: canEdit ? (
              <Button size="sm" onClick={() => setFormTarget({ doc: null })}>
                <Plus aria-hidden />
                {t('gaDocuments.page.addFirst')}
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <GaDocumentDetailSheet
        docId={openDocId}
        onClose={() => setOpenDoc(null)}
        onEdit={canEdit ? (doc) => setFormTarget({ doc }) : undefined}
        onUpload={canEdit ? (doc) => setUploadTarget(doc) : undefined}
        onDelete={canEdit ? (doc) => setDeleteTarget(doc) : undefined}
      />

      {canEdit && formTarget && (
        <GaDocumentFormSheet
          key={formTarget.doc?.id ?? 'new'}
          doc={formTarget.doc}
          docTypes={docTypes}
          assets={assets}
          onClose={() => setFormTarget(null)}
          onSaved={invalidate}
        />
      )}

      <UploadVersionDialog doc={canEdit ? uploadTarget : null} onClose={() => setUploadTarget(null)} onUploaded={invalidate} />

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('gaDocuments.page.deleteTitle')}
        description={t('gaDocuments.page.deleteDescription', { code: deleteTarget?.code ?? '', title: deleteTarget?.title ?? '' })}
        confirmLabel={t('shared.confirmDelete')}
        tone="danger"
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteMutation.mutateAsync(deleteTarget.id).catch(() => undefined);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
