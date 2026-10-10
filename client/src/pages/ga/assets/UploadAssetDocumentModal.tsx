import { useState } from 'react';
import { AlertCircle, Upload } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../../lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field } from '@/components/shared/field';
import { DateInput } from '@/components/shared/date-input';
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

export const UploadAssetDocumentModal = ({ assetId, assetLabel, onClose }: Props) => {
  const queryClient = useQueryClient();
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState<{ title?: string; typeId?: string; file?: string }>({});

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
      toast.success('Dokumen dan file diunggah.');
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
    const next = {
      title: title.trim() ? undefined : 'Judul dokumen wajib diisi.',
      typeId: typeId ? undefined : 'Tipe dokumen wajib dipilih.',
      file: file ? undefined : 'File dokumen (PDF) wajib diunggah.',
    };
    setFieldErrors(next);
    if (next.title || next.typeId || next.file) return;
    mutation.mutate();
  };

  const busy = mutation.isPending;

  return (
    <Dialog open onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg" hideClose={busy}>
        <DialogHeader className="border-b border-border px-6 py-4">
          <DialogTitle>Tambah Dokumen Aset</DialogTitle>
          <DialogDescription>{assetLabel}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
            {error && (
              <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/40 bg-danger-subtle px-3 py-2 text-sm text-danger-text">
                <AlertCircle size={15} aria-hidden /> {error}
              </div>
            )}

            <Field label="Judul" required error={fieldErrors.title}>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="mis. Sertifikat, Manual, BPKB, Faktur"
              />
            </Field>

            <Field label="Tipe Dokumen" required error={fieldErrors.typeId}>
              {(control) => (
                <Select value={typeId} onValueChange={setTypeId}>
                  <SelectTrigger {...control}>
                    <SelectValue placeholder="Pilih tipe dokumen" />
                  </SelectTrigger>
                  <SelectContent>
                    {docTypes.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="No. Dokumen">
                <Input value={issuedNumber} onChange={(e) => setIssuedNumber(e.target.value)} />
              </Field>
              <Field label="Diterbitkan oleh">
                <Input value={issuedBy} onChange={(e) => setIssuedBy(e.target.value)} />
              </Field>
              <Field label="Tgl Berlaku">
                {(c) => <DateInput id={c.id} value={effectiveDate} onChange={setEffectiveDate} />}
              </Field>
              <Field label="Tgl Kadaluarsa">
                {(c) => <DateInput id={c.id} value={expiryDate} onChange={setExpiryDate} />}
              </Field>
            </div>

            <Field label="File (PDF)" required hint="Format PDF, maksimal 20 MB." error={fieldErrors.file}>
              <Input type="file" accept="application/pdf" onChange={handleFile} />
            </Field>
          </div>

          <DialogFooter className="border-t border-border px-6 py-3">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Batal
            </Button>
            <Button type="submit" loading={busy}>
              {!busy && <Upload aria-hidden />}
              {busy ? 'Mengunggah…' : 'Unggah'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default UploadAssetDocumentModal;
