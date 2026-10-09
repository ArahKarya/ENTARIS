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

const STATUS_FILTER = statusOptions(DOC_STATUSES, 'ga_document');
const FILTER_CLASS = 'w-[calc(50%-0.25rem)] sm:w-48';

export const GaDocumentsPage = () => {
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
      toast.success('Dokumen dihapus.');
      if (openDocId === id) setOpenDoc(null);
      invalidate();
    },
    onError: (err: unknown) => toast.error(errorMessage(err, 'Gagal menghapus dokumen.')),
  });

  const typeOptions = useMemo(() => docTypes.map((t) => ({ value: t.id, label: t.name })), [docTypes]);
  const assetOptions = useMemo(() => assets.map((a) => ({ value: a.id, label: a.name, hint: a.code })), [assets]);

  const columns = useMemo<ColumnDef<GaDocumentRow>[]>(
    () => [
      {
        id: 'code',
        header: 'Kode',
        enableSorting: true,
        cell: ({ row }) => {
          const d = row.original;
          return (
            <div className="flex flex-col items-start gap-0.5">
              <DocumentLink onClick={() => setOpenDoc(d.id)}>{d.code}</DocumentLink>
              {/* Mobile: title + expiry marker stacked here because their columns are hidden. */}
              <span className="line-clamp-2 max-w-48 text-sm font-medium break-words text-foreground sm:hidden">{d.title}</span>
              <span className="max-w-48 truncate text-xs text-muted-foreground lg:hidden">{d.type?.name ?? '-'}</span>
              <ExpiryDate date={d.expiryDate} state={d.expiryState} markerOnly className="md:hidden" />
            </div>
          );
        },
      },
      {
        id: 'title',
        header: 'Judul',
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
        header: 'Jenis',
        meta: { hideBelow: 'lg', cellClassName: 'max-w-48 text-muted-foreground' },
        cell: ({ row }) => row.original.type?.name ?? '-',
      },
      {
        id: 'asset',
        header: 'Aset Terkait',
        meta: { hideBelow: 'xl', cellClassName: 'max-w-52' },
        cell: ({ row }) => {
          const a = row.original.asset;
          if (!a) return <span className="text-muted-foreground">-</span>;
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
        header: 'Masa Berlaku',
        enableSorting: true,
        meta: { hideBelow: 'md' },
        cell: ({ row }) => <ExpiryDate date={row.original.expiryDate} state={row.original.expiryState} />,
      },
      {
        id: 'version',
        header: 'Versi',
        meta: { hideBelow: 'lg', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => {
          const v = row.original.versions?.[0];
          return v ? `v${v.versionNo}` : <span className="text-xs">Belum ada file</span>;
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { align: 'right' },
        cell: ({ row }) => <StatusBadge status={row.original.status} docType="ga_document" />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => {
          const d = row.original;
          const latest = d.versions?.[0];
          return (
            <RowActions
              label={`Aksi untuk ${d.code}`}
              actions={[
                { label: 'Lihat detail & versi', icon: Eye, onSelect: () => setOpenDoc(d.id) },
                {
                  label: latest ? `Unduh versi terbaru (v${latest.versionNo})` : 'Unduh versi terbaru',
                  icon: Download,
                  hidden: !latest,
                  onSelect: () => latest && downloadVersion(d, latest),
                },
                { label: 'Unggah versi baru', icon: FileUp, hidden: !canEdit, onSelect: () => setUploadTarget(d) },
                { label: 'Edit dokumen', icon: Pencil, hidden: !canEdit, onSelect: () => setFormTarget({ doc: d }) },
                { label: 'Hapus dokumen', icon: Trash2, tone: 'danger', hidden: !canEdit, onSelect: () => setDeleteTarget(d) },
              ]}
            />
          );
        },
      },
    ],
    [canEdit, setOpenDoc],
  );

  const summary = summaryQuery.data;
  const kpiLoading = !summary && !summaryQuery.isError;

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Dokumen & Sertifikat"
        description="Dokumen legal dan sertifikat beserta riwayat versi dan masa berlakunya."
        actions={
          canEdit && (
            <Button onClick={() => setFormTarget({ doc: null })}>
              <Plus aria-hidden />
              Dokumen Baru
            </Button>
          )
        }
      />

      <section aria-label="Ringkasan dokumen sesuai filter" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jumlah Dokumen"
          icon={FileText}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.count) : '-'}
          hint="sesuai filter"
        />
        <StatCard
          label="Kedaluwarsa"
          icon={AlertTriangle}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.expiredCount) : '-'}
          hint="perlu diperpanjang"
        />
        <StatCard
          label="Segera Kedaluwarsa"
          icon={Clock}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.expiringCount) : '-'}
          hint={`dalam ${EXPIRING_SOON_DAYS} hari`}
        />
        <StatCard
          label="Berlaku"
          icon={CheckCircle2}
          loading={kpiLoading}
          value={summary ? formatNumber(summary.validCount) : '-'}
          hint="termasuk tanpa batas"
        />
      </section>

      <div className="space-y-3">
        <FilterBar
          list={list}
          searchLabel="Cari dokumen"
          searchPlaceholder="Cari kode, judul, nomor, atau aset"
          status={{ options: STATUS_FILTER }}
        >
          <SelectFilter
            label="Masa berlaku"
            allLabel="Semua masa berlaku"
            options={EXPIRY_FILTER}
            value={list.filters.expiry}
            onChange={(v) => list.setFilter('expiry', v)}
            className={FILTER_CLASS}
          />
          <SelectFilter
            label="Jenis dokumen"
            allLabel="Semua jenis"
            options={typeOptions}
            value={list.filters.typeId}
            onChange={(v) => list.setFilter('typeId', v)}
            className={FILTER_CLASS}
          />
          <ComboboxFilter
            label="Aset terkait"
            allLabel="Semua aset"
            searchPlaceholder="Cari aset…"
            value={list.filters.assetId}
            onChange={(v) => list.setFilter('assetId', v)}
            options={assetOptions}
            loading={assetsQuery.isLoading}
            className={FILTER_CLASS}
          />
        </FilterBar>

        <DataTable
          {...listTableProps(list, docsQuery.data?.total)}
          label="Daftar dokumen dan sertifikat"
          itemLabel="dokumen"
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
            title: 'Belum ada dokumen',
            description: 'Izin, sertifikat, STNK, polis, dan dokumen legal lain akan muncul di sini.',
            action: canEdit ? (
              <Button size="sm" onClick={() => setFormTarget({ doc: null })}>
                <Plus aria-hidden />
                Tambah dokumen pertama
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
        title="Hapus Dokumen"
        description={`Hapus dokumen ${deleteTarget?.code ?? ''} · ${deleteTarget?.title ?? ''}? Semua versi file ikut terhapus.`}
        confirmLabel="Ya, Hapus"
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
