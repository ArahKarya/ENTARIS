// Section foto aset — reusable di halaman detail per-kategori (Kendaraan,
// Gedung & Sewa, Equipment). Foto disimpan per-aset via /ga/assets/:id/photos
// (backend sudah ada sejak awal EAM). Sama pola dengan yang ada di
// GaAssetsPage.tsx, dibungkus jadi komponen agar tidak duplikat 3x.
import { useState } from 'react';
import { Camera, Trash2, X, Loader2, Upload } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { toast } from 'sonner';
import { useTranslation } from 'react-i18next';

interface AssetPhoto {
  id: string;
  filePath: string;
  caption: string | null;
}

interface Props {
  assetId: string;
  canEdit: boolean;
}

export const AssetPhotoSection = ({ assetId, canEdit }: Props) => {
  const { t } = useTranslation('eam');
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const { data: photos = [], isLoading } = useQuery<AssetPhoto[]>({
    queryKey: ['ga-asset-photos', assetId],
    queryFn: async () => (await api.get(`/ga/assets/${assetId}`)).data?.photos ?? [],
    enabled: !!assetId,
  });

  const pickFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      setPreview(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(f.type)) {
      toast.error(t('assetPhotos.format'));
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error(t('assetPhotos.size'));
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!file) return;
      const fd = new FormData();
      fd.append('photo', file);
      // Do NOT set Content-Type manually — axios sets the multipart boundary.
      await api.post(`/ga/assets/${assetId}/photos`, fd);
    },
    onSuccess: () => {
      toast.success(t('assetPhotos.uploaded'));
      setFile(null);
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ['ga-asset-photos', assetId] });
    },
    onError: (e: unknown) =>
      toast.error((e as { response?: { data?: { error?: string } } }).response?.data?.error || t('assetPhotos.uploadFailed')),
  });

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => api.delete(`/ga/assets/${assetId}/photos/${photoId}`),
    onSuccess: () => {
      toast.success(t('assetPhotos.deleted'));
      queryClient.invalidateQueries({ queryKey: ['ga-asset-photos', assetId] });
    },
    onError: () => toast.error(t('assetPhotos.deleteFailed')),
  });

  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex min-h-12 items-center justify-between border-b border-border px-4 py-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Camera className="size-4 text-muted-foreground" aria-hidden /> {t('assetPhotos.title')}
        </h2>
        {photos.length > 0 && <span className="num text-xs text-muted-foreground">{t('assetPhotos.count', { count: photos.length })}</span>}
      </div>
      <div className="p-4">

      {isLoading ? (
        <div className="py-4 text-center"><Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" aria-label={t('assetPhotos.loading')} /></div>
      ) : (
        <>
          {photos.length > 0 && (
            <ul className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {photos.map((ph) => (
                <li key={ph.id} className="relative">
                  <img
                    src={`/uploads/${ph.filePath}`}
                    alt={ph.caption ?? t('assetPhotos.alt')}
                    className="h-24 w-full rounded-md border border-border object-cover"
                  />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(ph.id)}
                      title={t('assetPhotos.delete')}
                      aria-label={t('assetPhotos.delete')}
                      className="absolute right-1 top-1 inline-flex size-7 items-center justify-center rounded-md bg-overlay text-white hover:bg-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}

          {photos.length === 0 && !file && (
            <p className="mb-3 text-sm text-muted-foreground">{t('assetPhotos.empty')}</p>
          )}

          {canEdit && (
            preview ? (
              <div className="flex items-center gap-3">
                <div className="relative inline-block">
                  <img src={preview} alt={t('assetPhotos.preview')} className="h-20 rounded-md border border-border object-cover" />
                  <button
                    type="button"
                    onClick={() => pickFile(null)}
                    title={t('shared.cancel')}
                    aria-label={t('assetPhotos.removePhoto')}
                    className="absolute -right-1.5 -top-1.5 rounded-sm bg-foreground p-0.5 text-background hover:bg-danger hover:text-danger-foreground"
                  >
                    <X size={12} aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending}
                  className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[var(--shadow-1)] hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                >
                  {uploadMutation.isPending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />} {t('assetPhotos.upload')}
                </button>
              </div>
            ) : (
              <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border-strong px-3 py-2 text-sm text-muted-foreground transition-colors hover:border-primary hover:bg-surface-hover focus-within:ring-2 focus-within:ring-ring">
                <Camera size={14} aria-hidden />
                {photos.length > 0 ? t('assetPhotos.addAnother') : t('assetPhotos.pick')}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )
          )}
        </>
      )}
      </div>
    </section>
  );
};

export default AssetPhotoSection;
