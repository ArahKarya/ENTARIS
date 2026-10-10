/**
 * Create/edit an asset (blank code: the server auto-numbers), then an optional
 * photo upload to /ga/assets/:id/photos.
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, ImagePlus, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { getStatusLabel } from '@/lib/status';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { DateInput, Field } from '@/components/shared';
import { FormNumberInput, FormSection, FormSheet } from '@/components/inventory/master-data-kit';
import { ComboboxField } from '@/components/overlays/ComboboxField';
import {
  ASSET_STATUSES,
  CONDITION_OPTIONS,
  apiErrorMessage,
  photoUrl,
  type AssetPhotoRow,
  type AssetRow,
} from './asset-model';
import { OptionSelect } from './OptionSelect';
import { masterOptions, useGaMaster } from './useGaMaster';
import { picOptions } from './pic-options';
import { useUserOptions } from '../vehicle/vehicle-queries';

const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const PHOTO_MAX_BYTES = 5 * 1024 * 1024;
const STATUS_OPTIONS = ASSET_STATUSES.map((s) => ({ value: s, label: getStatusLabel(s, 'ga_asset') }));

interface FormState {
  code: string;
  name: string;
  categoryId: string;
  branchId: string;
  costCenterId: string;
  picUserId: string;
  serialNumber: string;
  acquisitionDate: string;
  acquisitionCost: string;
  status: string;
  condition: string;
  location: string;
  notes: string;
}

type ErrorKey = 'name' | 'categoryId' | 'branchId' | 'acquisitionCost';

function initialForm(asset: AssetRow | null): FormState {
  return {
    code: asset?.code ?? '',
    name: asset?.name ?? '',
    categoryId: asset?.categoryId ?? '',
    branchId: asset?.branchId ?? '',
    costCenterId: asset?.costCenterId ?? '',
    picUserId: asset?.picUserId ?? asset?.pic?.id ?? '',
    serialNumber: asset?.serialNumber ?? '',
    acquisitionDate: asset?.acquisitionDate ? String(asset.acquisitionDate).slice(0, 10) : '',
    acquisitionCost: asset?.acquisitionCost != null ? String(Number(asset.acquisitionCost)) : '',
    status: asset?.status ?? 'ACTIVE',
    condition: asset?.condition ?? 'GOOD',
    location: asset?.location ?? '',
    notes: asset?.notes ?? '',
  };
}

function validate(f: FormState): Partial<Record<ErrorKey, string>> {
  const errors: Partial<Record<ErrorKey, string>> = {};
  if (!f.name.trim()) errors.name = 'Nama aset wajib diisi.';
  if (!f.categoryId) errors.categoryId = 'Kategori wajib dipilih.';
  if (!f.branchId) errors.branchId = 'Cabang wajib dipilih.';
  if (f.acquisitionCost.trim() && !(Number(f.acquisitionCost) >= 0)) errors.acquisitionCost = 'Nilai tidak boleh negatif.';
  return errors;
}

interface AssetFormSheetProps {
  /** null = create. */
  asset: AssetRow | null;
  onClose: () => void;
  /** Called with the saved asset id. */
  onSaved?: (id: string) => void;
}

