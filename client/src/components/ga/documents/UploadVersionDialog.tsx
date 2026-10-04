/**
 * Upload a new PDF version: POST /ga/documents/:id/versions (multipart
 * `file` + optional `notes`). The server numbers it max(versionNo) + 1.
 */
import { useState, type FormEvent } from 'react';
import { FileUp } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field } from '@/components/shared';
import { DOCUMENTS_ENDPOINT, errorMessage, formatFileSize, type GaDocumentRow } from './ga-document-model';

const MAX_PDF_BYTES = 20 * 1024 * 1024;

interface UploadVersionDialogProps {
  doc: Pick<GaDocumentRow, 'id' | 'code' | 'title'> | null;
  onClose: () => void;
  onUploaded: () => void;
}

export function UploadVersionDialog({ doc, onClose, onUploaded }: UploadVersionDialogProps) {
  return (
    <Dialog open={doc !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="sm">
        {/* Keyed body = fresh form per document. */}
        {doc && <UploadForm key={doc.id} doc={doc} onClose={onClose} onUploaded={onUploaded} />}
      </DialogContent>
    </Dialog>
  );
}

function UploadForm({
  doc,
  onClose,
  onUploaded,
}: {
  doc: Pick<GaDocumentRow, 'id' | 'code' | 'title'>;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const pick = (f: File | null) => {
    setError(null);
    if (f && f.type !== 'application/pdf') {
      setFile(null);
      return setError('File harus PDF.');
    }
    if (f && f.size > MAX_PDF_BYTES) {
      setFile(null);
      return setError('Ukuran file maksimal 20 MB.');
    }
    setFile(f);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!file) return setError('Pilih file PDF terlebih dahulu.');
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (notes) fd.append('notes', notes);
      await api.post(`${DOCUMENTS_ENDPOINT}/${doc.id}/versions`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Versi dokumen diunggah.');
      onUploaded();
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'Gagal mengunggah versi.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Unggah Versi Baru</DialogTitle>
        <DialogDescription>
          <span className="num font-mono">{doc.code}</span> — {doc.title}
        </DialogDescription>
      </DialogHeader>
      <Field label="File PDF" required error={error} hint={file ? `${file.name} · ${formatFileSize(file.size)}` : 'PDF, maks 20 MB.'}>
        <Input
          type="file"
          accept="application/pdf"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
          className="h-auto py-1.5 file:mr-3 file:rounded-sm file:border-0 file:bg-primary-subtle file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-primary-subtle-foreground"
        />
      </Field>
      <Field label="Catatan versi">
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="mis. Perpanjangan 2027" autoComplete="off" />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          Batal
        </Button>
        <Button type="submit" loading={saving}>
          <FileUp aria-hidden />
          Unggah
        </Button>
      </DialogFooter>
    </form>
  );
}
