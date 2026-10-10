/**
 * Building assets (/ga/building) with building data (1-1, upserted) and rental contracts (1-many).
 * The list marks the active contract that ends first. Writes need ga_building edit.
 */
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Building2, KeyRound, Plus, QrCode, Save, StopCircle } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDate, formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog, DataTable, EmptyState, Field, PageHeader, RowActions, StatusBadge } from '@/components/shared';
import { AssetPhotoSection } from '@/components/AssetPhotoSection';
import GaAssetQRModal from '@/components/GaAssetQRModal';
import { FormNumberInput } from '@/components/inventory/master-data-kit';
import {
  BUILDING_TYPE_OPTIONS,
  CERTIFICATE_OPTIONS,
  OWNERSHIP_OPTIONS,
  apiErrorMessage,
  nearestActiveRental,
  numOrNull,
  rentalExpiry,
  type AssetRow,
} from '@/components/ga/assets/asset-model';
import { DueMarker, Section, TableSection } from '@/components/ga/assets/asset-ui';
import { AssetPickerList } from '@/components/ga/assets/AssetPickerList';
import { OptionSelect } from '@/components/ga/assets/OptionSelect';
import { RentalFormSheet, type BuildingRental } from '@/components/ga/assets/RentalFormSheet';
import { useAssetSelection } from '@/components/ga/assets/useAssetSelection';
import { scrollBehavior } from '@/lib/motion';

/** Rental markers are fetched per asset; cap the fan-out for very long lists. */
const MARKER_LIMIT = 40;

type BuildingForm = Record<
  | 'jenis'
  | 'ownership'
  | 'luasTanah'
  | 'luasBangunan'
  | 'jumlahLantai'
  | 'tahunBangun'
  | 'tahunRenovasi'
  | 'alamatLengkap'
  | 'kelurahan'
  | 'kecamatan'
  | 'kota'
  | 'provinsi'
  | 'kodePos'
  | 'certificateType'
  | 'certificateNumber'
  | 'njopTanah'
  | 'njopBangunan'
  | 'notes',
  string
>;

type BuildingData = Partial<Record<keyof BuildingForm, string | number | null>> | null;

const str = (v: string | number | null | undefined) => (v == null ? '' : String(v));

function toForm(d: BuildingData): BuildingForm {
  return {
    jenis: str(d?.jenis) || 'KANTOR',
    ownership: str(d?.ownership) || 'MILIK_SENDIRI',
    luasTanah: str(d?.luasTanah),
    luasBangunan: str(d?.luasBangunan),
    jumlahLantai: str(d?.jumlahLantai),
    tahunBangun: str(d?.tahunBangun),
    tahunRenovasi: str(d?.tahunRenovasi),
    alamatLengkap: str(d?.alamatLengkap),
    kelurahan: str(d?.kelurahan),
    kecamatan: str(d?.kecamatan),
    kota: str(d?.kota),
    provinsi: str(d?.provinsi),
    kodePos: str(d?.kodePos),
    certificateType: str(d?.certificateType),
    certificateNumber: str(d?.certificateNumber),
    njopTanah: str(d?.njopTanah),
    njopBangunan: str(d?.njopBangunan),
    notes: str(d?.notes),
  };
}

const rentalsKey = (assetId: string | null) => ['ga-building-rentals', assetId];
const fetchRentals = async (assetId: string) =>
  (await api.get<BuildingRental[]>(`/ga/building/assets/${assetId}/rentals`)).data;

