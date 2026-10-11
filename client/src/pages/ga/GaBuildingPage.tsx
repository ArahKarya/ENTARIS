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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation('eam');
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
      toast.success(t('building.rentalEnded'));
      queryClient.invalidateQueries({ queryKey: rentalsKey(selectedId) });
    },
    onError: (e) => toast.error(apiErrorMessage(e, t('building.rentalEndFailed'))),
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
        header: t('building.party'),
        meta: { cellClassName: 'min-w-40' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{r.arah === 'SEWA_MASUK' ? t('building.ownerIn') : t('building.tenantOut')}</p>
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
        header: t('building.period'),
        meta: { hideBelow: 'md', cellClassName: 'whitespace-nowrap' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col gap-0.5">
              <span className="num text-xs text-muted-foreground">{t('building.starts', { date: formatDate(r.tanggalMulai) })}</span>
              <DueMarker info={rentalExpiry(r)} date={r.tanggalAkhir} />
            </div>
          );
        },
      },
      {
        id: 'nilaiSewa',
        header: () => (
          <>
            {t('building.rent')} <span className="normal-case">(Rp)</span>
          </>
        ),
        meta: { align: 'right' },
        cell: ({ row }) => {
          const r = row.original;
          return (
            <div className="flex flex-col items-end gap-1">
              <span className="font-medium text-foreground">{formatRupiah(r.nilaiSewa, { symbol: false })}</span>
              <span className="text-xs text-muted-foreground">{r.periode === 'BULANAN' ? t('building.perMonth') : t('building.perYear')}</span>
              <StatusBadge status={r.status} className="sm:hidden" />
            </div>
          );
        },
      },
      {
        id: 'status',
        header: t('shared.status'),
        meta: { hideBelow: 'sm' },
        cell: ({ row }) => <StatusBadge status={row.original.status} />,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">{t('shared.actions')}</span>,
        meta: { align: 'right', headerClassName: 'w-12', cellClassName: 'w-12 py-0' },
        cell: ({ row }) => (
          <RowActions
            label={t('building.rentalActionsFor', { name: row.original.pihak })}
            actions={[
              {
                label: t('building.endRental'),
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
    [canEdit, t],
  );

  const activeRental = nearestActiveRental(rentals);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title={t('building.title')}
        description={t('building.description')}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <AssetPickerList
          label={t('building.listLabel')}
          assets={assets ?? []}
          loading={assetsQuery.isLoading}
          error={assetsQuery.error}
          onRetry={() => assetsQuery.refetch()}
          selectedId={selectedId}
          onSelect={onSelect}
          searchPlaceholder={t('building.searchPlaceholder')}
          renderMarker={(a) => {
            const r = nearestActiveRental(rentalsByAsset.get(a.id) ?? []);
            return r ? <DueMarker info={rentalExpiry(r)} hideOk className="mt-0.5" /> : null;
          }}
          empty={{
            title: t('building.emptyTitle'),
            description: t('building.emptyDescription'),
            action: canEditAssets ? (
              <Button asChild size="sm" variant="outline">
                <Link to="/ga/assets">{t('building.openAssets')}</Link>
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
                <EmptyState icon={Building2} title={t('building.pickTitle')} description={t('building.pickDescription')} />
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
                        {t('building.activeUntil')} <span className="num font-medium">{formatDate(activeRental.tanggalAkhir)}</span>
                      </span>
                      <DueMarker info={rentalExpiry(activeRental)} hideOk />
                    </p>
                  )}
                </div>
                <Button variant="outline" onClick={() => setShowQr(true)} disabled={!assetDetail.data}>
                  <QrCode aria-hidden />
                  {t('building.qr')}
                </Button>
              </div>

              <TableSection
                title={t('building.rentals')}
                icon={<KeyRound />}
                actions={
                  canEdit && (
                    <Button size="sm" onClick={() => setShowRentalSheet(true)}>
                      <Plus aria-hidden />
                      {t('building.addRental')}
                    </Button>
                  )
                }
              >
                <DataTable
                  label={t('building.rentalsOf', { name: selectedAsset.name })}
                  itemLabel={t('building.rentalItem')}
                  columns={rentalColumns}
                  data={rentals}
                  getRowId={(r) => r.id}
                  loading={rentalsQuery.isLoading}
                  error={rentalsQuery.error}
                  onRetry={() => rentalsQuery.refetch()}
                  rowClassName={(r) => (r.status === 'AKTIF' ? undefined : 'text-muted-foreground')}
                  stickyHeader={false}
                  empty={{
                    title: t('building.noRentals'),
                    description: t('building.noRentalsDescription'),
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
        title={t('building.endTitle')}
        description={t('building.endDescription', { name: endTarget?.pihak ?? '' })}
        confirmLabel={t('building.confirmEnd')}
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
  const { t } = useTranslation('eam');
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
      toast.success(t('building.data.saved'));
      queryClient.invalidateQueries({ queryKey: ['ga-building', assetId] });
    },
    onError: (e) => toast.error(apiErrorMessage(e, t('building.data.saveFailed'))),
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
      title={t('building.data.title')}
      icon={<Building2 />}
      actions={
        canEdit && (
          <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty || dataQuery.isLoading}>
            <Save aria-hidden />
            {t('shared.save')}
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
              {t('building.data.retry')}
            </Button>
          }
        />
      ) : (
        <div className="space-y-5">
          {!dataQuery.data && (
            <p className="text-sm text-muted-foreground">
              {canEdit ? t('building.data.emptyEditable') : t('building.data.empty')}
            </p>
          )}
          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="sr-only">{t('building.data.general')}</legend>
            <Field label={t('building.data.type')}>
              <OptionSelect value={form.jenis} onChange={(v) => set('jenis', v)} options={BUILDING_TYPE_OPTIONS} disabled={ro} />
            </Field>
            <Field label={t('building.data.ownership')}>
              <OptionSelect value={form.ownership} onChange={(v) => set('ownership', v)} options={OWNERSHIP_OPTIONS} disabled={ro} />
            </Field>
            {number('jumlahLantai', t('building.data.floors'))}
            {number('luasTanah', t('building.data.landArea'), { right: true, step: '0.01' })}
            {number('luasBangunan', t('building.data.buildingArea'), { right: true, step: '0.01' })}
            {number('tahunBangun', t('building.data.yearBuilt'))}
            {number('tahunRenovasi', t('building.data.yearRenovated'))}
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('building.data.legal')}</legend>
            <Field label={t('building.data.certType')}>
              <OptionSelect
                value={form.certificateType}
                onChange={(v) => set('certificateType', v)}
                options={CERTIFICATE_OPTIONS}
                noneLabel={t('building.data.notFilled')}
                disabled={ro}
              />
            </Field>
            {text('certificateNumber', t('building.data.certNumber'))}
            <div className="hidden lg:block" aria-hidden />
            {number('njopTanah', t('building.data.njopLand'), { right: true })}
            {number('njopBangunan', t('building.data.njopBuilding'), { right: true })}
          </fieldset>

          <fieldset className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('building.data.address')}</legend>
            {text('alamatLengkap', t('building.data.fullAddress'), true)}
            {text('kelurahan', t('building.data.village'))}
            {text('kecamatan', t('building.data.district'))}
            {text('kota', t('building.data.city'))}
            {text('provinsi', t('building.data.province'))}
            {text('kodePos', t('building.data.postalCode'))}
            {text('notes', t('shared.notes'), true)}
          </fieldset>
        </div>
      )}
    </Section>
  );
}
