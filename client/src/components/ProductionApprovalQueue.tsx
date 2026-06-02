import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Check, X, Loader2, Eye } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah } from '../lib/formatters';

interface ApprovalRequest {
  id: string;
  documentType: string;
  status: string;
  amount: number | null;
  payload?: any;
  requester: { fullName: string; role: string };
  createdAt: string;
}

const fmtNum = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 3 });
const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

// Ringkas payload produksi → daftar input/output untuk double-check.
function summarize(payload: any): { inputs: string[]; outputs: string[] } {
  const inputs: string[] = [];
  const outputs: string[] = [];
  if (payload && typeof payload === 'object') {
    (payload.inputs ?? []).forEach((it: any) =>
      inputs.push(`${fmtNum(Number(it.quantity ?? 0))} kg`));
    (payload.outputs ?? []).forEach((it: any) =>
      outputs.push(`${fmtNum(Number(it.quantity ?? 0))} kg${it.isByProduct ? ' (samping)' : ''}`));
  }
  return { inputs, outputs };
}

interface Props {
  userRole: string | undefined;
}

/**
 * Antrian Data Produksi yang menunggu approval — tampil di tab Proses Produksi
 * agar Admin & staff sama-sama melihat proses mana yang sedang menunggu.
 * Admin dapat Setuju/Tolak langsung di sini.
 */
