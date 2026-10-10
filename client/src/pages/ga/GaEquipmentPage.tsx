/**
 * Equipment assets (/ga/equipment) with equipment data (1-1, upserted) and calibration logs.
 * The list marks calibrations due soon or overdue. Writes need ga_equipment edit.
 */
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQueries, useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { ClipboardCheck, Plus, QrCode, Save, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { can } from '@/lib/permissions';
import { formatDate, formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DataTable, DateInput, EmptyState, Field, PageHeader, StatusBadge } from '@/components/shared';
import { AssetPhotoSection } from '@/components/AssetPhotoSection';
import GaAssetQRModal from '@/components/GaAssetQRModal';
import { FormNumberInput } from '@/components/inventory/master-data-kit';
import {
  CALIBRATION_MODE_OPTIONS,
  CALIBRATION_RESULT_OPTIONS,
  WEIGHING_UNIT_OPTIONS,
  apiErrorMessage,
  calibrationDue,
  numOrNull,
  optionLabel,
  type AssetRow,
} from '@/components/ga/assets/asset-model';
import { DueMarker, Section, TableSection } from '@/components/ga/assets/asset-ui';
import { AssetPickerList } from '@/components/ga/assets/AssetPickerList';
import { OptionSelect } from '@/components/ga/assets/OptionSelect';
import { CalibrationFormSheet, type CalibrationLog } from '@/components/ga/assets/CalibrationFormSheet';
import { useAssetSelection } from '@/components/ga/assets/useAssetSelection';
import { scrollBehavior } from '@/lib/motion';

/** Equipment markers are fetched per asset; cap the fan-out for very long lists. */
const MARKER_LIMIT = 40;
const UNIT_OPTIONS = WEIGHING_UNIT_OPTIONS.map((u) => ({ value: u, label: u }));

interface EquipmentData {
  maxCapacity: string | number | null;
  unit: string | null;
  accuracy: string | number | null;
  classLabel: string | null;
  defaultCalibrator: string | null;
  intervalMonths: number | null;
  lastCalibratedAt: string | null;
  nextCalibrationDue: string | null;
  notes: string | null;
}

interface EquipForm {
  maxCapacity: string;
  unit: string;
  accuracy: string;
  classLabel: string;
  defaultCalibrator: string;
  intervalMonths: string;
  lastCalibratedAt: string;
  notes: string;
}

function toForm(e: EquipmentData | null | undefined): EquipForm {
  return {
    maxCapacity: e?.maxCapacity != null ? String(e.maxCapacity) : '',
    unit: e?.unit ?? '',
    accuracy: e?.accuracy != null ? String(e.accuracy) : '',
    classLabel: e?.classLabel ?? '',
    defaultCalibrator: e?.defaultCalibrator ?? '',
    intervalMonths: e?.intervalMonths != null ? String(e.intervalMonths) : '12',
    lastCalibratedAt: e?.lastCalibratedAt ? e.lastCalibratedAt.slice(0, 10) : '',
    notes: e?.notes ?? '',
  };
}

const equipKey = (id: string | null) => ['ga-equipment', id];
const fetchEquipment = async (id: string) => (await api.get<EquipmentData | null>(`/ga/equipment/assets/${id}`)).data ?? null;

export const GaEquipmentPage = () => {
  const queryClient = useQueryClient();
  const canEdit = can('ga_equipment', 'edit');
  const canEditAssets = can('ga_assets', 'edit');
  const detailRef = useRef<HTMLDivElement>(null);
  const [showCalSheet, setShowCalSheet] = useState(false);
  const [showQr, setShowQr] = useState(false);

  const assetsQuery = useQuery({
    queryKey: ['ga-assets', 'kind', 'equipment'],
    queryFn: async () =>
      (await api.get<AssetRow[]>('/ga/assets', { params: { limit: 500, categoryKind: 'equipment' } })).data,
  });
  const assets = assetsQuery.data;
  const assetIds = useMemo(() => assets?.map((a) => a.id), [assets]);
  const { selectedId, select } = useAssetSelection(assetIds);
  const selectedAsset = assets?.find((a) => a.id === selectedId) ?? null;

  // Per-asset equipment data for the list markers (same cache as the detail).
  const markerQueries = useQueries({
    queries: (assets ?? []).slice(0, MARKER_LIMIT).map((a) => ({
      queryKey: equipKey(a.id),
      queryFn: () => fetchEquipment(a.id),
      staleTime: 60_000,
    })),
  });
  const equipByAsset = new Map((assets ?? []).slice(0, MARKER_LIMIT).map((a, i) => [a.id, markerQueries[i]?.data]));

  const assetDetail = useQuery<AssetRow>({
    queryKey: ['ga-asset-detail', selectedId],
    queryFn: async () => (await api.get(`/ga/assets/${selectedId}`)).data,
    enabled: !!selectedId,
  });

  const equipQuery = useQuery({
    queryKey: equipKey(selectedId),
    queryFn: () => fetchEquipment(selectedId as string),
    enabled: !!selectedId,
  });

  const logsQuery = useQuery({
    queryKey: ['ga-calibration', selectedId],
    queryFn: async () => {
      const res = await api.get(`/ga/equipment/assets/${selectedId}/calibration-logs`);
      return (res.data?.data ?? res.data ?? []) as CalibrationLog[];
    },
    enabled: !!selectedId,
  });

  const onSelect = (a: AssetRow) => {
    select(a.id);
    if (window.matchMedia('(max-width: 1023px)').matches) {
      requestAnimationFrame(() => detailRef.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'start' }));
    }
  };

  const logColumns = useMemo<ColumnDef<CalibrationLog>[]>(
    () => [
      {
        id: 'tanggal',
        header: 'Tanggal',
        meta: { cellClassName: 'num whitespace-nowrap' },
        cell: ({ row }) => (
          <div className="flex flex-col gap-0.5">
            <span>{formatDate(row.original.tanggal)}</span>
            <span className="text-xs text-muted-foreground md:hidden">{row.original.lembaga}</span>
          </div>
        ),
      },
      {
        id: 'lembaga',
        header: 'Lembaga',
        meta: { hideBelow: 'md', cellClassName: 'min-w-40' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="text-foreground">{row.original.lembaga}</p>
            <p className="text-xs text-muted-foreground">{optionLabel(CALIBRATION_MODE_OPTIONS, row.original.mode)}</p>
          </div>
        ),
      },
      {
        id: 'noSertifikat',
        header: 'No. Sertifikat',
        meta: { hideBelow: 'lg', cellClassName: 'num font-mono text-xs' },
        cell: ({ row }) => row.original.noSertifikat,
      },
      {
        id: 'hasil',
        header: 'Hasil',
        cell: ({ row }) => {
          const r = CALIBRATION_RESULT_OPTIONS.find((o) => o.value === row.original.hasil);
          return <StatusBadge label={r?.label ?? row.original.hasil} tone={r?.tone ?? 'neutral'} />;
        },
      },
      {
        id: 'validUntil',
        header: 'Berlaku s/d',
        meta: { hideBelow: 'sm', cellClassName: 'num whitespace-nowrap text-muted-foreground' },
        cell: ({ row }) => formatDate(row.original.validUntil),
      },
      {
        id: 'biaya',
        header: () => (
          <>
            Biaya <span className="normal-case">(Rp)</span>
          </>
        ),
        meta: { align: 'right' },
        cell: ({ row }) => (row.original.biaya != null ? formatRupiah(row.original.biaya, { symbol: false }) : '—'),
      },
    ],
    [],
  );

  const equip = equipQuery.data;
  const due = calibrationDue(equip?.nextCalibrationDue);

  return (
    <div className="space-y-5 pb-8">
      <PageHeader
        title="Peralatan & Kalibrasi"
        description="Data alat ukur & timbang, jatuh tempo kalibrasi, dan riwayat sertifikat kalibrasi per aset."
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <AssetPickerList
          label="Daftar peralatan"
          assets={assets ?? []}
          loading={assetsQuery.isLoading}
          error={assetsQuery.error}
          onRetry={() => assetsQuery.refetch()}
          selectedId={selectedId}
          onSelect={onSelect}
          searchPlaceholder="Cari kode, nama, atau lokasi"
          renderMarker={(a) => {
            const e = equipByAsset.get(a.id);
            return e?.nextCalibrationDue ? <DueMarker info={calibrationDue(e.nextCalibrationDue)} hideOk className="mt-0.5" /> : null;
          }}
          empty={{
            title: 'Belum ada peralatan',
            description: 'Daftarkan aset dengan kategori Peralatan di Daftar Aset.',
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
                <EmptyState icon={ScanLine} title="Pilih peralatan" description="Pilih peralatan di daftar untuk melihat data dan riwayat kalibrasinya." />
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
                  <div className="mt-1.5 text-sm text-foreground">
                    {equipQuery.isLoading ? (
                      <Skeleton className="h-4 w-48" />
                    ) : equip?.nextCalibrationDue ? (
                      <span className="flex flex-wrap items-center gap-x-2">
                        <span>
                          Kalibrasi berikutnya <span className="num font-medium">{formatDate(equip.nextCalibrationDue)}</span>
                        </span>
                        <DueMarker info={due} />
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Jatuh tempo kalibrasi belum ada.</span>
                    )}
                  </div>
                </div>
                <Button variant="outline" onClick={() => setShowQr(true)} disabled={!assetDetail.data}>
                  <QrCode aria-hidden />
                  QR aset
                </Button>
              </div>

              <EquipmentDataSection key={selectedAsset.id} assetId={selectedAsset.id} canEdit={canEdit} query={equipQuery} />

              <TableSection
                title="Riwayat Kalibrasi"
                icon={<ClipboardCheck />}
                actions={
                  canEdit && (
                    <Button size="sm" onClick={() => setShowCalSheet(true)}>
                      <Plus aria-hidden />
                      Tambah Log
                    </Button>
                  )
                }
              >
                <DataTable
                  label={`Riwayat kalibrasi ${selectedAsset.name}`}
                  itemLabel="log"
                  columns={logColumns}
                  data={logsQuery.data}
                  getRowId={(r) => r.id}
                  loading={logsQuery.isLoading}
                  error={logsQuery.error}
                  onRetry={() => logsQuery.refetch()}
                  stickyHeader={false}
                  empty={{
                    title: 'Belum ada log kalibrasi',
                    description: 'Catat setiap kalibrasi beserta masa berlaku sertifikatnya.',
                  }}
                />
              </TableSection>

              <AssetPhotoSection assetId={selectedAsset.id} canEdit={canEdit} />
            </>
          )}
        </div>
      </div>

      {showCalSheet && selectedId && (
        <CalibrationFormSheet
          assetId={selectedId}
          defaultLembaga={equip?.defaultCalibrator}
          onClose={() => setShowCalSheet(false)}
          onSaved={() => {
            setShowCalSheet(false);
            queryClient.invalidateQueries({ queryKey: ['ga-calibration', selectedId] });
            queryClient.invalidateQueries({ queryKey: equipKey(selectedId) });
          }}
        />
      )}

      <GaAssetQRModal isOpen={showQr} onClose={() => setShowQr(false)} asset={assetDetail.data ?? null} />
    </div>
  );
};

