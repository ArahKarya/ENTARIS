/**
 * Read-only helpers around /approvals/requests for the Stok & Produksi
 * screens (production dashboard queue panel, approval view header). The
 * cache key and filtering match components/ApprovalPanel.tsx, so both share
 * one cached response per status.
 */
import api from '@/lib/api';

export interface ApprovalQueueRequest {
  id: string;
  documentType: string;
  status: string;
  amount: number | string | null;
  requestedBy: string;
  requester: { fullName: string; role: string };
  createdAt: string;
}

export type ApprovalQueueStatus = 'Pending' | 'NeedsRevision' | 'Approved' | 'Rejected';

/** The server returns at most this many requests per status. */
export const APPROVAL_PAGE_CAP = 100;

/** Same key ApprovalPanel uses: ['approval-requests', documentType ?? 'all', status]. */
export const approvalRequestsKey = (documentType: string | undefined, status: ApprovalQueueStatus) =>
  ['approval-requests', documentType ?? 'all', status] as const;

/** GET /approvals/requests?status=… (Admins see all, others their own), optionally one document type. */
export async function fetchApprovalRequests(
  documentType: string | undefined,
  status: ApprovalQueueStatus,
): Promise<ApprovalQueueRequest[]> {
  const all: unknown = (await api.get('/approvals/requests', { params: { status } })).data;
  const arr = Array.isArray(all) ? (all as ApprovalQueueRequest[]) : [];
  return documentType ? arr.filter((r) => r.documentType === documentType) : arr;
}

/** "12" or "100+" when the server cap was hit; "" while unknown. */
export const formatQueueCount = (n: number | undefined): string =>
  n === undefined ? '' : n >= APPROVAL_PAGE_CAP ? `${APPROVAL_PAGE_CAP}+` : String(n);

/** Whole days a request has waited. */
export function waitingDays(createdAt: string, now: Date = new Date()): number {
  const t = new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86_400_000));
}

/** Oldest waiting time in a queue (0 when empty). */
export const oldestWaitingDays = (rows: readonly Pick<ApprovalQueueRequest, 'createdAt'>[], now: Date = new Date()): number =>
  rows.reduce((max, r) => Math.max(max, waitingDays(r.createdAt, now)), 0);