export const GaBuildingPage = () => {
  const queryClient = useQueryClient();
  const canEdit = can('ga_building', 'edit');
  const canEditAssets = can('ga_assets', 'edit');
  const detailRef = useRef<HTMLDivElement>(null);

  const [showRentalSheet, setShowRentalSheet] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [endTarget, setEndTarget] = useState<BuildingRental | null>(null);

  const assetsQuery = useQuery({
    queryKey: ['ga-assets', 'kind', 'building'],
    queryFn: async () =>
      (await api.get<AssetRow[]>('/ga/assets', { params: { limit: 500, categoryKind: 'building' } })).data,
  });
  const assets = assetsQuery.data;
  const assetIds = useMemo(() => assets?.map((a) => a.id), [assets]);
  const { selectedId, select } = useAssetSelection(assetIds);
  const selectedAsset = assets?.find((a) => a.id === selectedId) ?? null;

  // Per-asset rentals for the list markers (same cache as the detail table).
  const markerQueries = useQueries({
    queries: (assets ?? []).slice(0, MARKER_LIMIT).map((a) => ({
      queryKey: rentalsKey(a.id),
      queryFn: () => fetchRentals(a.id),
      staleTime: 60_000,
    })),
  });
  const rentalsByAsset = new Map((assets ?? []).slice(0, MARKER_LIMIT).map((a, i) => [a.id, markerQueries[i]?.data]));

  // QR lives on GaAsset (detail endpoint), not on the building data.
  const assetDetail = useQuery<AssetRow>({
    queryKey: ['ga-asset-detail', selectedId],
    queryFn: async () => (await api.get(`/ga/assets/${selectedId}`)).data,
    enabled: !!selectedId,
  });

  const rentalsQuery = useQuery({
    queryKey: rentalsKey(selectedId),
    queryFn: () => fetchRentals(selectedId as string),
    enabled: !!selectedId,
  });
  const rentals = useMemo(() => rentalsQuery.data ?? [], [rentalsQuery.data]);

  const endRental = useMutation({
    mutationFn: (rid: string) => api.patch(`/ga/building/assets/${selectedId}/rentals/${rid}/end`),
    onSuccess: () => {
      toast.success('Sewa diakhiri.');
      queryClient.invalidateQueries({ queryKey: rentalsKey(selectedId) });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Gagal akhiri sewa.')),
  });

  const onSelect = (a: AssetRow) => {
    select(a.id);
    // Stacked layout (below lg): bring the detail into view.
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }));
    }
  };

  const rentalColumns = useMemo<ColumnDef<BuildingRental>[]>(
    () => [
      {
        id: 'pihak',
        header: 'Pihak',
        meta: { cellClassName: 'min-w-40' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{r.arah === 'SEWA_MASUK' ? 'Pemilik (sewa masuk)' : 'Penyewa (sewa keluar)'}</p>
              <p className="break-words font-medium text-foreground">{r.pihak}</p>
              {r.kontak && <p className="text-xs text-muted-foreground">{r.kontak}</p>}
              {/* Mobile: period stacked here because its column is hidden. */}
              <p className="num mt-0.5 text-xs text-muted-foreground md:hidden">
                {formatDate(r.tanggalMulai)} – {formatDate(r.tanggalAkhir)}
              </p>
              <DueMarker info={rentalExpiry(r)} hideOk className="md:hidden" />
            </div>
          );
        },
      },
      {
        id: 'period',
        header: 'Masa Sewa',
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col gap-0.5">
              <span className="num text-xs text-muted-foreground">mulai {formatDate(r.tanggalMulai)}</span>
              <DueMarker info={rentalExpiry(r)} date={r.tanggalAkhir} />
            </div>
          );
        },
      },
      {
        id: 'nilaiSewa',
        header: () => (
          <>
            Nilai Sewa <span className="normal-case">(Rp)</span>
          </>
        ),
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col items-end gap-1">
              <span className="font-medium text-foreground">{formatRupiah(r.nilaiSewa, { symbol: false })}</span>
              <span className="text-xs text-muted-foreground">per {r.periode === 'BULANAN' ? 'bulan' : 'tahun'}</span>
              <StatusBadge status={r.status} className="sm:hidden" />
            </div>
          );
        },
      },
      {
        id: 'status',
        header: 'Status',
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Aksi</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={`Aksi untuk sewa ${row.original.pihak}`}
            actions={[
              {
                label: 'Akhiri sewa',
                icon: StopCircle,
                tone: 'danger',
                hidden: !canEdit || row.original.status !== 'AKTIF',
                onSelect: () => setEndTarget(row.original),
              },
            ]}
          />
        ),
      },
    ],
    [canEdit],
  );

  const activeRental = nearestActiveRental(rentals);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Gedung & Sewa"
        description="Data properti, sertifikat, dan kontrak sewa per gedung, gudang, atau bangunan."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <AssetPickerList
          label="Daftar gedung"
          assets={assets ?? []}
          loading={assetsQuery.isLoading}
          error={assetsQuery.error}
          onRetry={() => assetsQuery.refetch()}
          selectedId={selectedId}
          onSelect={onSelect}
          searchPlaceholder="Cari kode, nama, atau lokasi"
          renderMarker={(a) => {
            const r = nearestActiveRental(rentalsByAsset.get(a.id) ?? []);
            return r ? <DueMarker info={rentalExpiry(r)} hideOk className="mt-0.5" /> : null;
          }}
          empty={{
            title: 'Belum ada gedung',
            description: 'Daftarkan aset dengan kategori Bangunan / Gedung atau Gudang di Daftar Aset.',
            action: canEditAssets ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/ga/assets">Buka Daftar Aset</Link>
              </Button>
            ) : undefined,
          }}
        />

        <div ref={detailRef} className="min-w-0 scroll-mt-20 space-y-5">
          {!selectedAsset ? (
            assetsQuery.isLoading ? (
              <Skeleton className="h-64 w-full" />
            ) : (
              <div className="rounded-lg border border-border bg-card">
                <EmptyState icon={Building2} title="Pilih gedung" description="Pilih gedung di daftar untuk melihat data bangunan dan kontrak sewanya." />
              </div>
            )
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
                <div className="min-w-0">
                  <p className="num font-mono text-xs text-muted-foreground">{selectedAsset.code}</p>
                  <h2 className="break-words text-base font-semibold text-foreground">{selectedAsset.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {[selectedAsset.category?.name, selectedAsset.branch?.name, selectedAsset.location].filter(Boolean).join(' · ')}
                  </p>
                  {activeRental && (
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-sm text-foreground">
                      <span>
                        Sewa aktif s/d <span className="num font-medium">{formatDate(activeRental.tanggalAkhir)}</span>
                      </span>
                      <DueMarker info={rentalExpiry(activeRental)} hideOk />
                    </p>
                  )}
                </div>
                <Button variant="outline" onClick={() => setShowQr(true)} disabled={!assetDetail.data}>
                  <QrCode aria-hidden />
                  QR aset
                </Button>
              </div>

              <TableSection
                title="Kontrak Sewa"
                icon={<KeyRound />}
                actions={
                  canEdit && (
                    <Button size="sm" onClick={() => setShowRentalSheet(true)}>
                      <Plus aria-hidden />
                      Tambah Kontrak
                    </Button>
                  )
                }
              >
                <DataTable
                  label={`Kontrak sewa ${selectedAsset.name}`}
                  itemLabel="kontrak"
                  columns={rentalColumns}
                  data={rentals}
                  getRowId={(r) => r.id}
                  loading={rentalsQuery.isLoading}
                  error={rentalsQuery.error}
                  onRetry={() => rentalsQuery.refetch()}
                  rowClassName={(r) => (r.status === 'AKTIF' ? undefined : 'text-muted-foreground')}
                  stickyHeader={false}
                  empty={{
                    title: 'Belum ada kontrak sewa',
                    description: 'Catat sewa masuk (kita menyewa) atau sewa keluar (kita menyewakan) beserta masa berlakunya.',
                  }}
                />
              </TableSection>

              <BuildingDataSection key={selectedAsset.id} assetId={selectedAsset.id} canEdit={canEdit} />

              <AssetPhotoSection assetId={selectedAsset.id} canEdit={canEdit} />
            </>
          )}
        </div>
      </div>

      {showRentalSheet && selectedId && (
        <RentalFormSheet
          assetId={selectedId}
          onClose={() => setShowRentalSheet(false)}
          onSaved={() => {
            setShowRentalSheet(false);
            queryClient.invalidateQueries({ queryKey: rentalsKey(selectedId) });
          }}
        />
      )}

      <ConfirmDialog
        open={endTarget !== null}
        onOpenChange={(open) => !open && setEndTarget(null)}
        tone="danger"
        title="Akhiri kontrak sewa?"
        description={`Akhiri kontrak sewa dengan ${endTarget?.pihak ?? ''}? Status berubah menjadi Berakhir.`}
        confirmLabel="Ya, akhiri"
        loading={endRental.isPending}
        onConfirm={async () => {
          if (!endTarget) return;
          await endRental.mutateAsync(endTarget.id);
          setEndTarget(null);
        }}
      />

      <GaAssetQRModal isOpen={showQr} onClose={() => setShowQr(false)} asset={assetDetail.data ?? null} />
    </div>
  );
};

