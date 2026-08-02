import { useState } from 'react';
import { X, Loader2, Wrench, ReceiptText } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../../../lib/api';
import SearchableSelect from '../../../components/SearchableSelect';
import RupiahInput from '../../../components/RupiahInput';
import {
  VEHICLE_SERVICE_TYPES,
  SERVICE_TYPE_LABELS,
  VEHICLE_TAX_TYPES,
  TAX_TYPE_LABELS,
  URGENSI_LABELS,
  reqFieldClass as fieldClass,
  reqLabelClass as labelClass,
  apiErrorMessage,
  type AssetOpt,
  type ServiceType,
  type TaxType,
  type Urgensi,
} from './types';

type Mode = 'SERVICE' | 'TAX';

/**
 * Modal pengajuan terpusat. User pilih kendaraan lewat dropdown (Opsi A),
 * tak perlu masuk ke halaman kendaraan dulu.
 */
export function CreateRequestModal({ mode, onClose }: { mode: Mode; onClose: () => void }) {
  const queryClient = useQueryClient();
  const isService = mode === 'SERVICE';

  const { data: assets = [], isLoading: loadingAssets } = useQuery<AssetOpt[]>({
    queryKey: ['ga-vehicle-assets-req'],
    queryFn: async () => (await api.get('/ga/vehicle/assets', { params: { limit: 500 } })).data,
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

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            {isService ? <Wrench size={18} className="text-teal-600" /> : <ReceiptText size={18} className="text-indigo-600" />}
            {isService ? 'Pengajuan Servis Kendaraan' : 'Pengajuan Pajak / STNK / KIR'}
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700 rounded">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4">
          <div>
            <label className={labelClass}>Kendaraan *</label>
            <SearchableSelect
              options={assetOptions}
              value={assetId}
              onChange={setAssetId}
              placeholder={loadingAssets ? 'Memuat…' : '— Pilih kendaraan —'}
              searchable
              aria-label="Kendaraan"
            />
          </div>

          {isService ? (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Jenis Servis *</label>
                  <SearchableSelect
                    options={VEHICLE_SERVICE_TYPES.map((t) => ({ value: t, label: SERVICE_TYPE_LABELS[t] }))}
                    value={jenisService}
                    onChange={(v) => setJenisService(v as ServiceType)}
                    allowClear={false}
                    aria-label="Jenis servis"
                  />
                </div>
                <div>
                  <label className={labelClass}>Odometer (km)</label>
                  <input
                    type="number"
                    min={0}
                    value={odometer}
                    onChange={(e) => setOdometer(e.target.value)}
                    className={fieldClass}
                    placeholder="opsional"
                  />
                </div>
              </div>
              <div>
                <label className={labelClass}>Keluhan / Deskripsi *</label>
                <textarea
                  rows={3}
                  value={deskripsi}
                  onChange={(e) => setDeskripsi(e.target.value)}
                  className={fieldClass}
                  placeholder="Contoh: rem depan bunyi, minta ganti kampas."
                />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Jenis *</label>
                  <SearchableSelect
                    options={VEHICLE_TAX_TYPES.map((t) => ({ value: t, label: TAX_TYPE_LABELS[t] }))}
                    value={taxType}
                    onChange={(v) => setTaxType(v as TaxType)}
                    allowClear={false}
                    aria-label="Jenis pajak"
                  />
                </div>
                <div>
                  <label className={labelClass}>Tahun Periode *</label>
                  <input
                    type="number"
                    min={2000}
                    max={2100}
                    value={periodYear}
                    onChange={(e) => setPeriodYear(e.target.value)}
                    className={fieldClass}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Jatuh Tempo *</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>Estimasi Biaya</label>
                  <RupiahInput value={estimatedAmount} onChange={setEstimatedAmount} className={fieldClass} />
                </div>
              </div>
              <div>
                <label className={labelClass}>Catatan</label>
                <textarea
                  rows={2}
                  value={deskripsi}
                  onChange={(e) => setDeskripsi(e.target.value)}
                  className={fieldClass}
                  placeholder="opsional"
                />
              </div>
            </>
          )}

          <div>
            <label className={labelClass}>Urgensi</label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(URGENSI_LABELS) as Urgensi[]).map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => setUrgensi(u)}
                  className={`px-3 py-1.5 text-xs rounded-full font-medium ${
                    urgensi === u ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {URGENSI_LABELS[u]}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={!valid || mutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-50 rounded-lg"
            >
              {mutation.isPending && <Loader2 size={14} className="animate-spin" />}
              Kirim Pengajuan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
