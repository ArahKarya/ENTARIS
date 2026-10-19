/**
 * Physical asset register (/ga/assets); ?asset=<id> opens the detail sheet. Writes need
 * ga_assets edit (same as the server); the documents drawer needs ga_documents view.
 */
import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Boxes, Eye, FileText, Pencil, Plus, QrCode, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { statusOptions } from '@/lib/status';
import { useListState } from '@/hooks/useListState';
import { useTableDensity } from '@/hooks/useTableDensity';
import { Button } from '@/components/ui/button';
import {
  ConfirmDialog,
  DataTable,
  DocumentLink,
  FilterBar,
  PageHeader,
  RowActions,
  StatusBadge,
  listTableProps,
  type Paginated,
} from '@/components/shared';
import { SelectFilter } from '@/components/inventory/filters';
import GaAssetQRModal from '@/components/GaAssetQRModal';
import {
  ASSET_FILTER_KEYS,
  ASSET_STATUSES,
  CONDITION_OPTIONS,
  apiErrorMessage,
  conditionMeta,
  toAssetListParams,
  type AssetRow,
} from '@/components/ga/assets/asset-model';
import { AssetThumb } from '@/components/ga/assets/asset-ui';
import { AssetDetailSheet } from '@/components/ga/assets/AssetDetailSheet';
import { AssetFormSheet } from '@/components/ga/assets/AssetFormSheet';
import { useGaMaster } from '@/components/ga/assets/useGaMaster';
import AssetDocumentsDrawer from './assets/AssetDocumentsDrawer';
import { useTranslation } from 'react-i18next';

const ENDPOINT = '/ga/assets';
const ASSET_PARAM = 'asset';
const FILTER_CLASS = 'w-[calc(50%-0.25rem)] sm:w-44';

