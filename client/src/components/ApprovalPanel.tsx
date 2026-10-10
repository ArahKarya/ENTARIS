import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Check, X, Eye, Pencil, FileText } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { cap } from '../lib/permissions';
import { ApprovalDetailDialog } from './approvals/ApprovalDetailDialog';
import { fmtDate, fmtNum, approvalTypeLabel, approvalLabels, isAiToolApproval, isEditApprovalType } from './approvals/approval-utils';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, LoadingState, StatusBadge } from '@/components/shared';

export interface ApprovalRequest {
  id: string;
  documentType: string;
  documentId: string | null;
  documentNumber: string | null;
  status: string;
  amount: number | null;
  payload?: any;
  notes: string | null;
  requestedBy: string;
  requester: { fullName: string; role: string };
  approver?: { fullName: string } | null;
  rejecter?: { fullName: string } | null;
  decidedAt: string | null;
  createdAt: string;
}

const STATUS_TABS = [
  { key: 'Pending', label: 'Menunggu' },
  { key: 'Approved', label: 'Disetujui' },
  { key: 'Rejected', label: 'Ditolak' },
  { key: 'NeedsRevision', label: 'Perlu Revisi' },
] as const;
type StatusKey = typeof STATUS_TABS[number]['key'];
const labelOf = (s: string) => STATUS_TABS.find((t) => t.key === s)?.label ?? s;

interface Props {
  documentType?: string | string[]; // undefined = semua tipe
  onResubmit?: (req: ApprovalRequest) => void;
  onViewDocument?: (req: ApprovalRequest) => void;
  // Deep-link dari notifikasi: id pengajuan yg langsung dibuka detailnya.
  focusRequestId?: string;
  onFocusHandled?: () => void;
}

/**
 * Reusable approval panel. Decisions need cap approval.decide; the requester can
 * edit and resubmit a request that needs revision.
 */
