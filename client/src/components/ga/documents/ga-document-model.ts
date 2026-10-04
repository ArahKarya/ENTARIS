/**
 * Types, constants and pure helpers for Dokumen & Sertifikat (/ga/documents):
 * legal documents / certificates with versioned PDF uploads and expiry
 * tracking. Endpoint base: /ga/documents.
 */
import { toast } from 'sonner';
import api from '@/lib/api';

export type GaDocStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'ARCHIVED';
/** Server-derived on paged rows (services/gaDocumentList). */
export type GaExpiryState = 'expired' | 'expiring' | 'valid';

export interface GaDocTypeOption {
  id: string;
  code: string;
  name: string;
  category?: string | null;
}

export interface GaAssetOption {
  id: string;
  code: string;
  name: string;
}

export interface GaDocVersion {
  id: string;
  versionNo: number;
  fileSize: number;
  notes?: string | null;
  createdAt?: string;
}

export interface GaDocumentRow {
  id: string;
  code: string;
  title: string;
  status: GaDocStatus;
  typeId: string;
  assetId?: string | null;
  issuedBy?: string | null;
  issuedNumber?: string | null;
  effectiveDate?: string | null;
  expiryDate?: string | null;
  daysToExpiry?: number | null;
  expiryState?: GaExpiryState | null;
  type?: { code: string; name: string; category?: string | null } | null;
  asset?: { id: string; code: string; name: string } | null;
  versions?: GaDocVersion[];
}

export interface GaDocumentSummary {
  count: number;
  expiredCount: number;
  expiringCount: number;
  validCount: number;
}

export const DOCUMENTS_ENDPOINT = '/ga/documents';
export const GA_DOCUMENTS_KEY = 'ga-documents';
export const DOC_FILTER_KEYS = ['typeId', 'assetId', 'status', 'expiry'] as const;
/** URL param of the detail sheet (?doc=<id>). */
export const DOC_PARAM = 'doc';
/** Same window as the server ("segera kedaluwarsa"). */
export const EXPIRING_SOON_DAYS = 30;

export const DOC_STATUSES: readonly GaDocStatus[] = ['ACTIVE', 'EXPIRED', 'REVOKED', 'ARCHIVED'];

export const EXPIRY_LABEL: Record<GaExpiryState, string> = {
  expired: 'Kedaluwarsa',
  expiring: 'Segera kedaluwarsa',
  valid: 'Berlaku',
};

export const EXPIRY_FILTER = [
  { value: 'expired', label: 'Kedaluwarsa' },
  { value: 'expiring', label: `Segera kedaluwarsa (${EXPIRING_SOON_DAYS} hari)` },
  { value: 'valid', label: 'Berlaku' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

/** Local calendar date (YYYY-MM-DD) of an instant. */
function localDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Whole calendar days from today until the expiry date (0 = expires today,
 * negative = past). The date is read as stored (UTC midnight of its day).
 */
export function daysUntil(expiryDate: string, now: Date = new Date()): number {
  const expiryDay = expiryDate.slice(0, 10);
  const today = localDate(now);
  return Math.round((Date.parse(`${expiryDay}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY_MS);
}

/**
 * Client mirror of the server rule, for the detail sheet (the detail endpoint
 * has no `expiryState`): EXPIRED status or a past date → expired; ACTIVE and
 * due within 30 days → expiring; other ACTIVE → valid; revoked/archived → null.
 */
export function deriveExpiryState(
  doc: Pick<GaDocumentRow, 'status' | 'expiryDate'>,
  now: Date = new Date(),
): GaExpiryState | null {
  if (doc.status === 'EXPIRED') return 'expired';
  if (doc.status !== 'ACTIVE') return null;
  if (!doc.expiryDate) return 'valid';
  const days = daysUntil(doc.expiryDate, now);
  if (days < 0) return 'expired';
  if (days <= EXPIRING_SOON_DAYS) return 'expiring';
  return 'valid';
}

/** "12 hari lagi" / "hari ini" / "lewat 5 hari". */
export function expiryDistance(expiryDate: string, now: Date = new Date()): string {
  const days = daysUntil(expiryDate, now);
  if (days === 0) return 'hari ini';
  if (days > 0) return `${days} hari lagi`;
  return `lewat ${Math.abs(days)} hari`;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/** YYYY-MM-DD for date inputs from an API timestamp. */
export const toDateInput = (v?: string | null): string => (v ? v.slice(0, 10) : '');

export function errorMessage(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: unknown } } })?.response?.data;
  return typeof data?.error === 'string' ? data.error : fallback;
}

/** Downloads one version's PDF (same endpoint and filename as before). */
export async function downloadVersion(doc: Pick<GaDocumentRow, 'id' | 'code'>, version: GaDocVersion): Promise<void> {
  try {
    const res = await api.get(`${DOCUMENTS_ENDPOINT}/${doc.id}/versions/${version.id}/file`, { responseType: 'blob' });
    const url = URL.createObjectURL(res.data as Blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${doc.code}-v${version.versionNo}.pdf`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch {
    toast.error('Gagal mengunduh file dokumen.');
  }
}
