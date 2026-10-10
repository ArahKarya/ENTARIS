/** Ringkasan: compliance at a glance, vehicle data form, driver, book value and photos. */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Save, UserCog, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { formatNumber, formatRupiah } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Panel } from '@/components/inventory/dashboard-kit';
import { AssetPhotoSection } from '@/components/AssetPhotoSection';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import { FUEL_TYPES, FUEL_TYPE_LABELS, type VehicleSection } from '../constants';
import { SelectField, TextAreaField, TextField } from '../modals/form-kit';
import type { AssetDetail, VehicleContext, VehicleData } from '../types';
import { useInvalidateVehicle, useUserOptions, vehicleKeys } from '../vehicle-queries';
import { FLEET_DOCS, FLEET_DOC_LABELS, apiError, numOrNull, type FleetRow } from '../vehicle-model';
import { DetailItem, DueDateCell } from '../vehicle-ui';

const DOC_SECTION: Record<string, VehicleSection> = {
  tax: 'pajak', stnk: 'pajak', kir: 'pajak', insurance: 'asuransi', inspection: 'inspeksi',
};

type Form = Record<keyof Omit<VehicleData, 'kapasitasTangki'> | 'kapasitasTangki', string>;

const toForm = (d: VehicleData | null | undefined): Form => ({
  noPlat: d?.noPlat ?? '', brand: d?.brand ?? '', tipe: d?.tipe ?? '',
  tahunProduksi: d?.tahunProduksi != null ? String(d.tahunProduksi) : '',
  noMesin: d?.noMesin ?? '', noRangka: d?.noRangka ?? '', jenisBBM: d?.jenisBBM ?? '',
  kapasitasTangki: d?.kapasitasTangki != null ? String(d.kapasitasTangki) : '',
  warna: d?.warna ?? '',
  odometerSaatBeli: d?.odometerSaatBeli != null ? String(d.odometerSaatBeli) : '',
  odometerTerakhir: d?.odometerTerakhir != null ? String(d.odometerTerakhir) : '',
  notes: d?.notes ?? '',
});

interface OverviewProps extends VehicleContext {
  row: FleetRow | null;
  asset: AssetDetail | undefined;
  assetUnavailable: boolean;
  onNavigate: (section: VehicleSection) => void;
}

function DriverCard({ assetId, canEdit, pic }: { assetId: string; canEdit: boolean; pic: AssetDetail['pic'] }) {
  const invalidate = useInvalidateVehicle(assetId);
  const [editing, setEditing] = useState(false);
  const [picked, setPicked] = useState(pic?.id ?? '');
  const users = useUserOptions('ga-users-driver-picker', editing);
  const assign = useMutation({
    mutationFn: (picUserId: string | null) => api.patch(`/ga/vehicle/assets/${assetId}/driver`, { picUserId }),
    onSuccess: () => {
      toast.success('Driver kendaraan diperbarui.');
      setEditing(false);
      invalidate(['assetDetail']);
    },
    onError: (e) => toast.error(apiError(e, 'Gagal menugaskan driver.')),
  });

  return (
    <Panel
      title="Driver / Penanggung Jawab"
      action={
        canEdit && !editing && (
          <Button size="sm" variant="outline" onClick={() => { setPicked(pic?.id ?? ''); setEditing(true); }}>
            <UserCog aria-hidden />
            {pic ? 'Ganti driver' : 'Tugaskan driver'}
          </Button>
        )
      }
    >
      {editing ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1">
            <ComboboxField
              label="Driver"
              value={picked}
              onChange={setPicked}
              options={(users.data ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
              placeholder="Pilih driver…"
            />
          </div>
          <Button size="sm" loading={assign.isPending} onClick={() => assign.mutate(picked || null)}>
            {!assign.isPending && <Save aria-hidden />}
            Simpan
          </Button>
          <Button size="icon-sm" variant="ghost" aria-label="Batal" onClick={() => setEditing(false)}>
            <X aria-hidden />
          </Button>
        </div>
      ) : pic ? (
        <p className="text-sm text-foreground">{pic.fullName ?? pic.id}</p>
      ) : (
        <p className="text-sm text-muted-foreground">Belum ada driver ditugaskan.</p>
      )}
    </Panel>
  );
}

function VehicleDataPanel({ assetId, canEdit, data, loading }: { assetId: string; canEdit: boolean; data: VehicleData | null | undefined; loading: boolean }) {
  const invalidate = useInvalidateVehicle(assetId);
  const [form, setForm] = useState<Form>(() => toForm(data));
  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: () =>
      api.put(`/ga/vehicle/assets/${assetId}`, {
        noPlat: form.noPlat || null, brand: form.brand || null, tipe: form.tipe || null,
        tahunProduksi: numOrNull(form.tahunProduksi), noMesin: form.noMesin || null,
        noRangka: form.noRangka || null, jenisBBM: form.jenisBBM || null,
        kapasitasTangki: numOrNull(form.kapasitasTangki), warna: form.warna || null,
        odometerSaatBeli: numOrNull(form.odometerSaatBeli),
        odometerTerakhir: numOrNull(form.odometerTerakhir), notes: form.notes || null,
      }),
    onSuccess: () => {
      toast.success('Data kendaraan disimpan.');
      invalidate(['vehicle']);
    },
    onError: (e) => toast.error(apiError(e, 'Gagal simpan data kendaraan.')),
  });

  return (
    <Panel
      title="Data Kendaraan"
      action={
        canEdit && (
          <Button size="sm" loading={save.isPending} onClick={() => save.mutate()} disabled={loading}>
            {!save.isPending && <Save aria-hidden />}
            Simpan
          </Button>
        )
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canEdit) save.mutate();
        }}
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-busy={loading || undefined}
      >
        <TextField label="No. plat" value={form.noPlat} onChange={set('noPlat')} disabled={!canEdit} />
        <TextField label="Merek" value={form.brand} onChange={set('brand')} disabled={!canEdit} />
        <TextField label="Tipe" value={form.tipe} onChange={set('tipe')} disabled={!canEdit} />
        <TextField label="Tahun produksi" type="number" inputMode="numeric" value={form.tahunProduksi} onChange={set('tahunProduksi')} disabled={!canEdit} />
        <TextField label="No. mesin" value={form.noMesin} onChange={set('noMesin')} disabled={!canEdit} />
        <TextField label="No. rangka" value={form.noRangka} onChange={set('noRangka')} disabled={!canEdit} />
        <SelectField label="Jenis BBM" value={form.jenisBBM} onChange={set('jenisBBM')} options={FUEL_TYPES} labels={FUEL_TYPE_LABELS} emptyLabel="—" disabled={!canEdit} />
        <TextField label="Kapasitas tangki (L)" type="number" value={form.kapasitasTangki} onChange={set('kapasitasTangki')} disabled={!canEdit} />
        <TextField label="Warna" value={form.warna} onChange={set('warna')} disabled={!canEdit} />
        <TextField label="Odometer saat beli (km)" type="number" value={form.odometerSaatBeli} onChange={set('odometerSaatBeli')} disabled={!canEdit} />
        <TextField label="Odometer terakhir (km)" type="number" value={form.odometerTerakhir} onChange={set('odometerTerakhir')} disabled={!canEdit} />
        <TextAreaField label="Catatan" value={form.notes} onChange={set('notes')} disabled={!canEdit} className="sm:col-span-2 lg:col-span-3" />
      </form>
    </Panel>
  );
}

