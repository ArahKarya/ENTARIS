import { useEffect, useMemo, useRef, useState } from 'react';
import PurchaseOrderApprovalSummary from './PurchaseOrderApprovalSummary';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Check, X, Loader2, Eye, Pencil, FileText } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah } from '../lib/formatters';
import { cn } from '../lib/utils';
import { cap } from '../lib/permissions';
import AttachmentPreview from './AttachmentPreview';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, StatusBadge } from '@/components/shared';

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

const fmtNum = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 3 });
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const STATUS_TABS = [
  { key: 'Pending', label: 'Menunggu', badge: 'badge-yellow' },
  { key: 'Approved', label: 'Disetujui', badge: 'badge-green' },
  { key: 'Rejected', label: 'Ditolak', badge: 'badge-red' },
  { key: 'NeedsRevision', label: 'Perlu Revisi', badge: 'badge-amber' },
] as const;
type StatusKey = typeof STATUS_TABS[number]['key'];
const labelOf = (s: string) => STATUS_TABS.find((t) => t.key === s)?.label ?? s;

const docTypeLabel: Record<string, string> = {
  PurchaseInvoice: 'Invoice Pembelian',
  ProductionRun: 'Data Produksi',
  SalesReturn: 'Retur Penjualan',
  DeliveryOrder: 'Surat Jalan',
  PurchaseOrder: 'Purchase Order',
};

interface Props {
  documentType?: 'PurchaseInvoice' | 'ProductionRun'; // undefined = semua tipe
  onResubmit?: (req: ApprovalRequest) => void;
  onViewDocument?: (req: ApprovalRequest) => void;
  // Deep-link dari notifikasi: id pengajuan yg langsung dibuka detailnya.
  focusRequestId?: string;
  onFocusHandled?: () => void;
}

// Total harga akhir satu baris PI dari payload pengajuan.
// hargaAkhir = qty×rate×(1−disc%) + PPN − PPh − potonganItem.
// Payload pengajuan TIDAK menyimpan it.amount → harus dihitung di sini,
// jangan andalkan it.amount (selalu undefined → tampil Rp 0).
function piLineTotal(it: any): number {
  const qty = Number(it.timbanganDiterima ?? it.quantity ?? 0);
  const base = qty * Number(it.rate ?? 0);
  const afterDisc = base - base * (Number(it.discount ?? 0) / 100);
  const ppn = afterDisc * (Number(it.taxPct ?? 0) / 100);
  const pph = afterDisc * (Number(it.pphPct ?? 0) / 100);
  return afterDisc + ppn - pph - Number(it.potonganItem ?? 0);
}

// Hitung estimasi total PI dari payload (mirror server purchaseInvoiceCalc).
function piTotals(payload: any): { subtotal: number; grandTotal: number } {
  const items: any[] = payload?.items ?? [];
  const subtotal = items.reduce((s, it) => s + piLineTotal(it), 0);
  const grandTotal = subtotal - Number(payload?.potongan ?? 0) + Number(payload?.biayaLain ?? 0);
  return { subtotal: Math.round(subtotal), grandTotal: Math.round(grandTotal) };
}

