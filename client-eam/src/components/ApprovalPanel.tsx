import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Check, X, Loader2, Eye, Pencil, FileText } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah } from '../lib/formatters';
import { cn } from '../lib/utils';
import { cap } from '../lib/permissions';

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
const badgeOf = (s: string) => STATUS_TABS.find((t) => t.key === s)?.badge ?? 'badge-gray';
const labelOf = (s: string) => STATUS_TABS.find((t) => t.key === s)?.label ?? s;

const docTypeLabel: Record<string, string> = {
  PurchaseInvoice: 'Invoice Pembelian',
  ProductionRun: 'Data Produksi',
  SalesReturn: 'Retur Penjualan',
  DeliveryOrder: 'Surat Jalan',
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
  const [reasonText, setReasonText] = useState('');

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
  const { data: itemMap = {} } = useQuery<Record<string, { name: string; unit: string }>>({
    queryKey: ['inventory-items-namemap'],
    queryFn: async () => {
      const raw = (await api.get('/inventory/items')).data;
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
  const { data: partyMap = {} } = useQuery<Record<string, string>>({
    queryKey: ['parties-namemap'],
    queryFn: async () => {
      const raw = (await api.get('/parties')).data;
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

  const submitReason = () => {
    if (!reasonModal) return;
    const txt = reasonText.trim();
    if (txt.length < 5) { toast.error('Alasan minimal 5 karakter.'); return; }
    if (reasonModal.mode === 'reject') rejectMut.mutate({ id: reasonModal.id, notes: txt });
    else revisionMut.mutate({ id: reasonModal.id, notes: txt });
    setReasonModal(null); setReasonText(''); setDetailReq(null);
  };

  const busy = approveMut.isPending || rejectMut.isPending || revisionMut.isPending;

  return (
    <div className="space-y-3">
      {/* Sub-tab status */}
      <div className="flex gap-2 flex-wrap">
        {STATUS_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatus(t.key)}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              status === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="py-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
      ) : requests.length === 0 ? (
        <div className="py-10 text-center text-sm text-gray-400 bg-white border border-gray-100 rounded-xl">
          <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
          Tidak ada pengajuan berstatus "{labelOf(status)}".
        </div>
      ) : (
        <div className="space-y-2">
          {requests.map((req) => {
            const ownNeedsRevision = req.status === 'NeedsRevision' && req.requestedBy === currentUserId;
            return (
              <div key={req.id} className="bg-white border border-gray-200 rounded-lg p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="font-medium text-gray-800">{docTypeLabel[req.documentType] ?? req.documentType}</span>
                    <span className={cn('badge', badgeOf(req.status))}>{labelOf(req.status)}</span>
                    <span className="text-gray-400">oleh {req.requester.fullName} ({req.requester.role}) • {fmtDate(req.createdAt)}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500">
                    {req.documentType === 'ProductionRun'
                      ? `${fmtNum(Number(req.amount ?? 0))} kg input`
                      : `Rp ${fmtNum(Number(req.amount ?? 0))}`}
                    {req.approver && <span className="ml-2 text-emerald-600">✓ {req.approver.fullName}</span>}
                    {req.documentNumber && req.status === 'Approved' && <span className="ml-2 font-mono text-gray-400">{req.documentNumber}</span>}
                  </div>
                  {/* Alasan (tolak / revisi) */}
                  {(req.status === 'Rejected' || req.status === 'NeedsRevision') && req.notes && (
                    <div className="mt-1.5 text-xs bg-amber-50 border border-amber-100 rounded px-2 py-1 text-amber-800">
                      <span className="font-medium">{req.status === 'Rejected' ? 'Alasan tolak:' : 'Catatan revisi:'}</span> {req.notes}
                    </div>
                  )}
                </div>
                <div className="flex gap-1.5 flex-shrink-0 flex-wrap justify-end">
                  <button
                    onClick={() => setDetailReq(req)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg"
                  >
                    <Eye size={13} /> Detail
                  </button>
                  {isAdmin && req.status === 'Pending' && (
                    <>
                      <button onClick={() => approveMut.mutate(req.id)} disabled={busy}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50">
                        {approveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Setuju
                      </button>
                      <button onClick={() => { setReasonModal({ mode: 'revision', id: req.id }); setReasonText(''); }} disabled={busy}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-amber-700 border border-amber-300 hover:bg-amber-50 rounded-lg disabled:opacity-50">
                        <Pencil size={13} /> Minta Edit
                      </button>
                      <button onClick={() => { setReasonModal({ mode: 'reject', id: req.id }); setReasonText(''); }} disabled={busy}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-50">
                        <X size={13} /> Tolak
                      </button>
                    </>
                  )}
                  {ownNeedsRevision && onResubmit && (
                    <button onClick={() => onResubmit(req)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                      <Pencil size={13} /> Edit & Ajukan Ulang
                    </button>
                  )}
                  {req.status === 'Approved' && req.documentId && onViewDocument && (
                    <button onClick={() => onViewDocument(req)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-50 rounded-lg">
                      <FileText size={13} /> Lihat Dokumen
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal alasan (Tolak / Minta Edit) */}
      {reasonModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4" onClick={() => setReasonModal(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-900">
                {reasonModal.mode === 'reject' ? 'Tolak Pengajuan' : 'Minta Edit (Kembalikan ke Staff)'}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {reasonModal.mode === 'reject'
                  ? 'Pengajuan ditolak permanen. Staff perlu mengajukan baru jika ingin lanjut.'
                  : 'Pengajuan dikembalikan agar staff memperbaiki & mengajukan ulang.'}
              </p>
            </div>
            <div className="p-5">
              <label className="block text-xs font-medium text-gray-600 mb-1">Alasan (min 5 karakter) *</label>
              <textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} rows={3}
                className="w-full border border-gray-200 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                placeholder={reasonModal.mode === 'reject' ? 'contoh: Supplier tidak valid' : 'contoh: Harga rate salah, perbaiki sesuai PO'} />
            </div>
            <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setReasonModal(null)} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Batal</button>
              <button onClick={submitReason} disabled={busy}
                className={cn('inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white rounded-lg disabled:opacity-50',
                  reasonModal.mode === 'reject' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-600 hover:bg-amber-700')}>
                {busy && <Loader2 size={13} className="animate-spin" />}
                {reasonModal.mode === 'reject' ? 'Tolak' : 'Minta Edit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal detail pengajuan */}
      {detailReq && (() => {
        const p = detailReq.payload ?? {};
        const isProd = detailReq.documentType === 'ProductionRun';
        const isDO = detailReq.documentType === 'DeliveryOrder';
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
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Detail Pengajuan {docTypeLabel[detailReq.documentType] ?? ''}</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    <span className={cn('badge', badgeOf(detailReq.status))}>{labelOf(detailReq.status)}</span>
                    {' '}oleh {detailReq.requester.fullName} ({detailReq.requester.role}) • {fmtDate(detailReq.createdAt)}
                    {detailReq.documentNumber && detailReq.status === 'Approved' && <span className="ml-2 font-mono text-gray-400">{detailReq.documentNumber}</span>}
                  </p>
                </div>
                <button onClick={() => setDetailReq(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
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

                {isDO ? (
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
                          <br /><span className="text-amber-600">HPP final (termasuk biaya material) dihitung saat disetujui.</span>
                        </p>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <p className="text-xs font-semibold text-gray-700 mb-1.5">Item Invoice</p>
                      <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                        {piItems.length === 0 ? <p className="px-3 py-2 text-xs text-gray-400">—</p> :
                          piItems.map((it, i) => {
                            const qty = Number(it.timbanganDiterima ?? it.quantity ?? 0);
                            const meta: string[] = [];
                            if (it.kualitas) meta.push(`kualitas: ${it.kualitas}`);
                            if (Number(it.timbanganTruk ?? 0) > 0) meta.push(`truk: ${fmtNum(Number(it.timbanganTruk))}`);
                            if (Number(it.refaksi ?? 0) > 0) meta.push(`refaksi: ${fmtNum(Number(it.refaksi))}`);
                            if (Number(it.discount ?? 0) > 0) meta.push(`disk ${it.discount}%`);
                            if (Number(it.taxPct ?? 0) > 0) meta.push(`PPN ${it.taxPct}%`);
                            if (Number(it.pphPct ?? 0) > 0) meta.push(`PPh ${it.pphPct}%`);
                            if (Number(it.potonganItem ?? 0) > 0) meta.push(`potongan ${formatRupiah(Number(it.potonganItem))}`);
                            if (it.nomorMobil) meta.push(`mobil: ${it.nomorMobil}`);
                            return (
                              <div key={i} className="px-3 py-2 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-gray-800 font-medium">{it.itemName ?? '—'}</span>
                                  <span className="font-mono tabular-nums text-gray-600">
                                    {fmtNum(qty)} {it.unit ?? ''} × {formatRupiah(Number(it.rate ?? 0))} = {formatRupiah(Math.round(piLineTotal(it)))}
                                  </span>
                                </div>
                                {meta.length > 0 && <div className="text-[10px] text-gray-400 mt-0.5">{meta.join(' · ')}</div>}
                              </div>
                            );
                          })}
                      </div>
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
                    <button onClick={() => { setReasonModal({ mode: 'reject', id: detailReq.id }); setReasonText(''); }}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg">Tolak</button>
                    <button onClick={() => { setReasonModal({ mode: 'revision', id: detailReq.id }); setReasonText(''); }}
                      className="px-3 py-1.5 text-xs font-medium text-amber-700 border border-amber-300 hover:bg-amber-50 rounded-lg">Minta Edit</button>
                    <button onClick={() => { approveMut.mutate(detailReq.id); setDetailReq(null); }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
                      <Check size={13} /> Setuju
                    </button>
                  </>
                )}
                {detailReq.status === 'NeedsRevision' && detailReq.requestedBy === currentUserId && onResubmit && (
                  <button onClick={() => { onResubmit(detailReq); setDetailReq(null); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg">
                    <Pencil size={13} /> Edit & Ajukan Ulang
                  </button>
                )}
                {detailReq.status === 'Approved' && detailReq.documentId && onViewDocument && (
                  <button onClick={() => { onViewDocument(detailReq); setDetailReq(null); }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">
                    <FileText size={13} /> Lihat Dokumen
                  </button>
                )}
                <button onClick={() => setDetailReq(null)} className="px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-100 rounded-lg">Tutup</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