export function OverviewSection({ assetId, canEdit, row, asset, assetUnavailable, onNavigate }: OverviewProps) {
  const vehicleQuery = useQuery<VehicleData | null>({
    queryKey: vehicleKeys.vehicle(assetId),
    queryFn: async () => (await api.get(`/ga/vehicle/assets/${assetId}`)).data,
  });
  const fa = asset?.fixedAsset;

  return (
    <div className="space-y-4">
      <Panel title="Kepatuhan & Jadwal" description="Klik untuk membuka bagian terkait.">
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {FLEET_DOCS.map((d) => {
            const due = row?.due[d];
            return (
              <li key={d}>
                <button
                  type="button"
                  onClick={() => onNavigate(DOC_SECTION[d]!)}
                  className="flex h-full w-full flex-col items-start gap-1 rounded-md border border-border px-3 py-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-xs text-muted-foreground">{FLEET_DOC_LABELS[d]}</span>
                  {due?.dueDate ? (
                    <DueDateCell date={due.dueDate} state={due.state} hideOk={false} />
                  ) : (
                    <span className="text-sm text-muted-foreground">Belum dicatat</span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </Panel>

      <VehicleDataPanel
        key={vehicleQuery.dataUpdatedAt}
        assetId={assetId}
        canEdit={canEdit}
        data={vehicleQuery.data}
        loading={vehicleQuery.isLoading}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {assetUnavailable ? (
          <Panel title="Driver / Penanggung Jawab">
            <p className="text-sm text-muted-foreground">Data aset tidak dapat dimuat (perlu akses modul Aset).</p>
          </Panel>
        ) : (
          <DriverCard key={asset?.pic?.id ?? 'none'} assetId={assetId} canEdit={canEdit} pic={asset?.pic ?? null} />
        )}
        <Panel title="Aset & Nilai Buku">
          <dl className="grid grid-cols-2 gap-3">
            <DetailItem label="Kode aset"><span className="num">{asset?.code ?? row?.code ?? '—'}</span></DetailItem>
            <DetailItem label="Kategori">{asset?.category?.name ?? row?.categoryName ?? '—'}</DetailItem>
            <DetailItem label="Cabang">{asset?.branch?.name ?? '—'}</DetailItem>
            <DetailItem label="Odometer terakhir">
              <span className="num">{row?.odometer != null ? `${formatNumber(row.odometer)} km` : '—'}</span>
            </DetailItem>
            {fa ? (
              <>
                <DetailItem label="Harga perolehan"><span className="num">{formatRupiah(fa.acquisitionCost)}</span></DetailItem>
                <DetailItem label="Akumulasi penyusutan"><span className="num">{formatRupiah(fa.accumulatedDepreciation)}</span></DetailItem>
                <DetailItem label="Nilai buku (NBV)"><span className="num font-semibold">{formatRupiah(fa.bookValue)}</span></DetailItem>
                <DetailItem label="Masa manfaat"><span className="num">{fa.usefulLifeMonths} bulan</span></DetailItem>
              </>
            ) : (
              <DetailItem label="Harga perolehan">
                <span className="num">{asset?.acquisitionCost != null ? formatRupiah(asset.acquisitionCost) : '—'}</span>
              </DetailItem>
            )}
          </dl>
        </Panel>
      </div>

      {!assetUnavailable && <AssetPhotoSection assetId={assetId} canEdit={canEdit} />}
    </div>
  );
}