// Estimasi HPP/Kg produksi dari payload. Material hanya pasti bila batchUnitCost
// terisi; jika tidak, material tak diketahui (return knownMaterial=false).
function prodHppEstimate(payload: any): { hpp: number | null; knownMaterial: boolean; byproductValue: number; costTotal: number; mainQty: number } {
  const inputs: any[] = payload?.inputs ?? [];
  const outputs: any[] = payload?.outputs ?? [];
  const costs: any[] = payload?.costs ?? [];
  const mainQty = outputs.filter((o) => !o.isByProduct).reduce((s, o) => s + Number(o.quantity ?? 0), 0);
  const inputQty = inputs.reduce((s, i) => s + Number(i.quantity ?? 0), 0);
  const byproductValue = outputs.filter((o) => o.isByProduct).reduce((s, o) => s + Number(o.quantity ?? 0) * Number(o.unitPrice ?? 0), 0);
  // Material: hanya jika SEMUA input punya batchUnitCost > 0.
  const allHaveBatch = inputs.length > 0 && inputs.every((i) => Number(i.batchUnitCost ?? 0) > 0);
  const material = allHaveBatch ? inputs.reduce((s, i) => s + Number(i.quantity ?? 0) * Number(i.batchUnitCost ?? 0), 0) : 0;
  // Biaya: rate × basisQty (InputQty/OutputQty/Fixed).
  let costTotal = 0;
  for (const c of costs) {
    const rate = Number(c.rate ?? 0);
    if (c.basis === 'InputQty') costTotal += rate * inputQty;
    else if (c.basis === 'OutputQty') costTotal += rate * mainQty;
    else costTotal += rate; // Fixed
  }
  if (!allHaveBatch || mainQty <= 0) return { hpp: null, knownMaterial: allHaveBatch, byproductValue, costTotal: Math.round(costTotal), mainQty };
  const hpp = (material + costTotal - byproductValue) / mainQty;
  return { hpp: Math.round(hpp), knownMaterial: true, byproductValue, costTotal: Math.round(costTotal), mainQty };
}

