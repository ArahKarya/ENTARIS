import { useEffect, useId, useState } from 'react';
import { Wrench, ReceiptText, X } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import SearchableSelect from '@/components/SearchableSelect';
import RupiahInput from '@/components/RupiahInput';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { closeButtonClass, controlBase } from '@/components/ui/styles';
import { DateInput, Field } from '@/components/shared';
import {
  VEHICLE_SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  VEHICLE_TAX_TYPES,
  TAX_TYPE_LABELS,
  URGENSI_LABELS,
  apiErrorMessage,
  type AssetOpt,
  type ServiceType,
  type TaxType,
  type Urgensi,
} from './types';

type Mode = 'SERVICE' | 'TAX';

const rupiahInputClass = cn(controlBase, 'flex h-10 px-3 py-1 md:h-9');

/**
 * Modal pengajuan terpusat. User pilih kendaraan lewat dropdown (Opsi A),
 * tak perlu masuk ke halaman kendaraan dulu.
 */
export function CreateRequestModal({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isService = mode === 'SERVICE';

  // Vehicle list: GA assets in the vehicle category set, resolved on the server
  // (categoryKind=vehicle); the list endpoint includes vehicleData.noPlat for the label.
  const { data: assets = [], isLoading: loadingAssets } = useQuery<AssetOpt[]>({
    queryKey: ['ga-vehicle-assets-req'],
    queryFn: async () =>
      (await api.get('/ga/assets', { params: { limit: 500, categoryKind: 'vehicle' } })).data,
  });

  const [assetId, setAssetId] = useState('');
  const [urgensi, setUrgensi] = useState<Urgensi>('MEDIUM');
  const [deskripsi, setDeskripsi] = useState('');

  // service-only
  const [jenisService, setJenisService] = useState<ServiceType>('SERVIS_BERKALA');
  const [odometer, setOdometer] = useState('');

  // tax-only
  const [taxType, setTaxType] = useState<TaxType>('STNK_TAHUNAN');
  const [periodYear, setPeriodYear] = useState(String(new Date().getFullYear()));
  const [estimatedAmount, setEstimatedAmount] = useState(0);
  const [dueDate, setDueDate] = useState('');

  const assetOptions = assets.map((a) => ({
    value: a.id,
    label: a.vehicleData?.noPlat ? `${a.vehicleData.noPlat} — ${a.name} (${a.code})` : `${a.code} — ${a.name}`,
  }));

  const mutation = useMutation({
    mutationFn: async () => {
      if (isService) {
        return api.post(`/ga/vehicle/assets/${assetId}/service-requests`, {
          jenisService,
          odometer: odometer ? Number(odometer) : null,
          deskripsi,
          urgensi,
        });
      }
      return api.post(`/ga/vehicle/assets/${assetId}/tax-requests`, {
        type: taxType,
        periodYear: Number(periodYear),
        estimatedAmount: estimatedAmount || null,
        dueDate,
        deskripsi: deskripsi || null,
        urgensi,
      });
    },
    onSuccess: () => {
      toast.success(isService ? 'Pengajuan servis terkirim.' : 'Pengajuan pajak terkirim.');
      queryClient.invalidateQueries({ queryKey: ['ga-service-requests'] });
      queryClient.invalidateQueries({ queryKey: ['ga-tax-requests'] });
      onClose();
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal mengirim pengajuan.')),
  });

  const valid =
    !!assetId && (isService ? deskripsi.trim().length > 0 : !!dueDate && !!periodYear);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || mutation.isPending) return;
    mutation.mutate();
  };

  const TitleIcon = isService ? Wrench : ReceiptText;
  const titleId = useId();
  const pending = mutation.isPending;

  // Plain overlay instead of the Radix Dialog: SearchableSelect portals its menu
  // to <body>, which a Radix modal would make unclickable (focus/pointer trap).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !pending) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, pending]);

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-overlay p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[560px] flex-col gap-4 overflow-y-auto rounded-xl border border-border bg-card p-6 text-card-foreground shadow-[var(--shadow-3)]"
      >
        <button type="button" onClick={onClose} disabled={pending} className={closeButtonClass}>
          <X className="size-4" aria-hidden />
          <span className="sr-only">Tutup</span>
        </button>
        <div className="flex flex-col gap-1.5 pr-8">
          <h2 id={titleId} className="flex items-center gap-2 font-heading text-lg font-semibold leading-7 text-foreground">
            <TitleIcon className={cn('size-5', isService ? 'text-primary' : 'text-info-text')} aria-hidden />
            {isService ? 'Pengajuan Servis Kendaraan' : 'Pengajuan Pajak / STNK / KIR'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Pilih kendaraan lalu lengkapi data pengajuan. Status bisa dipantau di tab Pengajuan.
          </p>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label="Kendaraan" required>
            {() => (
              <SearchableSelect
                options={assetOptions}
                value={assetId}
                onChange={setAssetId}
                placeholder={loadingAssets ? 'Memuat…' : '— Pilih kendaraan —'}
                searchable
                aria-label="Kendaraan"
              />
            )}
          </Field>

          {isService ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Jenis Servis" required>
                  {() => (
                    <SearchableSelect
                      options={VEHICLE_SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABELS[t] }))}
                      value={jenisService}
                      onChange={(v) => setJenisService(v as ServiceType)}
                      allowClear={false}
                      aria-label="Jenis servis"
                    />
                  )}
                </Field>
                <Field label="Odometer (km)">
                  <Input
                    type="number"
                    min={0}
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    placeholder="opsional"
                  />
                </Field>
              </div>
              <Field label="Keluhan / Deskripsi" required>
                <Textarea
                  rows={3}
                  value={deskripsi}
                  onChange={(e) => setDeskripsi(e.target.value)}
                  placeholder="Contoh: rem depan bunyi, minta ganti kampas."
                />
              </Field>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Jenis" required>
                  {() => (
                    <SearchableSelect
                      options={VEHICLE_TAX_TYPES.map((t) => ({ value: t, label: TAX_TYPE_LABELS[t] }))}
                      value={taxType}
                      onChange={(v) => setTaxType(v as TaxType)}
                      allowClear={false}
                      aria-label="Jenis pajak"
                    />
                  )}
                </Field>
                <Field label="Tahun Periode" required>
                  <Input
                    type="number"
                    min={2000}
                    max={2100}
                    value={periodYear}
                    onChange={(e) => setPeriodYear(e.target.value)}
                  />
                </Field>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Jatuh Tempo" required>
                  {(control) => <DateInput id={control.id} value={dueDate} onChange={setDueDate} />}
                </Field>
                <Field label="Estimasi Biaya">
                  {(control) => (
                    <RupiahInput
                      id={control.id}
                      value={estimatedAmount}
                      onChange={setEstimatedAmount}
                      className={rupiahInputClass}
                    />
                  )}
                </Field>
              </div>
              <Field label="Catatan">
                <Textarea
                  rows={2}
                  value={deskripsi}
                  onChange={(e) => setDeskripsi(e.target.value)}
                  placeholder="opsional"
                />
              </Field>
            </>
          )}

          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1.5 text-sm font-medium text-foreground">Urgensi</legend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(URGENSI_LABELS) as Urgensi[]).map((u) => (
                <Button
                  key={u}
                  size="sm"
                  variant={urgensi === u ? 'primary' : 'secondary'}
                  aria-pressed={urgensi === u}
                  className="rounded-full"
                  onClick={() => setUrgensi(u)}
                >
                  {URGENSI_LABELS[u]}
                </Button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" disabled={!valid} loading={pending}>
              Kirim Pengajuan
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