export default function ProductionApprovalQueue({ userRole }: Props) {
  const qc = useQueryClient();
  const isAdmin = userRole === 'Admin';
  const [detailReq, setDetailReq] = useState<ApprovalRequest | null>(null);

  const { data: requests = [], isLoading } = useQuery<ApprovalRequest[]>({
    queryKey: ['approval-requests', 'production-pending'],
    queryFn: async () => {
      const all: ApprovalRequest[] = (await api.get('/approvals/requests', { params: { status: 'Pending' } })).data;
      return (Array.isArray(all) ? all : []).filter((r) => r.documentType === 'ProductionRun');
    },
    refetchInterval: 30000,
  });

  // Map id → {name, unit} untuk menampilkan nama item (payload hanya simpan id).
  const { data: itemMap = {} } = useQuery<Record<string, { name: string; unit: string }>>({
    queryKey: ['inventory-items-namemap'],
    queryFn: async () => {
      const raw = (await api.get('/inventory/items')).data;
      const arr: any[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
      const m: Record<string, { name: string; unit: string }> = {};
      for (const it of arr) m[it.id] = { name: it.name, unit: it.unit };
      return m;
    },
    staleTime: 5 * 60 * 1000,
  });
  const itemName = (id: string) => itemMap[id]?.name ?? `(item ${id?.slice?.(0, 8) ?? '?'})`;
  const itemUnit = (id: string) => itemMap[id]?.unit ?? 'kg';

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ['approval-requests'] });
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
    mutationFn: async (id: string) => (await api.post(`/approvals/requests/${id}/reject`, { notes: '' })).data,
    onSuccess: () => { toast.success('Ditolak.'); invalidateAll(); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal reject.'),
  });

  const pending = useMemo(() => requests.filter((r) => r.status === 'Pending'), [requests]);

  if (isLoading || pending.length === 0) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Clock size={16} className="text-amber-600" />
        <h3 className="text-sm font-semibold text-amber-800">
          Menunggu Persetujuan ({pending.length})
        </h3>
        <span className="text-xs text-amber-600">
          {isAdmin ? 'Tinjau & setujui sebelum jadi proses produksi resmi.' : 'Data ini menunggu persetujuan manajer.'}
        </span>
      </div>
      <div className="space-y-2">
        {pending.map((req) => {
          const { inputs, outputs } = summarize(req.payload);
          return (
            <div key={req.id} className="bg-white border border-amber-100 rounded-lg p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="font-medium text-gray-800">Data Produksi</span>
                  <span className="badge badge-yellow">Menunggu</span>
                  <span className="text-gray-400">
                    oleh {req.requester.fullName} • {fmtDate(req.createdAt)}
                  </span>
                </div>
                <div className="mt-1.5 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-0.5">
                  <span><span className="text-gray-400">Input:</span> {inputs.join(', ') || '—'}</span>
                  <span><span className="text-gray-400">Output:</span> {outputs.join(', ') || '—'}</span>
                </div>
              </div>
              <div className="flex gap-1.5 flex-shrink-0">
                <button
                  onClick={() => setDetailReq(req)}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 hover:bg-blue-50 rounded-lg"
                >
                  <Eye size={13} /> Detail
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => approveMut.mutate(req.id)}
                      disabled={approveMut.isPending || rejectMut.isPending}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg disabled:opacity-50"
                    >
                      {approveMut.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                      Setuju
                    </button>
                    <button
                      onClick={() => { if (confirm('Tolak data produksi ini? Data akan dibuang.')) rejectMut.mutate(req.id); }}
                      disabled={approveMut.isPending || rejectMut.isPending}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg disabled:opacity-50"
                    >
                      <X size={13} /> Tolak
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal detail pengajuan */}
      {detailReq && (() => {
        const p = detailReq.payload ?? {};
        const inputs: any[] = p.inputs ?? [];
        const outputs: any[] = p.outputs ?? [];
        const costs: any[] = p.costs ?? [];
        const basisLabel: Record<string, string> = { InputQty: 'per kg input', OutputQty: 'per kg output', Fixed: 'tetap' };
        return (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={() => setDetailReq(null)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">Detail Pengajuan Data Produksi</h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    oleh {detailReq.requester.fullName} ({detailReq.requester.role}) • {fmtDate(detailReq.createdAt)}
                  </p>
                </div>
                <button onClick={() => setDetailReq(null)} className="p-1 text-gray-400 hover:text-gray-600"><X size={18} /></button>
              </div>
              <div className="p-5 space-y-4 text-sm">
                {/* Info umum */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  {p.date && <div><span className="text-gray-400">Tanggal:</span> <span className="text-gray-800">{p.date}</span></div>}
                  {p.shift && <div><span className="text-gray-400">Shift:</span> <span className="text-gray-800">{p.shift}</span></div>}
                  {p.shiftLead && <div><span className="text-gray-400">Kepala Shift:</span> <span className="text-gray-800">{p.shiftLead}</span></div>}
                  {p.manpowerCount != null && <div><span className="text-gray-400">Jml Orang:</span> <span className="text-gray-800">{p.manpowerCount}</span></div>}
                  {p.notes && <div className="col-span-2"><span className="text-gray-400">Catatan:</span> <span className="text-gray-800">{p.notes}</span></div>}
                </div>

                {/* Input */}
                <div>
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">Bahan Baku (Input)</p>
                  <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                    {inputs.length === 0 ? <p className="px-3 py-2 text-xs text-gray-400">—</p> :
                      inputs.map((it, i) => (
                        <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                          <span className="text-gray-800">{itemName(it.itemId)}</span>
                          <span className="font-mono tabular-nums text-gray-600">{fmtNum(Number(it.quantity ?? 0))} {itemUnit(it.itemId)}</span>
                        </div>
                      ))}
                  </div>
                </div>

                {/* Output */}
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

                {/* Biaya */}
                {costs.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-1.5">Komponen Biaya</p>
                    <div className="border border-gray-100 rounded-lg divide-y divide-gray-50">
                      {costs.map((c, i) => (
                        <div key={i} className="px-3 py-2 flex items-center justify-between text-xs">
                          <span className="text-gray-800">{c.description ?? '—'}</span>
                          <span className="font-mono tabular-nums text-gray-600">
                            {formatRupiah(Number(c.rate ?? 0))} <span className="text-gray-400">{basisLabel[c.basis] ?? c.basis ?? ''}</span>
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="px-5 py-3 border-t border-gray-100 flex justify-end gap-2 sticky bottom-0 bg-white">
                {isAdmin && (
                  <>
                    <button
                      onClick={() => { rejectMut.mutate(detailReq.id); setDetailReq(null); }}
                      className="px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg"
                    >
                      Tolak
                    </button>
                    <button
                      onClick={() => { approveMut.mutate(detailReq.id); setDetailReq(null); }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                    >
                      <Check size={13} /> Setuju
                    </button>
                  </>
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