export function AssetFormSheet({ asset, onClose, onSaved }: AssetFormSheetProps) {
  const isEdit = !!asset;
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(() => initialForm(asset));
  const [touched, setTouched] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [newPhoto, setNewPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const errors = touched ? validate(form) : {};
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const categories = useGaMaster('asset-categories');
  const branches = useGaMaster('branches');
  const costCenters = useGaMaster('cost-centers');
  const users = useUserOptions('ga-users-pic-picker');

  // Stored photos come from the detail endpoint (the list carries one thumbnail at most).
  const detail = useQuery<{ photos?: AssetPhotoRow[] }>({
    queryKey: ['ga-asset-detail', asset?.id],
    queryFn: async () => (await api.get(`/ga/assets/${asset?.id}`)).data,
    enabled: isEdit,
  });
  const existingPhotos = detail.data?.photos ?? [];

  const invalidatePhotos = (id: string) => {
    queryClient.invalidateQueries({ queryKey: ['ga-asset-detail', id] });
    queryClient.invalidateQueries({ queryKey: ['ga-asset-photos', id] });
  };

  const pickPhoto = (f: File | null) => {
    if (newPhoto) URL.revokeObjectURL(newPhoto.preview);
    setNewPhoto(null);
    setPhotoError(null);
    if (!f) return;
    if (!PHOTO_TYPES.includes(f.type)) return setPhotoError('Format foto harus JPG, PNG, atau WEBP.');
    if (f.size > PHOTO_MAX_BYTES) return setPhotoError('Ukuran foto maksimal 5 MB.');
    setNewPhoto({ file: f, preview: URL.createObjectURL(f) });
  };

  const deletePhoto = useMutation({
    mutationFn: (photoId: string) => api.delete(`/ga/assets/${asset?.id}/photos/${photoId}`),
    onSuccess: () => {
      toast.success('Foto dihapus.');
      if (asset) {
        invalidatePhotos(asset.id);
        queryClient.invalidateQueries({ queryKey: ['ga-assets'] });
      }
    },
    onError: () => toast.error('Gagal menghapus foto.'),
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        code: form.code.trim() || undefined,
        name: form.name.trim(),
        categoryId: form.categoryId,
        branchId: form.branchId,
        costCenterId: form.costCenterId || null,
        picUserId: form.picUserId || null,
        serialNumber: form.serialNumber.trim() || null,
        acquisitionDate: form.acquisitionDate || null,
        acquisitionCost: form.acquisitionCost.trim() ? Number(form.acquisitionCost) : null,
        status: form.status,
        condition: form.condition,
        location: form.location.trim() || null,
        notes: form.notes.trim() || null,
      };
      const res = isEdit ? await api.put(`/ga/assets/${asset.id}`, payload) : await api.post('/ga/assets', payload);
      return (isEdit ? asset.id : res.data?.id) as string | undefined;
    },
    onSuccess: async (savedId) => {
      if (savedId && newPhoto) {
        try {
          const fd = new FormData();
          fd.append('photo', newPhoto.file);
          // Do NOT set Content-Type manually — axios sets the multipart boundary.
          await api.post(`/ga/assets/${savedId}/photos`, fd);
          invalidatePhotos(savedId);
        } catch {
          toast.error('Aset tersimpan, tapi foto gagal diunggah. Coba unggah ulang lewat Edit.');
        }
      }
      toast.success(isEdit ? 'Aset diperbarui.' : 'Aset dibuat.');
      queryClient.invalidateQueries({ queryKey: ['ga-assets'] }); // prefix: register + per-kind lists
      if (savedId) queryClient.invalidateQueries({ queryKey: ['ga-asset-detail', savedId] });
      if (savedId) onSaved?.(savedId);
      onClose();
    },
    onError: (err) => setServerError(apiErrorMessage(err, 'Gagal menyimpan aset.')),
  });

  const submit = () => {
    setTouched(true);
    setServerError(null);
    if (Object.keys(validate(form)).length > 0) return;
    save.mutate();
  };

  return (
    <FormSheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={isEdit ? `Edit aset ${asset.code}` : 'Aset baru'}
      description={isEdit ? asset.name : 'Kode aset dibuat otomatis dari kategori dan cabang bila dikosongkan.'}
      error={serverError}
      saving={save.isPending}
      submitLabel={isEdit ? 'Simpan perubahan' : 'Simpan aset'}
      onSubmit={submit}
    >
      <FormSection title="Identitas">
        <Field label="Nama aset" required error={errors.name}>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} maxLength={200} placeholder="Mis. Timbangan Lantai 3 Ton" />
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Kode" hint={isEdit ? undefined : 'Kosongkan untuk dibuat otomatis.'}>
            <Input value={form.code} onChange={(e) => set('code', e.target.value)} maxLength={100} className="font-mono" placeholder={isEdit ? '' : 'Otomatis'} />
          </Field>
          <Field label="No. seri">
            <Input value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} />
          </Field>
          <Field label="Kategori" required error={errors.categoryId}>
            <OptionSelect
              value={form.categoryId}
              onChange={(v) => set('categoryId', v)}
              options={masterOptions(categories.data, asset?.categoryId)}
              placeholder={categories.isLoading ? 'Memuat…' : 'Pilih kategori'}
            />
          </Field>
          <Field label="Cabang" required error={errors.branchId}>
            <OptionSelect
              value={form.branchId}
              onChange={(v) => set('branchId', v)}
              options={masterOptions(branches.data, asset?.branchId)}
              placeholder={branches.isLoading ? 'Memuat…' : 'Pilih cabang'}
            />
          </Field>
          <Field label="Cost center">
            <OptionSelect
              value={form.costCenterId}
              onChange={(v) => set('costCenterId', v)}
              options={masterOptions(costCenters.data, asset?.costCenterId)}
              noneLabel="Tidak ada"
            />
          </Field>
          <Field label="Lokasi">
            <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Mis. Gudang Bahan Baku" />
          </Field>
          <div className="sm:col-span-2">
            <ComboboxField
              label="Penanggung jawab"
              value={form.picUserId}
              onChange={(v) => set('picUserId', v)}
              options={picOptions(users.data, asset?.pic)}
              placeholder={users.isLoading ? 'Memuat…' : 'Belum ditentukan'}
              hint={
                users.isError
                  ? 'Daftar pengguna tidak bisa dimuat; penanggung jawab saat ini tetap tersimpan.'
                  : 'Untuk kendaraan, penanggung jawab adalah driver.'
              }
            />
          </div>
        </div>
      </FormSection>

      <FormSection title="Status & perolehan">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Status">
            <OptionSelect value={form.status} onChange={(v) => set('status', v)} options={STATUS_OPTIONS} />
          </Field>
          <Field label="Kondisi">
            <OptionSelect value={form.condition} onChange={(v) => set('condition', v)} options={CONDITION_OPTIONS} />
          </Field>
          <Field label="Tanggal perolehan">
            {(control) => <DateInput id={control.id} required={control.required} value={form.acquisitionDate} onChange={(v) => set('acquisitionDate', v)} />}
          </Field>
          <Field label="Nilai perolehan (Rp)" error={errors.acquisitionCost}>
            <FormNumberInput value={form.acquisitionCost} onChange={(e) => set('acquisitionCost', e.target.value)} min={0} className="num text-right" />
          </Field>
        </div>
        <Field label="Catatan">
          <Textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={2} />
        </Field>
      </FormSection>

      <FormSection title="Foto aset">
        {existingPhotos.length > 0 && (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {existingPhotos.map((ph) => (
              <li key={ph.id} className="relative">
                <img src={photoUrl(ph.filePath)} alt={ph.caption ?? `Foto ${form.name}`} className="h-20 w-full rounded-md border border-border object-cover" />
                <button
                  type="button"
                  onClick={() => deletePhoto.mutate(ph.id)}
                  disabled={deletePhoto.isPending}
                  aria-label="Hapus foto"
                  title="Hapus foto"
                  className="absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-md bg-overlay text-white hover:bg-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  <Trash2 className="size-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        {newPhoto ? (
          <div className="flex items-center gap-3">
            <img src={newPhoto.preview} alt="Pratinjau foto baru" className="h-20 rounded-md border border-border object-cover" />
            <div className="min-w-0 text-xs text-muted-foreground">
              <p>Diunggah saat aset disimpan.</p>
              <button type="button" onClick={() => pickPhoto(null)} className="mt-1 inline-flex items-center gap-1 font-medium text-foreground hover:underline">
                <X className="size-3.5" aria-hidden /> Batalkan foto
              </button>
            </div>
          </div>
        ) : (
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-surface-hover focus-within:ring-2 focus-within:ring-ring">
            {existingPhotos.length > 0 ? <ImagePlus className="size-4" aria-hidden /> : <Camera className="size-4" aria-hidden />}
            {existingPhotos.length > 0 ? 'Tambah foto lain' : 'Pilih foto (JPG/PNG/WEBP, maks 5 MB)'}
            <input
              type="file"
              accept={PHOTO_TYPES.join(',')}
              className="sr-only"
              onChange={(e) => {
                pickPhoto(e.target.files?.[0] ?? null);
                e.target.value = '';
              }}
            />
          </label>
        )}
        {photoError && (
          <p role="alert" className="text-xs font-medium text-danger-text">
            {photoError}
          </p>
        )}
      </FormSection>
    </FormSheet>
  );
}
