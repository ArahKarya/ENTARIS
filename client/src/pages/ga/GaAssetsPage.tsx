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

const ENDPOINT = '/ga/assets';
const ASSET_PARAM = 'asset';
const STATUS_FILTER = statusOptions(ASSET_STATUSES, 'ga_asset');
const FILTER_CLASS = 'w-[calc(50%-0.25rem)] sm:w-44';

export const GaAssetsPage = () => {
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
      toast.success('Aset dihapus.');
      queryClient.invalidateQueries({ queryKey: ['ga-assets'] }); // prefix: register + per-kind lists
      if (assetId === id) setAssetParam(null);
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menghapus aset.')),
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
        header: () => <span className="sr-only">Foto</span>,
        meta: { headerClassName: 'w-14', cellClassName: 'w-14 py-1.5' },
        cell: ({ row }) => <AssetThumb filePath={row.original.photos?.[0]?.filePath} alt={`Foto ${row.original.name}`} />,
      },
      {
        id: 'code',
        header: 'Kode',
        enableSorting: true,
        meta: { cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const a = row.original;
          return (
            <div className="flex min-w-0 flex-col items-start gap-0.5">
              <DocumentLink onClick={() => openAsset(a)}>{a.code}</DocumentLink>
              {/* Mobile: name + category stacked here because their columns are hidden. */}
              <span className="line-clamp-2 max-w-44 whitespace-normal text-sm font-medium break-words text-foreground sm:hidden">{a.name}</span>
              <span className="text-xs text-muted-foreground md:hidden">{a.category?.name ?? '-'}</span>
              <StatusBadge status={a.status} docType="ga_asset" className="mt-0.5 sm:hidden" />
            </div>
          );
        },
      },
      {
        id: 'name',
        header: 'Nama Aset',
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
                    label="Aset Tetap"
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
        header: 'Kategori',
        meta: { hideBelow: 'md', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => row.original.category?.name ?? '-',
      },
      {
        id: 'branch',
        header: 'Cabang',
        meta: { hideBelow: 'lg', cellClassName: 'text-muted-foreground' },
        cell: ({ row }) => row.original.branch?.name ?? '-',
      },
      {
        id: 'condition',
        header: 'Kondisi',
        enableSorting: true,
        meta: { hideBelow: 'md' },
        cell: ({ row }) => {
          const c = conditionMeta(row.original.condition);
          return <StatusBadge label={c.label} tone={c.tone} dot={false} />;
        },
      },
      {
        id: 'status',
        header: 'Status',
        enableSorting: true,
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="ga_asset" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const a = row.original;
          return (
            <RowActions
              label={`Aksi untuk ${a.code}`}
              actions={[
                { label: 'Lihat detail', icon: Eye, onSelect: () => openAsset(a) },
                { label: 'QR aset', icon: QrCode, onSelect: () => setQrTarget(a) },
                { label: 'Dokumen', icon: FileText, hidden: !canViewDocs, onSelect: () => setDocTarget(a) },
                { label: 'Edit', icon: Pencil, hidden: !canEdit, onSelect: () => setForm({ asset: a }) },
                { label: 'Hapus', icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(a) },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, canViewDocs, openAsset],
  );

  const rows = assetsQuery.data?.data;
  const fallback = rows?.find((r) => r.id === assetId) ?? lastOpened;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Daftar Aset"
        description="Registri aset fisik perusahaan beserta foto, QR, dokumen, status, dan kondisinya."
        actions={
          canEdit && (
            <Button onClick={() => setForm({ asset: null })}>
              <Plus aria-hidden />
              Tambah Aset
            </Button>
          )
        }
      />

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari aset"
          searchPlaceholder="Cari kode, nama, seri, lokasi"
          status={{ options: STATUS_FILTER }}
        >
          {!categories.isError && (
            <SelectFilter
              label="Filter kategori"
              allLabel="Semua kategori"
              value={list.filters.categoryId}
              onChange={(v) => list.setFilter('categoryId', v)}
              options={categoryOptions}
              className={FILTER_CLASS}
            />
          )}
          <SelectFilter
            label="Filter kondisi"
            allLabel="Semua kondisi"
            value={list.filters.condition}
            onChange={(v) => list.setFilter('condition', v)}
            options={CONDITION_OPTIONS}
            className={FILTER_CLASS}
          />
          {!branches.isError && (
            <SelectFilter
              label="Filter cabang"
              allLabel="Semua cabang"
              value={list.filters.branchId}
              onChange={(v) => list.setFilter('branchId', v)}
              options={branchOptions}
              className={FILTER_CLASS}
            />
          )}
        </FilterBar>

        <DataTable
          {...listTableProps(list, assetsQuery.data?.total)}
          label="Daftar aset"
          itemLabel="aset"
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
            title: 'Belum ada aset',
            description: 'Daftarkan aset fisik perusahaan (kendaraan, gedung, peralatan, perangkat IT) beserta foto dan QR-nya.',
            action: canEdit ? (
              <Button size="sm" onClick={() => setForm({ asset: null })}>
                <Boxes aria-hidden />
                Tambah aset pertama
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
        title="Hapus aset?"
        description={`Hapus aset ${deleteTarget?.code ?? ''} · ${deleteTarget?.name ?? ''}? Foto dan QR-nya ikut terhapus. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel="Ya, hapus"
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
