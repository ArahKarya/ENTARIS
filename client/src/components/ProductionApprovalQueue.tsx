import { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Check, X, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';

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

  const { data: requests = [], isLoading } = useQuery<ApprovalRequest[]>({
    queryKey: ['approval-requests', 'production-pending'],
    queryFn: async () => {
      const all: ApprovalRequest[] = (await api.get('/approvals/requests', { params: { status: 'Pending' } })).data;
      return (Array.isArray(all) ? all : []).filter((r) => r.documentType === 'ProductionRun');
    },
    refetchInterval: 30000,
  });

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
              {isAdmin && (
                <div className="flex gap-1.5 flex-shrink-0">
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
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
