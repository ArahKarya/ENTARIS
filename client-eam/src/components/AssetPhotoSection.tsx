// Section foto aset — reusable di halaman detail per-kategori (Kendaraan,
// Gedung & Sewa, Equipment). Foto disimpan per-aset via /ga/assets/:id/photos
// (backend sudah ada sejak awal EAM). Sama pola dengan yang ada di
// GaAssetsPage.tsx, dibungkus jadi komponen agar tidak duplikat 3x.
import { useState } from 'react';
import { Camera, Trash2, X, Loader2, Upload } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import { toast } from 'sonner';

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
      toast.error('Format foto harus JPG, PNG, atau WEBP.');
      return;
    }
    if (f.size > 5 * 1024 * 1024) {
      toast.error('Ukuran foto maksimal 5 MB.');
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
      toast.success('Foto diunggah.');
      setFile(null);
      setPreview(null);
      queryClient.invalidateQueries({ queryKey: ['ga-asset-photos', assetId] });
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal mengunggah foto.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (photoId: string) => api.delete(`/ga/assets/${assetId}/photos/${photoId}`),
    onSuccess: () => {
      toast.success('Foto dihapus.');
      queryClient.invalidateQueries({ queryKey: ['ga-asset-photos', assetId] });
    },
    onError: () => toast.error('Gagal menghapus foto.'),
  });

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
          <Camera size={16} className="text-teal-600" /> Foto Aset
        </h2>
      </div>

      {isLoading ? (
        <div className="py-4 text-center"><Loader2 className="w-4 h-4 animate-spin mx-auto text-gray-300" /></div>
      ) : (
        <>
          {photos.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-3">
              {photos.map((ph) => (
                <div key={ph.id} className="relative group">
                  <img
                    src={`/uploads/${ph.filePath}`}
                    alt={ph.caption ?? 'Foto aset'}
                    className="w-full h-24 object-cover rounded-lg border border-gray-200"
                  />
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => deleteMutation.mutate(ph.id)}
                      title="Hapus foto"
                      className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {photos.length === 0 && !file && (
            <p className="text-xs text-gray-400 mb-3">Belum ada foto.</p>
          )}

          {canEdit && (
            preview ? (
              <div className="flex items-center gap-3">
                <div className="relative inline-block">
                  <img src={preview} alt="Preview" className="h-20 rounded-lg border border-gray-200 object-cover" />
                  <button
                    type="button"
                    onClick={() => pickFile(null)}
                    title="Batalkan"
                    className="absolute -top-1.5 -right-1.5 p-0.5 rounded-full bg-gray-700 text-white hover:bg-red-600"
                  >
                    <X size={12} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => uploadMutation.mutate()}
                  disabled={uploadMutation.isPending}
                  className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
                >
                  {uploadMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Unggah
                </button>
              </div>
            ) : (
              <label className="flex items-center gap-2 w-fit px-3 py-2 text-sm border border-dashed border-gray-300 rounded-lg cursor-pointer text-gray-500 hover:bg-gray-50 hover:border-teal-400">
                <Camera size={14} className="text-gray-400" />
                {photos.length > 0 ? 'Tambah foto lain' : 'Pilih foto (JPG/PNG/WEBP, maks 5 MB)'}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
              </label>
            )
          )}
        </>
      )}
    </div>
  );
};

export default AssetPhotoSection;
