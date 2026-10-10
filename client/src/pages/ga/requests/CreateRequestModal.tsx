import { useState } from 'react';
import { Wrench, ReceiptText } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '@/lib/api';
import { cn } from '@/lib/utils';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import { RupiahField } from '@/components/purchase-cash/RupiahField';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OverlayBody, OverlayFooter, OverlayHeader } from '@/components/sales/dialog-parts-b';
import { dialogShellClass } from '@/components/sales/dialog-classes-b';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
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


/** Central request modal: the vehicle is picked from a dropdown, no need to open the vehicle page. */
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
    label: a.vehicleData?.noPlat ? `${a.vehicleData.noPlat} · ${a.name} (${a.code})` : `${a.code} · ${a.name}`,
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
  const pending = mutation.isPending;

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent size="md" className={dialogShellClass}>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
          <OverlayHeader>
            <DialogTitle className="flex items-center gap-2">
              <TitleIcon className={cn('size-5', isService ? 'text-primary' : 'text-info-text')} aria-hidden />
              {isService ? 'Pengajuan Servis Kendaraan' : 'Pengajuan Pajak / STNK / KIR'}
            </DialogTitle>
            <DialogDescription>
              Pilih kendaraan lalu lengkapi data pengajuan. Status bisa dipantau di tab Pengajuan.
            </DialogDescription>
          </OverlayHeader>
          <OverlayBody>
          <ComboboxField
            label="Kendaraan"
            required
                options={assetOptions}
                value={assetId}
                onChange={setAssetId}
                placeholder={loadingAssets ? 'Memuat…' : 'Pilih kendaraan'}
          />

          {isService ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Jenis Servis" required>
                  {(control) => (
                    <Select value={jenisService} onValueChange={(v) => setJenisService(v as ServiceType)}>
                      <SelectTrigger {...control}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VEHICLE_SERVICE_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {SERVICE_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                  {(control) => (
                    <Select value={taxType} onValueChange={(v) => setTaxType(v as TaxType)}>
                      <SelectTrigger {...control}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VEHICLE_TAX_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {TAX_TYPE_LABELS[t]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                    <RupiahField
                      id={control.id}
                      value={estimatedAmount}
                      onChange={setEstimatedAmount}
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
                  onClick={() => setUrgensi(u)}
                >
                  {URGENSI_LABELS[u]}
                </Button>
              ))}
            </div>
          </fieldset>
          </OverlayBody>
          <OverlayFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={pending}>
              Batal
            </Button>
            <Button type="submit" disabled={!valid} loading={pending}>
              Kirim Pengajuan
            </Button>
          </OverlayFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