/**
 * Panel approval reusable: sub-tab status (Menunggu/Disetujui/Ditolak/Perlu
 * Revisi), detail modal, aksi Admin (Setuju/Tolak/Minta Edit), dan tombol
 * "Edit & Ajukan Ulang" untuk staff pemilik pengajuan berstatus Perlu Revisi.
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
    enabled: !!detailReq && detailReq.documentType === 'PurchaseInvoice',
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
    queryKey: ['approval-requests', documentType ?? 'all', status],
    queryFn: async () => {
      const all: ApprovalRequest[] = (await api.get('/approvals/requests', { params: { status } })).data;
      const arr = Array.isArray(all) ? all : [];
      return documentType ? arr.filter((r) => r.documentType === documentType) : arr;
    },
    refetchInterval: 30000,
  });

  // Map id → {name, unit} utk detail produksi (payload simpan id).
  // limit=500: endpoint /inventory/items juga paginated (default 100) — sama
  // seperti party map di bawah, hindari item hilang dari lookup kalau count
  // tumbuh melewati 100.
  const { data: itemMap = {} } = useQuery<Record<string, { name: string; unit: string }>>({
    queryKey: ['inventory-items-namemap'],
    queryFn: async () => {
      const raw = (await api.get('/inventory/items?limit=500')).data;
      const list: any[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
      const m: Record<string, { name: string; unit: string }> = {};
      for (const it of list) m[it.id] = { name: it.name, unit: it.unit };
      return m;
    },
    staleTime: 5 * 60 * 1000,
  });
  const itemName = (id: string) => itemMap[id]?.name ?? `(item ${id?.slice?.(0, 8) ?? '?'})`;
  const itemUnit = (id: string) => itemMap[id]?.unit ?? 'kg';

  // Name maps untuk perkaya detail (supplier, gudang, mesin) — payload simpan id.
  // limit=500 (bukan default paginated 100) supaya SEMUA party ke-load untuk
  // lookup map — kalau tidak, party di luar 100 nama pertama (urut alfabetis)
  // hilang dari map dan tampil sebagai '—' walau partyId di payload valid.
  const { data: partyMap = {} } = useQuery<Record<string, string>>({
    queryKey: ['parties-namemap'],
    queryFn: async () => {
      const raw = (await api.get('/parties?limit=500')).data;
      const list: any[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
      const m: Record<string, string> = {};
      for (const p of list) m[p.id] = p.name;
      return m;
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: warehouseMap = {} } = useQuery<Record<string, string>>({
    queryKey: ['warehouses-namemap'],
    queryFn: async () => {
      const raw = (await api.get('/warehouses')).data;
      const list: any[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
      const m: Record<string, string> = {};
      for (const w of list) m[w.id] = w.code ? `${w.code} — ${w.name}` : w.name;
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
      for (const mc of list) m[mc.id] = mc.code ? `${mc.code} — ${mc.name}` : mc.name;
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
      toast.success(data?.createdDocument ? `Disetujui — ${data.createdDocument.number} dibuat.` : 'Disetujui.');
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
        <div className="flex justify-center rounded-lg border border-border bg-card py-10 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden />
          <span className="sr-only">Memuat pengajuan…</span>
        </div>
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
            const docLabel = docTypeLabel[req.documentType] ?? req.documentType;
            return (
              <li key={req.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start">
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-foreground">{docLabel}</span>
                    <StatusBadge status={req.status} docType="approval" />
                    {req.documentNumber && req.status === 'Approved' && (
                      <span className="num text-xs text-muted-foreground">{req.documentNumber}</span>
                    )}
                  </div>
                  <p className="text-sm">
                    <span className="num font-semibold text-foreground">
                      {req.documentType === 'ProductionRun'
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
                      <Button size="sm" variant="outline" onClick={() => setReasonModal({ mode: 'revision', id: req.id })} disabled={busy}>
                        <Pencil aria-hidden /> Minta Edit
                      </Button>
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

      {/* Modal detail pengajuan */}
      {detailReq && (() => {
        const p = detailReq.payload ?? {};
        const isProd = detailReq.documentType === 'ProductionRun';
        const isDO = detailReq.documentType === 'DeliveryOrder';
        const isPO = detailReq.documentType === 'PurchaseOrder';
        const piItems: any[] = p.items ?? [];
        const inputs: any[] = p.inputs ?? [];
        const outputs: any[] = p.outputs ?? [];
        const costs: any[] = p.costs ?? [];
        const runMachines: any[] = p.runMachines ?? [];
        const downtimes: any[] = p.downtimes ?? [];
        const processIds: string[] = p.processIds ?? [];
        const basisLabel: Record<string, string> = { InputQty: 'per kg input', OutputQty: 'per kg output', Fixed: 'tetap' };
        const fmtT = (v: any) => v ? new Date(v).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
        const pi = (isProd || isDO) ? null : piTotals(p);
        const hppEst = isProd ? prodHppEstimate(p) : null;
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailReq(null)}>
            <div role="dialog" aria-modal="true" aria-label={`Detail Pengajuan ${docTypeLabel[detailReq.documentType] ?? ''}`} className={cn('bg-white rounded-xl shadow-xl w-full max-h-[92vh] overflow-auto', (isProd || isDO) ? 'max-w-2xl' : 'max-w-6xl')} onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Detail Pengajuan {docTypeLabel[detailReq.documentType] ?? ''}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <StatusBadge status={detailReq.status} docType="approval" className="align-middle" />
                    {' '}oleh {detailReq.requester.fullName} ({detailReq.requester.role}) • {fmtDate(detailReq.createdAt)}
                    {detailReq.documentNumber && detailReq.status === 'Approved' && <span className="ml-2 font-mono text-gray-400">{detailReq.documentNumber}</span>}
                  </p>
                </div>
                <button type="button" onClick={() => setDetailReq(null)} aria-label="Tutup" className="p-1 text-muted-foreground hover:text-foreground"><X size={18} aria-hidden /></button>
              </div>
              <div className="p-5 space-y-4 text-sm">
                {(detailReq.notes && (detailReq.status === 'Rejected' || detailReq.status === 'NeedsRevision')) && (
                  <div className="text-xs bg-amber-50 border border-amber-100 rounded px-3 py-2 text-amber-800">
                    <span className="font-medium">{detailReq.status === 'Rejected' ? 'Alasan tolak:' : 'Catatan revisi:'}</span> {detailReq.notes}
                  </div>
                )}
                {/* Info umum */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {p.date && <div><span className="text-gray-400">Tanggal:</span> <span className="text-gray-800">{p.date}</span></div>}
                  {!isProd && p.partyId && <div><span className="text-gray-400">{isDO ? 'Pelanggan:' : 'Supplier:'}</span> <span className="text-gray-800">{partyMap[p.partyId] ?? '—'}</span></div>}
                  {!isProd && p.dueDate && <div><span className="text-gray-400">Jatuh Tempo:</span> <span className="text-gray-800">{p.dueDate}</span></div>}
                  {!isProd && p.terms && <div><span className="text-gray-400">Syarat:</span> <span className="text-gray-800">{p.terms}</span></div>}
                  {!isProd && p.customerRefNo && <div><span className="text-gray-400">No. Ref:</span> <span className="text-gray-800">{p.customerRefNo}</span></div>}
                  {isProd && p.warehouseId && <div><span className="text-gray-400">Gudang:</span> <span className="text-gray-800">{warehouseMap[p.warehouseId] ?? '—'}</span></div>}
                  {isProd && p.shift && <div><span className="text-gray-400">Shift:</span> <span className="text-gray-800">{p.shift}</span></div>}
                  {isProd && p.shiftLead && <div><span className="text-gray-400">Kepala Shift:</span> <span className="text-gray-800">{p.shiftLead}</span></div>}
                  {isProd && p.manpowerCount != null && <div><span className="text-gray-400">Jml Orang:</span> <span className="text-gray-800">{p.manpowerCount}</span></div>}
                  {isProd && (p.plannedStart || p.plannedEnd) && <div className="col-span-2"><span className="text-gray-400">Jendela Shift:</span> <span className="text-gray-800">{fmtT(p.plannedStart)} – {fmtT(p.plannedEnd)}</span></div>}
                  {isProd && (p.breakStart || p.breakEnd) && <div className="col-span-2"><span className="text-gray-400">Istirahat:</span> <span className="text-gray-800">{fmtT(p.breakStart)} – {fmtT(p.breakEnd)}</span></div>}
                  {p.notes && <div className="col-span-2"><span className="text-gray-400">Catatan:</span> <span className="text-gray-800">{p.notes}</span></div>}
                </div>

                {isPO ? (
                  detailReq.documentId ? <PurchaseOrderApprovalSummary poId={detailReq.documentId} /> : null
                ) : isDO ? (
                  <>
                    {p.negativeStockReason && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                        <span className="font-semibold">Alasan stok minus:</span> {p.negativeStockReason}
                      </div>
                    )}
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-1.5">Barang Dikirim</p>
                      <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                        {piItems.length === 0 ? <p className="px-3 py-2 text-xs text-gray-400">—</p> :
                          piItems.map((it, i) => (
                            <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                              <div className="text-gray-800">
                                <span className="font-medium">{it.itemName ?? '—'}</span>
                                {it.warehouseId && <span className="text-gray-400"> · {warehouseMap[it.warehouseId] ?? 'gudang'}</span>}
                              </div>
                              <span className="font-mono tabular-nums text-gray-600">{fmtNum(Number(it.quantity ?? 0))} {it.unit ?? ''}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  </>
                ) : isProd ? (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-1.5">Bahan Baku (Input)</p>
                      <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                        {inputs.length === 0 ? <p className="px-3 py-2 text-xs text-gray-400">—</p> :
                          inputs.map((it, i) => (
                            <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                              <span className="text-gray-800">
                                {itemName(it.itemId)}
                                {Number(it.batchUnitCost ?? 0) > 0 && <span className="ml-1.5 text-[9px] px-1 py-0.5 bg-blue-50 text-blue-600 rounded">batch @{formatRupiah(Number(it.batchUnitCost))}</span>}
                              </span>
                              <span className="font-mono tabular-nums text-gray-600">{fmtNum(Number(it.quantity ?? 0))} {itemUnit(it.itemId)}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-1.5">Hasil Produksi (Output)</p>
                      <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                        {outputs.length === 0 ? <p className="px-3 py-2 text-xs text-gray-400">—</p> :
                          outputs.map((it, i) => (
                            <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                              <span className="text-gray-800">
                                {itemName(it.itemId)}
                                {it.isByProduct && <span className="ml-1.5 text-[9px] px-1 py-0.5 bg-amber-100 text-amber-700 rounded font-medium">Samping</span>}
                              </span>
                              <span className="font-mono tabular-nums text-gray-600">
                                {fmtNum(Number(it.quantity ?? 0))} {itemUnit(it.itemId)}
                                {it.unitPrice != null && Number(it.unitPrice) > 0 && <span className="text-blue-500 ml-1">@{formatRupiah(Number(it.unitPrice))}</span>}
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                    {costs.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-1.5">Komponen Biaya</p>
                        <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                          {costs.map((c, i) => (
                            <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                              <span className="text-gray-800">{c.description ?? '—'} <span className="text-gray-400">({c.costSide === 'OutputSide' ? 'output' : 'input'})</span></span>
                              <span className="font-mono tabular-nums text-gray-600">
                                {formatRupiah(Number(c.rate ?? 0))} <span className="text-gray-400">{basisLabel[c.basis] ?? c.basis ?? ''}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {runMachines.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-1.5">Mesin</p>
                        <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                          {runMachines.map((m, i) => (
                            <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                              <span className="text-gray-800">{machineMap[m.machineId] ?? '(mesin)'}</span>
                              <span className="font-mono text-gray-500">{fmtT(m.startAt)} – {fmtT(m.endAt)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {downtimes.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-1.5">Downtime</p>
                        <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                          {downtimes.map((d, i) => (
                            <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                              <span className="text-gray-800">{d.category}{d.machineId ? ` • ${machineMap[d.machineId] ?? 'mesin'}` : ''}{d.reason ? ` — ${d.reason}` : ''}</span>
                              <span className="font-mono tabular-nums text-gray-600">{fmtNum(Number(d.durationMin ?? 0))} mnt</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {processIds.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-700 mb-1.5">Proses</p>
                        <p className="text-xs text-gray-500">{processIds.length} proses tercatat</p>
                      </div>
                    )}
                    {/* Estimasi HPP */}
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3">
                      <p className="text-xs font-semibold text-gray-700 mb-1">Estimasi HPP</p>
                      {hppEst && hppEst.hpp != null ? (
                        <p className="text-sm font-semibold text-gray-900">{formatRupiah(hppEst.hpp)} <span className="text-xs font-normal text-gray-400">/ kg produk utama (estimasi)</span></p>
                      ) : (
                        <p className="text-xs text-gray-500">
                          Biaya: {formatRupiah(hppEst?.costTotal ?? 0)} · Nilai by-product: {formatRupiah(hppEst?.byproductValue ?? 0)}
                          <br /><span className="text-warning-text">HPP final (termasuk biaya material) dihitung saat disetujui.</span>
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    {/* Ringkasan supplier & kontrol */}
                    {(() => {
                      const totalKg = piItems.filter((it) => String(it.unit ?? '').toLowerCase() === 'kg').reduce((a, it) => a + Number(it.timbanganDiterima ?? it.quantity ?? 0), 0);
                      const totalTruk = piItems.reduce((a, it) => a + Number(it.timbanganTruk ?? 0), 0);
                      const totalRef = piItems.reduce((a, it) => a + Number(it.refaksi ?? 0), 0);
                      const sup = detailCtx?.supplier;
                      const warn: string[] = [];
                      for (const it of piItems) {
                        const sl = it.goodsReceiptItemId ? detailCtx?.sttLines?.[it.goodsReceiptItemId] : null;
                        if (sl?.alreadyInvoiced) warn.push(`${sl.sttNumber} sudah ditagih di ${sl.alreadyInvoiced}`);
                        if (sl?.sttStatus === 'Cancelled') warn.push(`${sl.sttNumber} berstatus DIBATALKAN`);
                        const q = Number(it.timbanganDiterima ?? it.quantity ?? 0);
                        if (sl && Math.abs(q + Number(it.refaksi ?? 0) - Number(sl.quantity)) > 0.5) warn.push(`${sl.sttNumber}: diterima ${fmtNum(q)} + refaksi ${fmtNum(Number(it.refaksi ?? 0))} ≠ STT ${fmtNum(Number(sl.quantity))}`);
                        if (!it.goodsReceiptItemId && it.inventoryItemId) warn.push(`${it.itemName}: tidak terhubung STT`);
                      }
                      return (
                        <>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-gray-400">Total Diterima</p>
                              <p className="text-sm font-semibold text-gray-900 tabular-nums">{fmtNum(totalKg)} kg</p>
                              {totalTruk > 0 && <p className="text-[10px] text-gray-500">truk {fmtNum(totalTruk)} · refaksi {fmtNum(totalRef)}{totalTruk > 0 ? ` (${(totalRef / totalTruk * 100).toFixed(2)}%)` : ''}</p>}
                            </div>
                            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-gray-400">Harga Rata² / kg</p>
                              <p className="text-sm font-semibold text-gray-900 tabular-nums">{totalKg > 0 ? formatRupiah(Math.round((pi?.grandTotal ?? 0) / totalKg)) : '—'}</p>
                              <p className="text-[10px] text-gray-500">grand total ÷ kg diterima</p>
                            </div>
                            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-gray-400">Hutang Berjalan Supplier</p>
                              <p className="text-sm font-semibold text-gray-900 tabular-nums">{sup ? formatRupiah(sup.openOutstanding) : '—'}</p>
                              <p className="text-[10px] text-gray-500">{sup ? `${sup.openInvoiceCount} invoice belum lunas` : ''}</p>
                            </div>
                            <div className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                              <p className="text-[10px] uppercase tracking-wide text-gray-400">Deposit / Uang Muka</p>
                              <p className={cn('text-sm font-semibold tabular-nums', (sup?.depositBalance ?? 0) > 0 ? 'text-emerald-700' : 'text-gray-900')}>{sup ? formatRupiah(sup.depositBalance) : '—'}</p>
                              <p className="text-[10px] text-gray-500">{(sup?.depositBalance ?? 0) > 0 ? 'bisa dipotongkan' : ''}</p>
                            </div>
                          </div>
                          {warn.length > 0 && (
                            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 space-y-0.5">
                              <p className="font-semibold">⚠ Perlu dicek</p>
                              {warn.map((w, k) => <p key={k}>• {w}</p>)}
                            </div>
                          )}
                        </>
                      );
                    })()}

                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-1.5">Item Invoice ({piItems.length} baris)</p>
                      {piItems.length === 0 ? <p className="text-xs text-gray-400">—</p> : (
                        <div className="border border-gray-200 rounded-lg overflow-x-auto" role="region" aria-label="Rincian item pengajuan" tabIndex={0}>
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase tracking-wide">
                              <tr>
                                <th className="px-2 py-2 text-left">#</th>
                                <th className="px-2 py-2 text-left">STT</th>
                                <th className="px-2 py-2 text-left">Item / Gudang</th>
                                <th className="px-2 py-2 text-left">Mobil</th>
                                <th className="px-2 py-2 text-right">KA %</th>
                                <th className="px-2 py-2 text-right">Timb. Truk</th>
                                <th className="px-2 py-2 text-right">Refaksi</th>
                                <th className="px-2 py-2 text-right">Diterima</th>
                                <th className="px-2 py-2 text-right">Harga</th>
                                <th className="px-2 py-2 text-right">Harga Lalu</th>
                                <th className="px-2 py-2 text-right">Pajak/Pot.</th>
                                <th className="px-2 py-2 text-right">Subtotal</th>
                                <th className="px-2 py-2 text-left">Keterangan</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                              {piItems.map((it, i) => {
                                const qty = Number(it.timbanganDiterima ?? it.quantity ?? 0);
                                const sl = it.goodsReceiptItemId ? detailCtx?.sttLines?.[it.goodsReceiptItemId] : null;
                                const hist: any[] = it.inventoryItemId ? (detailCtx?.priceHistory?.[it.inventoryItemId] ?? []) : [];
                                const lastSame = hist.find((h) => h.sameSupplier);
                                const last = lastSame ?? hist[0];
                                const rate = Number(it.rate ?? 0);
                                const diff = last ? rate - last.rate : 0;
                                const qtyMismatch = sl && Math.abs(qty + Number(it.refaksi ?? 0) - Number(sl.quantity)) > 0.5;
                                const tax: string[] = [];
                                if (Number(it.discount ?? 0) > 0) tax.push(`disk ${it.discount}%`);
                                if (Number(it.taxPct ?? 0) > 0) tax.push(`PPN ${it.taxPct}%`);
                                if (Number(it.pphPct ?? 0) > 0) tax.push(`PPh ${it.pphPct}%`);
                                if (Number(it.potonganItem ?? 0) > 0) tax.push(`−${formatRupiah(Number(it.potonganItem))}`);
                                const ket = it.description || sl?.description;
                                const ref = Number(it.refaksi ?? 0);
                                const truk = Number(it.timbanganTruk ?? 0);
                                return (
                                  <tr key={i} className={cn('align-top', (sl?.alreadyInvoiced || sl?.sttStatus === 'Cancelled') && 'bg-red-50')}>
                                    <td className="px-2 py-2 text-gray-400">{i + 1}</td>
                                    <td className="px-2 py-2 font-mono text-gray-700 whitespace-nowrap">
                                      {sl?.sttNumber ?? <span className="text-gray-300">—</span>}
                                      {sl?.sttDate && <div className="text-[10px] text-gray-400 font-sans">{new Date(sl.sttDate).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</div>}
                                    </td>
                                    <td className="px-2 py-2">
                                      <div className="font-medium text-gray-800">{it.itemName ?? '—'}</div>
                                      {it.warehouseId && <div className="text-[10px] text-gray-400">{warehouseMap[it.warehouseId] ?? 'gudang'}</div>}
                                    </td>
                                    <td className="px-2 py-2 whitespace-nowrap text-gray-600">{it.nomorMobil ?? '—'}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{it.kualitas ?? '—'}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">{truk > 0 ? fmtNum(truk) : '—'}</td>
                                    <td className="px-2 py-2 text-right tabular-nums">
                                      {ref > 0 ? fmtNum(ref) : '—'}
                                      {ref > 0 && truk > 0 && <div className="text-[10px] text-gray-400">{(ref / truk * 100).toFixed(2)}%</div>}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                                      <span className="font-medium">{fmtNum(qty)}</span> <span className="text-gray-400">{it.unit ?? ''}</span>
                                      {sl && <div className={cn('text-[10px]', qtyMismatch ? 'text-red-600 font-semibold' : 'text-gray-400')}>STT {fmtNum(Number(sl.quantity))}</div>}
                                    </td>
                                    <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">{formatRupiah(rate)}</td>
                                    <td className="px-2 py-2 text-right tabular-nums whitespace-nowrap">
                                      {last ? (
                                        <div title={hist.map((h) => `${h.invoiceNumber} · ${new Date(h.date).toLocaleDateString('id-ID')} · ${h.supplier} · ${formatRupiah(h.rate)}`).join('\n')}>
                                          <span className="text-gray-600">{formatRupiah(last.rate)}</span>
                                          {diff !== 0 && <span className={cn('ml-1 text-[10px] font-semibold', diff > 0 ? 'text-red-600' : 'text-emerald-600')}>{diff > 0 ? '▲' : '▼'}{formatRupiah(Math.abs(diff))}</span>}
                                          <div className="text-[10px] text-gray-400">{lastSame ? 'supplier ini' : (last.supplier ?? 'lain')} · {new Date(last.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</div>
                                        </div>
                                      ) : <span className="text-gray-300">—</span>}
                                    </td>
                                    <td className="px-2 py-2 text-right text-[10px] text-gray-500">{tax.length ? tax.join(' · ') : '—'}</td>
                                    <td className="px-2 py-2 text-right tabular-nums font-medium whitespace-nowrap">{formatRupiah(Math.round(piLineTotal(it)))}</td>
                                    <td className="px-2 py-2 text-gray-600">
                                      {ket ?? <span className="text-gray-300">—</span>}
                                      {sl?.alreadyInvoiced && <div className="text-[10px] text-red-600 font-semibold">sudah di {sl.alreadyInvoiced}</div>}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                      <p className="text-[10px] text-gray-400 mt-1">Harga Lalu = harga beli item sama pada invoice terakhir (supplier ini bila ada). Arahkan kursor untuk lihat 5 riwayat. ▲ merah = lebih mahal.</p>
                    </div>
                    {/* Lampiran: pengajuan + STT sumber */}
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-1.5">Lampiran</p>
                      {detailCtxLoading ? (
                        <p className="text-xs text-gray-400">Memuat lampiran…</p>
                      ) : (
                        <div className="space-y-3">
                          {(detailCtx?.requestAttachments?.length ?? 0) > 0 && (
                            <div>
                              <p className="text-[11px] text-gray-500 mb-1">Dari pengajuan ({detailCtx.requestAttachments.length})</p>
                              <AttachmentPreview referenceType="approval_request" referenceId={detailReq.id} canDelete={false} />
                            </div>
                          )}
                          {(detailCtx?.stts ?? []).map((s: any) => (
                            <div key={s.id}>
                              <p className="text-[11px] text-gray-500 mb-1">
                                <span className="font-mono text-gray-700">{s.sttNumber}</span>
                                {s.date && <> · {new Date(s.date).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })}</>}
                                {s.nomorMobil && <> · {s.nomorMobil}</>}
                                {s.driverName && <> · supir {s.driverName}</>}
                                {s.status === 'Cancelled' && <span className="ml-1 text-red-600 font-medium">(STT dibatalkan)</span>}
                              </p>
                              {s.attachments?.length > 0
                                ? <AttachmentPreview referenceType="goods_receipt" referenceId={s.id} canDelete={false} />
                                : <p className="text-xs text-warning-text">Tidak ada lampiran di STT ini.</p>}
                            </div>
                          ))}
                          {(detailCtx?.requestAttachments?.length ?? 0) === 0 && (detailCtx?.stts?.length ?? 0) === 0 && (
                            <p className="text-xs text-warning-text">Tidak ada lampiran (pengajuan tidak terhubung ke STT & tidak ada file diunggah).</p>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Totals (estimasi) */}
                    <div className="bg-gray-50 border border-gray-100 rounded-lg p-3 space-y-1 text-xs">
                      <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span className="font-mono tabular-nums">{formatRupiah(pi?.subtotal ?? 0)}</span></div>
                      {Number(p.potongan ?? 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Potongan</span><span className="font-mono tabular-nums text-red-600">− {formatRupiah(Number(p.potongan))}</span></div>}
                      {Number(p.biayaLain ?? 0) > 0 && <div className="flex justify-between"><span className="text-gray-500">Biaya Lain</span><span className="font-mono tabular-nums">{formatRupiah(Number(p.biayaLain))}</span></div>}
                      <div className="flex justify-between pt-1 border-t border-gray-200 font-semibold text-gray-900">
                        <span>Grand Total <span className="text-[10px] font-normal text-gray-400">(estimasi)</span></span>
                        <span className="font-mono tabular-nums">{formatRupiah(pi?.grandTotal ?? 0)}</span>
                      </div>
                    </div>
                  </>
                )}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
                {isAdmin && detailReq.status === 'Pending' && (
                  <>
                    <Button size="sm" variant="outline" className="text-danger-text hover:bg-danger-subtle" onClick={() => { setReasonModal({ mode: 'reject', id: detailReq.id }); }}>
                      Tolak
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => { setReasonModal({ mode: 'revision', id: detailReq.id }); }}>
                      Minta Edit
                    </Button>
                    <Button size="sm" onClick={() => { approveMut.mutate(detailReq.id); setDetailReq(null); }}>
                      <Check aria-hidden /> Setuju
                    </Button>
                  </>
                )}
                {detailReq.status === 'NeedsRevision' && detailReq.requestedBy === currentUserId && onResubmit && (
                  <Button size="sm" onClick={() => { onResubmit(detailReq); setDetailReq(null); }}>
                    <Pencil aria-hidden /> Edit &amp; Ajukan Ulang
                  </Button>
                )}
                {detailReq.status === 'Approved' && detailReq.documentId && onViewDocument && (
                  <Button size="sm" onClick={() => { onViewDocument(detailReq); setDetailReq(null); }}>
                    <FileText aria-hidden /> Lihat Dokumen
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => setDetailReq(null)}>Tutup</Button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
