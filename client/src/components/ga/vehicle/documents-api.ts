/**
 * File helpers for the fleet module (GA documents and inspection photos).
 * Reuses the existing /ga/documents endpoints; no new server API.
 */
import { toast } from 'sonner';
import api from '@/lib/api';

/**
 * Upload a supporting scan (STNK/KIR/polis) for a tax or insurance record:
 * (1) create a GaDocument of the given type, (2) upload the file as version 1.
 * Returns the document id; the caller PATCHes it onto the record.
 */
export async function uploadSupportingDocument(opts: {
  file: File;
  title: string;
  typeCode: string;
  assetId: string;
}): Promise<string> {
  const typesRes = await api.get<Array<{ id: string; code: string }>>('/ga/master/document-types');
  const docType = typesRes.data.find((t) => t.code === opts.typeCode);
  if (!docType) throw new Error(`Tipe dokumen "${opts.typeCode}" tidak ditemukan di Master Data.`);

  const createRes = await api.post('/ga/documents', {
    title: opts.title,
    typeId: docType.id,
    assetId: opts.assetId,
    status: 'ACTIVE',
  });
  const documentId = createRes.data.id as string;

  const fd = new FormData();
  fd.append('file', opts.file);
  await api.post(`/ga/documents/${documentId}/versions`, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return documentId;
}

/**
 * Opens the latest version of a GA document in a new tab. Fetched on click
 * (not with the list) to avoid one request per table row.
 * Resolves false when the document has no uploaded file yet.
 */
export async function openGaDocument(documentId: string, versionId?: string): Promise<boolean> {
  let vid = versionId;
  if (!vid) {
    const doc = await api.get(`/ga/documents/${documentId}`);
    vid = doc.data.versions?.[0]?.id;
  }
  if (!vid) return false;
  const fileRes = await api.get(`/ga/documents/${documentId}/versions/${vid}/file`, { responseType: 'blob' });
  const url = URL.createObjectURL(fileRes.data as Blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return true;
}

/** openGaDocument with user feedback (toasts) for table actions. */
export async function viewDocument(documentId: string, versionId?: string): Promise<void> {
  try {
    const ok = await openGaDocument(documentId, versionId);
    if (!ok) toast.error('Dokumen belum punya file terunggah.');
  } catch {
    toast.error('Gagal membuka dokumen.');
  }
}

/**
 * Inspection photo as a data URL (via the RBAC-protected endpoint), so
 * @react-pdf can embed it without cookies at render time.
 */
export async function fetchInspectionPhotoDataUrl(assetId: string, inspectionId: string, photoId: string): Promise<string> {
  const res = await api.get(`/ga/vehicle/assets/${assetId}/inspections/${inspectionId}/photos/${photoId}/file`, {
    responseType: 'blob',
  });
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gagal membaca file foto.'));
    reader.readAsDataURL(res.data as Blob);
  });
}

/** Triggers a browser download of a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
