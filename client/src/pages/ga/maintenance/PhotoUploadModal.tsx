import { useState } from 'react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared';
import { FormModal } from '@/components/ga/maintenance/form-modal';

// Upload a BEFORE/AFTER photo for a work order.
// POSTs multipart/form-data to /ga/maintenance/work-orders/:id/photos with field `photo`.
// Content-Type is left unset so axios injects the correct multipart boundary.

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

type PhotoType = 'BEFORE' | 'AFTER';
const PHOTO_TYPES: Array<{ value: PhotoType; label: string }> = [
  { value: 'BEFORE', label: 'Sebelum' },
  { value: 'AFTER', label: 'Sesudah' },
];

export const PhotoUploadModal = ({
  id,
  onClose,
  onDone,
}: {
  id: string;
  onClose: () => void;
  onDone: () => void;
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | undefined>();
  const [type, setType] = useState<PhotoType>('BEFORE');
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pickFile = (f: File | null) => {
    setFileError(undefined);
    if (!f) {
      setFile(null);
      return;
    }
    if (!ACCEPTED.includes(f.type)) {
      setFile(null);
      setFileError('Format harus JPG, PNG, atau WEBP.');
      return;
    }
    if (f.size > MAX_BYTES) {
      setFile(null);
      setFileError('Ukuran file maksimal 5 MB.');
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    if (!file) {
      setFileError('File foto wajib dipilih.');
      return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('photo', file);
      fd.append('type', type);
      if (caption.trim()) fd.append('caption', caption.trim());
      // Do NOT set Content-Type manually — axios sets the multipart boundary.
      await api.post(`/ga/maintenance/work-orders/${id}/photos`, fd);
      toast.success('Foto diunggah.');
      onDone();
      onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      toast.error(msg || 'Gagal mengunggah foto.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <FormModal title="Tambah Foto" onClose={onClose} onSubmit={submit} submitLabel="Unggah" submitting={submitting}>
      <Field label="File foto" required hint="JPG, PNG, atau WEBP, maks. 5 MB." error={fileError}>
        <Input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          className="h-auto py-1.5 file:mr-3 file:rounded-sm file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-sm file:font-medium file:text-secondary-foreground"
        />
      </Field>
      {file && (
        <p className="-mt-2 text-xs text-muted-foreground">
          {file.name} · {(file.size / 1024).toFixed(0)} KB
        </p>
      )}
      <fieldset className="flex flex-col gap-1.5">
        <legend className="mb-1.5 text-sm font-medium text-foreground">Tipe</legend>
        <div className="flex gap-4">
          {PHOTO_TYPES.map((t) => (
            <label key={t.value} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="photo-type"
                value={t.value}
                checked={type === t.value}
                onChange={() => setType(t.value)}
                className="size-4 accent-[var(--primary)]"
              />
              {t.label}
            </label>
          ))}
        </div>
      </fieldset>
      <Field label="Keterangan" hint="Opsional">
        <Input value={caption} onChange={(e) => setCaption(e.target.value)} />
      </Field>
    </FormModal>
  );
};