export default function ApprovalPanel({ documentType, onResubmit, onViewDocument, focusRequestId, onFocusHandled }: Props) {
  const qc = useQueryClient();
  const isAdmin = cap('approval.decide');
  const currentUserId = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null')?.id ?? null; } catch { return null; }
  }, []);

  const [status, setStatus] = useState<StatusKey>('Pending');
  const [detailReq, setDetailReq] = useState<ApprovalRequest | null>(null);
  const [reasonModal, setReasonModal] = useState<{ mode: 'reject' | 'revision'; id: string } | null>(null);

  // Detail pendukung dialog: STT sumber per baris + lampiran pengajuan & STT.
  const { data: detailCtx, isLoading: detailCtxLoading } = useQuery<any>({
    queryKey: ['approval-request-context', detailReq?.id],
    queryFn: async () => (await api.get(`/approvals/requests/${detailReq!.id}/context`)).data,
    enabled: !!detailReq && !isAiToolApproval(detailReq.documentType),
    staleTime: 30 * 1000,
  });

  // Deep-link: ambil pengajuan spesifik & buka detailnya langsung (sekali saja).
  const focusHandledRef = useRef<string | null>(null);
  const { data: focusReq } = useQuery<ApprovalRequest>({
    queryKey: ['approval-request', focusRequestId],
    queryFn: async () => (await api.get(`/approvals/requests/${focusRequestId}`)).data,
    enabled: !!focusRequestId && focusHandledRef.current !== focusRequestId,
    retry: false,
  });
  useEffect(() => {
    if (focusReq && focusRequestId && focusHandledRef.current !== focusRequestId) {
      focusHandledRef.current = focusRequestId;
      setStatus((focusReq.status as StatusKey) ?? 'Pending');
      setDetailReq(focusReq);
      onFocusHandled?.();
    }
  }, [focusReq, focusRequestId, onFocusHandled]);

  const { data: requests = [], isLoading } = useQuery<ApprovalRequest[]>({
    queryKey: ['approval-requests', Array.isArray(documentType) ? documentType.join('+') : documentType ?? 'all', status],
    queryFn: async () => {
      const all: ApprovalRequest[] = (await api.get('/approvals/requests', { params: { status } })).data;
      const arr = Array.isArray(all) ? all : [];
      const types = documentType ? ([] as string[]).concat(documentType) : null;
      return types ? arr.filter((r) => types.includes(r.documentType)) : arr;
    },
    refetchInterval: 30000,
  });

  // Party and item names come from the context endpoint (resolved server-side from payload ids),
  // so the dialog does not depend on capped client-side lookup lists.
  const { partyName, itemName, itemUnit } = approvalLabels(detailCtx, detailCtxLoading);

  // Name maps untuk perkaya detail (gudang, mesin) - payload simpan id.
  const { data: warehouseMap = {} } = useQuery<Record<string, string>>({
    queryKey: ['warehouses-namemap'],
    queryFn: async () => {
      const raw = (await api.get('/warehouses')).data;
      const list: any[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
      const m: Record<string, string> = {};
      for (const w of list) m[w.id] = w.code ? `${w.code} · ${w.name}` : w.name;
      return m;
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: machineMap = {} } = useQuery<Record<string, string>>({
    queryKey: ['machines-namemap'],
    queryFn: async () => {
      const raw = (await api.get('/inventory/machines')).data;
      const list: any[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
      const m: Record<string, string> = {};
      for (const mc of list) m[mc.id] = mc.code ? `${mc.code} · ${mc.name}` : mc.name;
      return m;
    },
    staleTime: 5 * 60 * 1000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['approval-requests'] });
    qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
    qc.invalidateQueries({ queryKey: ['production-runs'] });
    qc.invalidateQueries({ queryKey: ['inventory-items'] });
    qc.invalidateQueries({ queryKey: ['stock-movements'] });
  };

  const approveMut = useMutation({
    mutationFn: async (id: string) => (await api.post(`/approvals/requests/${id}/approve`, { notes: '' })).data,
    onSuccess: (data: any) => {
      toast.success(data?.createdDocument ? `Disetujui. ${data.createdDocument.number} dibuat.` : 'Disetujui.');
      invalidateAll();
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal approve.'),
  });

  const rejectMut = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => (await api.post(`/approvals/requests/${id}/reject`, { notes })).data,
    onSuccess: () => { toast.success('Pengajuan ditolak.'); invalidateAll(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal reject.'),
  });

  const revisionMut = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => (await api.post(`/approvals/requests/${id}/request-revision`, { notes })).data,
    onSuccess: () => { toast.success('Dikembalikan ke staff untuk revisi.'); invalidateAll(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal minta revisi.'),
  });

  const submitReason = (txt: string) => {
    if (!reasonModal) return;
    if (reasonModal.mode === 'reject') rejectMut.mutate({ id: reasonModal.id, notes: txt });
    else revisionMut.mutate({ id: reasonModal.id, notes: txt });
    setReasonModal(null); setDetailReq(null);
  };

  const busy = approveMut.isPending || rejectMut.isPending || revisionMut.isPending;

  return (
    <div className="space-y-3">
      {/* Status filter (segmented) */}
      <div
        role="group"
        aria-label="Filter status pengajuan"
        className="grid w-full grid-cols-4 gap-1 rounded-md bg-muted p-1 text-muted-foreground sm:inline-flex sm:w-auto"
      >
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            aria-pressed={status === t.key}
            onClick={() => setStatus(t.key)}
            className={cn(
              'inline-flex h-7 items-center justify-center rounded-sm px-1.5 text-[13px] font-medium whitespace-nowrap transition-colors hover:text-foreground sm:px-3 sm:text-sm',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              status === t.key && 'bg-card text-foreground shadow-[var(--shadow-1)]',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <LoadingState className="rounded-lg border border-border bg-card py-10" label="Memuat pengajuan…" />
      ) : requests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card px-4 py-10 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Clock className="size-5" aria-hidden />
          </span>
          <p className="text-sm font-medium text-foreground">Tidak ada pengajuan berstatus "{labelOf(status)}"</p>
          <p className="text-sm text-muted-foreground">Pengajuan baru akan muncul di sini.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-card" aria-label="Daftar pengajuan">
          {requests.map((req) => {
            const ownNeedsRevision = req.status === 'NeedsRevision' && req.requestedBy === currentUserId;
            const docLabel = approvalTypeLabel(req.documentType);
            const isAi = isAiToolApproval(req.documentType);
            return (
              <li key={req.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-foreground">{docLabel}</span>
                    <StatusBadge status={req.status} docType="approval" />
                    {req.documentNumber && (req.status === 'Approved' || isEditApprovalType(req.documentType)) && (
                      <span className="num text-xs text-muted-foreground">{req.documentNumber}</span>
                    )}
                  </div>
                  <p className="text-sm">
                    <span className="num font-semibold text-foreground">
                      {isAi
                        ? req.payload?.confirm || req.payload?.tool || req.documentType
                        : req.documentType === 'ProductionRun' || req.documentType === 'ProductionRunEdit'
                          ? `${fmtNum(Number(req.amount ?? 0))} kg input`
                          : `Rp ${fmtNum(Number(req.amount ?? 0))}`}
                    </span>
                    {req.approver && (
                      <span className="ml-2 inline-flex items-center gap-1 text-success-text">
                        <Check className="size-3.5" aria-hidden /> {req.approver.fullName}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    oleh {req.requester.fullName} ({req.requester.role}) · <span className="num">{fmtDate(req.createdAt)}</span>
                  </p>
                  {/* Reason (reject / revision) */}
                  {(req.status === 'Rejected' || req.status === 'NeedsRevision') && req.notes && (
                    <p className="mt-1.5 rounded-md border border-warning/30 bg-warning-subtle px-2.5 py-1.5 text-xs text-warning-text">
                      <span className="font-medium">{req.status === 'Rejected' ? 'Alasan tolak:' : 'Catatan revisi:'}</span> {req.notes}
                    </p>
                  )}
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:justify-end">
                  <Button size="sm" variant="outline" onClick={() => setDetailReq(req)} aria-label={`Detail pengajuan ${docLabel}`}>
                    <Eye aria-hidden /> Detail
                  </Button>
                  {isAdmin && req.status === 'Pending' && (
                    <>
                      <Button size="sm" onClick={() => approveMut.mutate(req.id)} disabled={busy} loading={approveMut.isPending && approveMut.variables === req.id}>
                        {!(approveMut.isPending && approveMut.variables === req.id) && <Check aria-hidden />} Setuju
                      </Button>
                      {!isEditApprovalType(req.documentType) && !isAi && (
                        <Button size="sm" variant="outline" onClick={() => setReasonModal({ mode: 'revision', id: req.id })} disabled={busy}>
                          <Pencil aria-hidden /> Minta Edit
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setReasonModal({ mode: 'reject', id: req.id })}
                        disabled={busy}
                        className="text-danger-text hover:bg-danger-subtle"
                      >
                        <X aria-hidden /> Tolak
                      </Button>
                    </>
                  )}
                  {ownNeedsRevision && onResubmit && (
                    <Button size="sm" onClick={() => onResubmit(req)}>
                      <Pencil aria-hidden /> Edit &amp; Ajukan Ulang
                    </Button>
                  )}
                  {req.status === 'Approved' && req.documentId && onViewDocument && (
                    <Button size="sm" variant="outline" onClick={() => onViewDocument(req)}>
                      <FileText aria-hidden /> Lihat Dokumen
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Reason dialog (Tolak / Minta Edit) — reason required, min 5 characters */}
      <ConfirmDialog
        open={reasonModal !== null}
        onOpenChange={(open) => !open && setReasonModal(null)}
        tone={reasonModal?.mode === 'reject' ? 'danger' : 'default'}
        title={reasonModal?.mode === 'revision' ? 'Minta Edit (Kembalikan ke Staff)' : 'Tolak Pengajuan'}
        description={
          reasonModal?.mode === 'revision'
            ? 'Pengajuan dikembalikan agar staff memperbaiki & mengajukan ulang.'
            : 'Pengajuan ditolak permanen. Staff perlu mengajukan baru jika ingin lanjut.'
        }
        confirmLabel={reasonModal?.mode === 'revision' ? 'Minta Edit' : 'Tolak'}
        requireReason={{
          label: 'Alasan (min 5 karakter)',
          minLength: 5,
          placeholder: reasonModal?.mode === 'revision' ? 'contoh: Harga rate salah, perbaiki sesuai PO' : 'contoh: Supplier tidak valid',
        }}
        loading={busy}
        onConfirm={(reason) => submitReason(reason ?? '')}
      />

      <ApprovalDetailDialog
        request={detailReq}
        onClose={() => setDetailReq(null)}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        detailCtx={detailCtx}
        detailCtxLoading={detailCtxLoading}
        partyName={partyName}
        warehouseMap={warehouseMap}
        machineMap={machineMap}
        itemName={itemName}
        itemUnit={itemUnit}
        onResubmit={onResubmit}
        onViewDocument={onViewDocument}
        onReject={(id) => setReasonModal({ mode: 'reject', id })}
        onRevision={(id) => setReasonModal({ mode: 'revision', id })}
        onApprove={(id) => approveMut.mutate(id)}
      />
    </div>
  );
}
