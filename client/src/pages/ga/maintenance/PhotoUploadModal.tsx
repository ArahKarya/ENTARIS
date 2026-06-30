import { useState } from 'react';
import { X, Loader2, Upload } from 'lucide-react';
import api from '../../../lib/api';
import { toast } from 'sonner';

// Upload a BEFORE/AFTER photo for a work order.
// POSTs multipart/form-data to /ga/maintenance/work-orders/:id/photos with field `photo`.
// Content-Type is left unset so axios injects the correct multipart boundary.

const fieldClass =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5 * 1024 * 1024;

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
  const [type, setType] = useState<'BEFORE' | 'AFTER'>('BEFORE');
  const [caption, setCaption] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pickFile = (f: File | null) => {
    if (!f) {
      setFile(null);
      return;
    }
    if (!ACCEPTED.includes(f.type)) {
      toast.error('Format harus JPG, PNG, atau WEBP.');
      return;
    }
    if (f.size > MAX_BYTES) {
      toast.error('Ukuran file maksimal 5 MB.');
      return;
    }
    setFile(f);
  };

  const submit = async () => {
    if (!file) return toast.error('File foto wajib dipilih.');
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
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-900">Tambah Foto</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded-lg text-gray-400">
            <X size={18} />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className={labelClass}>File Foto * (JPG/PNG/WEBP, maks 5 MB)</label>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
            />
            {file && <p className="mt-1 text-[11px] text-gray-400">{file.name} — {(file.size / 1024).toFixed(0)} KB</p>}
          </div>
          <div>
            <label className={labelClass}>Tipe</label>
            <select className={fieldClass} value={type} onChange={(e) => setType(e.target.value as 'BEFORE' | 'AFTER')}>
              <option value="BEFORE">Sebelum</option>
              <option value="AFTER">Sesudah</option>
            </select>
          </div>
          <div>
            <label className={labelClass}>Keterangan (opsional)</label>
            <input className={fieldClass} value={caption} onChange={(e) => setCaption(e.target.value)} />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg">
              Batal
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-50"
            >
              {submitting ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Unggah
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