// Building data (1-1, upsert)

function BuildingDataSection({ assetId, canEdit }: { assetId: string; canEdit: boolean }) {
  const queryClient = useQueryClient();
  const dataQuery = useQuery({
    queryKey: ['ga-building', assetId],
    queryFn: async () => (await api.get<BuildingData>(`/ga/building/assets/${assetId}`)).data,
  });
  const [form, setForm] = useState<BuildingForm>(() => toForm(dataQuery.data ?? null));
  const [dirty, setDirty] = useState(false);
  // Reset the form whenever fresh server data arrives (render-phase sync).
  const [syncedData, setSyncedData] = useState(dataQuery.data);
  if (dataQuery.data !== syncedData) {
    setSyncedData(dataQuery.data);
    if (dataQuery.data !== undefined) {
      setForm(toForm(dataQuery.data));
      setDirty(false);
    }
  }

  const set = (k: keyof BuildingForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      api.put(`/ga/building/assets/${assetId}`, {
        jenis: form.jenis,
        ownership: form.ownership,
        luasTanah: numOrNull(form.luasTanah),
        luasBangunan: numOrNull(form.luasBangunan),
        jumlahLantai: numOrNull(form.jumlahLantai),
        tahunBangun: numOrNull(form.tahunBangun),
        tahunRenovasi: numOrNull(form.tahunRenovasi),
        alamatLengkap: form.alamatLengkap || null,
        kelurahan: form.kelurahan || null,
        kecamatan: form.kecamatan || null,
        kota: form.kota || null,
        provinsi: form.provinsi || null,
        kodePos: form.kodePos || null,
        certificateType: form.certificateType || null,
        certificateNumber: form.certificateNumber || null,
        njopTanah: numOrNull(form.njopTanah),
        njopBangunan: numOrNull(form.njopBangunan),
        notes: form.notes || null,
      }),
    onSuccess: () => {
      toast.success('Data bangunan disimpan.');
      queryClient.invalidateQueries({ queryKey: ['ga-building', assetId] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Gagal simpan data bangunan.')),
  });

  const ro = !canEdit;
  const text = (k: keyof BuildingForm, label: string, wide = false) => (
    <Field label={label} className={wide ? 'sm:col-span-2 lg:col-span-3' : undefined}>
      <Input value={form[k]} onChange={(e) => set(k, e.target.value)} disabled={ro} />
    </Field>
  );
  const number = (k: keyof BuildingForm, label: string, opts: { right?: boolean; step?: string } = {}) => (
    <Field label={label}>
      <FormNumberInput
        value={form[k]}
        onChange={(e) => set(k, e.target.value)}
        disabled={ro}
        min={0}
        step={opts.step}
        className={opts.right ? 'num text-right' : 'num'}
      />
    </Field>
  );

  return (
    <Section
      title="Data Bangunan"
      icon={<Building2 />}
      actions={
        canEdit && (
          <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty || dataQuery.isLoading}>
            <Save aria-hidden />
            Simpan
          </Button>
        )
      }
    >
      {dataQuery.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : dataQuery.isError ? (
        <EmptyState
          kind="error"
          compact
          action={
            <Button variant="outline" size="sm" onClick={() => dataQuery.refetch()}>
              Coba lagi
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {!dataQuery.data && (
            <p className="text-sm text-muted-foreground">
              Data bangunan belum diisi{canEdit ? '. Lengkapi lalu simpan.' : '.'}
            </p>
          )}
          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="sr-only">Umum</legend>
            <Field label="Jenis">
              <OptionSelect value={form.jenis} onChange={(v) => set('jenis', v)} options={BUILDING_TYPE_OPTIONS} disabled={ro} />
            </Field>
            <Field label="Kepemilikan">
              <OptionSelect value={form.ownership} onChange={(v) => set('ownership', v)} options={OWNERSHIP_OPTIONS} disabled={ro} />
            </Field>
            {number('jumlahLantai', 'Jumlah lantai')}
            {number('luasTanah', 'Luas tanah (m²)', { right: true, step: '0.01' })}
            {number('luasBangunan', 'Luas bangunan (m²)', { right: true, step: '0.01' })}
            {number('tahunBangun', 'Tahun bangun')}
            {number('tahunRenovasi', 'Tahun renovasi')}
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Legalitas & NJOP</legend>
            <Field label="Jenis sertifikat">
              <OptionSelect
                value={form.certificateType}
                onChange={(v) => set('certificateType', v)}
                options={CERTIFICATE_OPTIONS}
                noneLabel="Tidak diisi"
                disabled={ro}
              />
            </Field>
            {text('certificateNumber', 'No. sertifikat')}
            <div className="hidden lg:block" aria-hidden />
            {number('njopTanah', 'NJOP tanah (Rp)', { right: true })}
            {number('njopBangunan', 'NJOP bangunan (Rp)', { right: true })}
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Alamat</legend>
            {text('alamatLengkap', 'Alamat lengkap', true)}
            {text('kelurahan', 'Kelurahan')}
            {text('kecamatan', 'Kecamatan')}
            {text('kota', 'Kota / kabupaten')}
            {text('provinsi', 'Provinsi')}
            {text('kodePos', 'Kode pos')}
            {text('notes', 'Catatan', true)}
          </fieldset>
        </div>
      )}
    </Section>
  );
}
