import { useState } from 'react';
import { X, Loader2, AlertCircle, Upload } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import SearchableSelect from '../../../components/SearchableSelect';
import { toast } from 'sonner';

// Modal buat dokumen baru untuk sebuah aset lalu unggah file versi pertama.
// Alur 2 langkah: (a) POST /ga/documents {..., assetId} -> dapat doc.id,
// (b) POST /ga/documents/<id>/versions FormData 'file' -> upload file.
// Backend (server/src/routes/ga/documents.ts) hanya menerima PDF (fileFilter
// application/pdf) dengan batas 20 MB, jadi FE membatasi ke PDF <= 20 MB.

const MAX_FILE_BYTES = 20 * 1024 * 1024; // 20 MB — samakan dengan multer backend

interface DocType {
  id: string;
  code: string;
  name: string;
}

interface Props {
  assetId: string;
  assetLabel: string;
  onClose: () => void;
}

const fieldClass =
  'w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500';
const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

export const UploadAssetDocumentModal = ({ assetId, assetLabel, onClose }: Props) => {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');

  const [title, setTitle] = useState('');
  const [typeId, setTypeId] = useState('');
  const [issuedNumber, setIssuedNumber] = useState('');
  const [issuedBy, setIssuedBy] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const { data: docTypes = [] } = useQuery<DocType[]>({
    queryKey: ['ga-document-types'],
    queryFn: async () => (await api.get('/ga/master/document-types')).data,
  });

  const typeOptions = docTypes.map((t) => ({ value: t.id, label: t.name }));

  const mutation = useMutation({
    mutationFn: async () => {
      // Langkah (a): buat dokumen tertaut aset.
      const createRes = await api.post('/ga/documents', {
        title: title.trim(),
        typeId,
        assetId,
        issuedNumber: issuedNumber.trim() || null,
        issuedBy: issuedBy.trim() || null,
        effectiveDate: effectiveDate || null,
        expiryDate: expiryDate || null,
      });
      const docId: string = createRes.data?.id;
      if (!docId) throw new Error('Dokumen dibuat tetapi ID tidak diterima.');

      // Langkah (b): unggah file versi pertama. FormData 'file' — jangan set
      // Content-Type manual agar boundary multipart benar.
      try {
        const fd = new FormData();
        fd.append('file', file as File);
        await api.post(`/ga/documents/${docId}/versions`, fd);
      } catch (uploadErr) {
        // Dokumen sudah dibuat namun file gagal — beri tahu jelas agar user
        // bisa mengunggah ulang lewat drawer.
        const e = uploadErr as { response?: { data?: { error?: string } } };
        throw new Error(
          e.response?.data?.error ||
            'Dokumen dibuat tetapi file gagal diunggah. Buka dokumen dan unggah ulang filenya.',
        );
      }
    },
    onSuccess: () => {
      toast.success('Dokumen dan file berhasil diunggah.');
      queryClient.invalidateQueries({ queryKey: ['ga-asset-documents', assetId] });
      onClose();
    },
    onError: (err: unknown) => {
      const e = err as { response?: { data?: { error?: string } }; message?: string };
      setError(e.response?.data?.error || e.message || 'Gagal menyimpan dokumen.');
    },
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    if (f && f.size > MAX_FILE_BYTES) {
      setError('Ukuran file melebihi 20 MB.');
      setFile(null);
      e.target.value = '';
      return;
    }
    setError('');
    setFile(f);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!title.trim()) return setError('Judul dokumen wajib diisi.');
    if (!typeId) return setError('Tipe dokumen wajib dipilih.');
    if (!file) return setError('File dokumen (PDF) wajib diunggah.');
    mutation.mutate();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Tambah Dokumen Aset</h2>
            <p className="text-[11px] text-gray-400 mt-0.5">{assetLabel}</p>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded text-gray-400">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle size={15} /> {error}
            </div>
          )}

          <div>
            <label className={labelClass}>
              Judul <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="mis. Sertifikat, Manual, BPKB, Faktur"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>
              Tipe Dokumen <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              options={typeOptions}
              value={typeId}
              onChange={setTypeId}
              placeholder="— Pilih tipe dokumen —"
              allowClear={false}
              aria-label="Tipe dokumen"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>No. Dokumen</label>
              <input
                type="text"
                value={issuedNumber}
                onChange={(e) => setIssuedNumber(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Diterbitkan oleh</label>
              <input
                type="text"
                value={issuedBy}
                onChange={(e) => setIssuedBy(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Tgl Berlaku</label>
              <input
                type="date"
                value={effectiveDate}
                onChange={(e) => setEffectiveDate(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Tgl Kadaluarsa</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className={fieldClass}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>
              File (PDF) <span className="text-red-500">*</span>
            </label>
            <input
              type="file"
              accept="application/pdf"
              onChange={handleFile}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-2 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-teal-50 file:text-teal-700 hover:file:bg-teal-100"
            />
            <p className="text-[11px] text-gray-400 mt-1">Format PDF, maksimal 20 MB.</p>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="btn-primary bg-teal-600 hover:bg-teal-700 disabled:opacity-60"
            >
              {mutation.isPending ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
              Unggah
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default UploadAssetDocumentModal;