export const GaAssetsPage = () => {
  const { t } = useTranslation('eam');
  const statusFilter = useMemo(() => statusOptions(ASSET_STATUSES, 'ga_asset'), []);
  const queryClient = useQueryClient();
  const list = useListState({ filters: ASSET_FILTER_KEYS, defaultSort: { id: 'code', desc: false } });
  const [density, setDensity] = useTableDensity();
  const [searchParams, setSearchParams] = useSearchParams();
  const assetId = searchParams.get(ASSET_PARAM);

  const [lastOpened, setLastOpened] = useState<AssetRow | null>(null);
  const [form, setForm] = useState<{ asset: AssetRow | null } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AssetRow | null>(null);
  const [qrTarget, setQrTarget] = useState<AssetRow | null>(null);
  const [docTarget, setDocTarget] = useState<AssetRow | null>(null);

  const canEdit = can('ga_assets', 'edit');
  const canViewDocs = can('ga_documents', 'view');

  const setAssetParam = useCallback(
    (id: string | null) =>
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (id) next.set(ASSET_PARAM, id);
        else next.delete(ASSET_PARAM);
        return next;
      }),
    [setSearchParams],
  );
  const openAsset = useCallback(
    (asset: AssetRow) => {
      setLastOpened(asset);
      setAssetParam(asset.id);
    },
    [setAssetParam],
  );

  const assetsQuery = useQuery({
    queryKey: ['ga-assets', 'register', list.params],
    queryFn: async () =>
      (await api.get<Paginated<AssetRow>>(ENDPOINT, { params: toAssetListParams(list.params) })).data,
    placeholderData: keepPreviousData,
  });

  const categories = useGaMaster('asset-categories');
  const branches = useGaMaster('branches');
  const categoryOptions = useMemo(
    () => (categories.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    [categories.data],
  );
  const branchOptions = useMemo(() => (branches.data ?? []).map((b) => ({ value: b.id, label: b.name })), [branches.data]);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.post('/ga/assets/bulk/delete', { ids: [id] }),
    onSuccess: (_res, id) => {
      toast.success(t('assets.page.deleted'));
      queryClient.invalidateQueries({ queryKey: ['ga-assets'] }); // prefix: register + per-kind lists
      if (assetId === id) setAssetParam(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, t('assets.page.deleteFailed'))),
  });

  // The QR modal and documents drawer render outside the sheet, so the sheet
  // closes first (a modal sheet would keep them inert).
  const showQr = useCallback(
    (asset: AssetRow) => {
      setAssetParam(null);
      setQrTarget(asset);
    },
    [setAssetParam],
  );
  const showDocs = useCallback(
    (asset: AssetRow) => {
      setAssetParam(null);
      setDocTarget(asset);
    },
    [setAssetParam],
  );

  const columns = useMemo<ColumnDef<AssetRow>[]>(
    () => [
      {
        id: 'photo',
        header: () => <span className="sr-only">{t('assets.page.photo')}</span>,
        meta: { headerClassName: 'w-14', cellClassName: 'w-14 py-1.5' },
        cell: ({ row }) => <AssetThumb filePath={row.original.photos?.[0]?.filePath} alt={t('assets.page.photoAlt', { name: row.original.name })} />,
      },
      {
        id: 'code',
        header: t('assets.page.code'),
        enableSorting: true,
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              <DocumentLink onClick={() => openAsset(a)}>{a.code}</DocumentLink>
              {/* Mobile: name + category stacked here because their columns are hidden. */}
              <span className="line-clamp-2 max-w-44 whitespace-normal text-sm font-medium break-words text-foreground sm:hidden">{a.name}</span>
              <span className="text-xs text-muted-foreground md:hidden">{a.category?.name ?? '—'}</span>
              <StatusBadge status={a.status} docType="ga_asset" className="mt-0.5 sm:hidden" />
            </div>
          );
        },
      },
      {
        id: 'name',
        header: t('assets.page.name'),
        enableSorting: true,
        meta: { hideBelow: 'sm', cellClassName: 'min-w-44 max-w-80' },
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-1.5 font-medium text-foreground">
                <span className="break-words">{a.name}</span>
                {a.fixedAsset && (
                  <StatusBadge
                    tone="info"
                    dot={false}
                    label={t('assets.page.fixedAsset')}
                    className="text-[11px]"
                  />
                )}
              </p>
              {(a.location || a.serialNumber) && (
                <p className="truncate text-xs text-muted-foreground group-data-[density=compact]/table:hidden">
                  {[a.location, a.serialNumber && `SN ${a.serialNumber}`].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          );
        },
      },
      {
        id: 'category',
        header: t('assets.page.category'),
        meta: { hideBelow: 'md', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => row.original.category?.name ?? '—',
      },
      {
        id: 'branch',
        header: t('assets.page.branch'),
        meta: { hideBelow: 'lg', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => row.original.branch?.name ?? '—',
      },
      {
        id: 'condition',
        header: t('assets.page.condition'),
        enableSorting: true,
        meta: { hideBelow: 'md' },
        cell: ({ row }) => {
          const c = conditionMeta(row.original.condition);
          return <StatusBadge label={c.label} tone={c.tone} dot={false} />;
        },
      },
      {
        id: 'status',
        header: t('shared.status'),
        enableSorting: true,
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="ga_asset" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const a = row.original;
          return (
            <RowActions
              label={t('shared.actionsFor', { name: a.code })}
              actions={[
                { label: t('assets.page.viewDetail'), icon: Eye, onSelect: () => openAsset(a) },
                { label: t('assets.page.qr'), icon: QrCode, onSelect: () => setQrTarget(a) },
                { label: t('assets.page.documents'), icon: FileText, hidden: !canViewDocs, onSelect: () => setDocTarget(a) },
                { label: t('shared.edit'), icon: Pencil, hidden: !canEdit, onSelect: () => setForm({ asset: a }) },
                { label: t('shared.delete'), icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(a) },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, canViewDocs, openAsset, t],
  );

  const rows = assetsQuery.data?.data;
  const fallback = rows?.find((r) => r.id === assetId) ?? lastOpened;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('assets.page.title')}
        description={t('assets.page.description')}
        actions={
          canEdit && (
            <Button onClick={() => setForm({ asset: null })}>
              <Plus aria-hidden />
              {t('assets.page.add')}
            </Button>
          )
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel={t('assets.page.searchLabel')}
          searchPlaceholder={t('assets.page.searchPlaceholder')}
          status={{ options: statusFilter }}
        >
          {!categories.isError && (
            <SelectFilter
              label={t('assets.page.categoryFilter')}
              allLabel={t('assets.page.allCategories')}
              value={list.filters.categoryId}
              onChange={(v) => list.setFilter('categoryId', v)}
              options={categoryOptions}
              className={FILTER_CLASS}
            />
          )}
          <SelectFilter
            label={t('assets.page.conditionFilter')}
            allLabel={t('assets.page.allConditions')}
            value={list.filters.condition}
            onChange={(v) => list.setFilter('condition', v)}
            options={CONDITION_OPTIONS}
            className={FILTER_CLASS}
          />
          {!branches.isError && (
            <SelectFilter
              label={t('assets.page.branchFilter')}
              allLabel={t('assets.page.allBranches')}
              value={list.filters.branchId}
              onChange={(v) => list.setFilter('branchId', v)}
              options={branchOptions}
              className={FILTER_CLASS}
            />
          )}
        </FilterBar>

        <DataTable
          {...listTableProps(list, assetsQuery.data?.total)}
          label={t('assets.page.tableLabel')}
          itemLabel={t('assets.page.itemLabel')}
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          loading={assetsQuery.isLoading}
          fetching={assetsQuery.isFetching && assetsQuery.isPlaceholderData}
          error={assetsQuery.error}
          onRetry={() => assetsQuery.refetch()}
          onRowClick={openAsset}
          rowClassName={(row) => (row.status === 'RETIRED' || row.status === 'LOST' ? 'text-muted-foreground' : undefined)}
          density={density}
          onDensityChange={setDensity}
          empty={{
            title: t('assets.page.emptyTitle'),
            description: t('assets.page.emptyDescription'),
            action: canEdit ? (
              <Button size="sm" onClick={() => setForm({ asset: null })}>
                <Boxes aria-hidden />
                {t('assets.page.addFirst')}
              </Button>
            ) : undefined,
          }}
        />
      </div>

      <AssetDetailSheet
        assetId={assetId}
        fallback={fallback}
        onClose={() => setAssetParam(null)}
        onQr={showQr}
        onDocuments={canViewDocs ? showDocs : undefined}
        onEdit={
          canEdit
            ? (a) => {
                setAssetParam(null);
                setForm({ asset: a });
              }
            : undefined
        }
        onDelete={canEdit ? (a) => setDeleteTarget(a) : undefined}
      />

      {form && <AssetFormSheet key={form.asset?.id ?? 'new'} asset={form.asset} onClose={() => setForm(null)} />}

      <GaAssetQRModal isOpen={qrTarget !== null} onClose={() => setQrTarget(null)} asset={qrTarget} />

      {docTarget && (
        <AssetDocumentsDrawer
          assetId={docTarget.id}
          assetCode={docTarget.code}
          assetName={docTarget.name}
          onClose={() => setDocTarget(null)}
        />
      )}

      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        tone="danger"
        title={t('assets.page.deleteTitle')}
        description={t('assets.page.deleteDescription', { code: deleteTarget?.code ?? '', name: deleteTarget?.name ?? '' })}
        confirmLabel={t('shared.confirmDelete')}
        loading={deleteMutation.isPending}
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteMutation.mutateAsync(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
};