// Equipment data (1-1, upsert)

interface EquipmentDataSectionProps {
  assetId: string;
  canEdit: boolean;
  query: { data: EquipmentData | null | undefined; isLoading: boolean; isError: boolean; refetch: () => unknown };
}

function EquipmentDataSection({ assetId, canEdit, query }: EquipmentDataSectionProps) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<EquipForm>(() => toForm(query.data ?? null));
  const [dirty, setDirty] = useState(false);
  // Reset the form whenever fresh server data arrives (render-phase sync).
  const [syncedData, setSyncedData] = useState(query.data);
  if (query.data !== syncedData) {
    setSyncedData(query.data);
    if (query.data !== undefined) {
      setForm(toForm(query.data));
      setDirty(false);
    }
  }

  const set = (k: keyof EquipForm, v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setDirty(true);
  };

  const save = useMutation({
    mutationFn: () =>
      api.put(`/ga/equipment/assets/${assetId}`, {
        maxCapacity: numOrNull(form.maxCapacity),
        unit: form.unit || null,
        accuracy: numOrNull(form.accuracy),
        classLabel: form.classLabel || null,
        defaultCalibrator: form.defaultCalibrator || null,
        intervalMonths: numOrNull(form.intervalMonths) ?? 12,
        lastCalibratedAt: form.lastCalibratedAt || null,
        notes: form.notes || null,
      }),
    onSuccess: () => {
      toast.success('Data peralatan tersimpan.');
      queryClient.invalidateQueries({ queryKey: equipKey(assetId) });
    },
    onError: (e) => toast.error(apiErrorMessage(e, 'Gagal menyimpan.')),
  });

  const ro = !canEdit;

  return (
    <Section
      title="Data Peralatan"
      icon={<ScanLine />}
      actions={
        canEdit && (
          <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty || query.isLoading}>
            <Save aria-hidden />
            Simpan
          </Button>
        )
      }
    >
      {query.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : query.isError ? (
        <EmptyState
          kind="error"
          compact
          action={
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Coba lagi
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {!query.data && (
            <p className="text-sm text-muted-foreground">Data peralatan belum diisi{canEdit ? '. Lengkapi lalu simpan.' : '.'}</p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Kapasitas maks">
              <FormNumberInput value={form.maxCapacity} onChange={(e) => set('maxCapacity', e.target.value)} disabled={ro} min={0} step="0.001" className="num text-right" />
            </Field>
            <Field label="Satuan">
              <OptionSelect value={form.unit} onChange={(v) => set('unit', v)} options={UNIT_OPTIONS} noneLabel="Tidak diisi" disabled={ro} />
            </Field>
            <Field label="Akurasi">
              <FormNumberInput value={form.accuracy} onChange={(e) => set('accuracy', e.target.value)} disabled={ro} min={0} step="0.0001" className="num text-right" />
            </Field>
            <Field label="Kelas">
              <Input value={form.classLabel} onChange={(e) => set('classLabel', e.target.value)} disabled={ro} maxLength={50} />
            </Field>
            <Field label="Lembaga kalibrator default">
              <Input value={form.defaultCalibrator} onChange={(e) => set('defaultCalibrator', e.target.value)} disabled={ro} maxLength={200} />
            </Field>
            <Field label="Interval kalibrasi (bulan)">
              <FormNumberInput value={form.intervalMonths} onChange={(e) => set('intervalMonths', e.target.value)} disabled={ro} min={1} step="1" className="num" />
            </Field>
            <Field label="Terakhir dikalibrasi" hint="Jatuh tempo dihitung dari tanggal ini + interval.">
              {(control) => (
                <DateInput id={control.id} value={form.lastCalibratedAt} onChange={(v) => set('lastCalibratedAt', v)} disabled={ro} />
              )}
            </Field>
            <Field label="Catatan" className="sm:col-span-2">
              <Input value={form.notes} onChange={(e) => set('notes', e.target.value)} disabled={ro} />
            </Field>
          </div>
        </div>
      )}
    </Section>
  );
}
