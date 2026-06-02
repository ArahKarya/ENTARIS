import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Plus, Check, X, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { ConfirmDialog } from '../components/ConfirmDialog';

interface ApprovalRule {
  id: string;
  documentType: string;
  minAmount: number;
  requiredRole: string;
  isActive: boolean;
}

interface ApprovalRequest {
  id: string;
  documentType: string;
  documentId: string | null;
  documentNumber: string | null;
  amount: number | null;
  payload?: unknown;
  status: string;
  requestedBy: string;
  requester: { fullName: string; role: string };
  approver?: { fullName: string } | null;
  rejecter?: { fullName: string } | null;
  notes: string | null;
  decidedAt: string | null;
  createdAt: string;
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 });
const fmtDate = (d: string) => new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

const docTypes = [
  { value: 'PurchaseInvoice', label: 'Invoice Pembelian' },
  { value: 'ProductionRun', label: 'Data Produksi' },
  { value: 'SalesInvoice', label: 'Invoice Penjualan' },
  { value: 'Payment', label: 'Pembayaran' },
  { value: 'JournalEntry', label: 'Jurnal Umum' },
];

// Ringkas isi payload submit jadi teks supaya manajer bisa double-check.
function summarizePayload(documentType: string, payload: any): string[] {
  if (!payload || typeof payload !== 'object') return [];
  const lines: string[] = [];
  if (documentType === 'PurchaseInvoice') {
    if (payload.date) lines.push(`Tanggal: ${payload.date}`);
    if (payload.invoiceNumber) lines.push(`No: ${payload.invoiceNumber}`);
    (payload.items ?? []).forEach((it: any) => {
      lines.push(`• ${it.itemName ?? '-'} — ${Number(it.quantity ?? 0).toLocaleString('id-ID')} ${it.unit ?? ''} × ${Number(it.rate ?? 0).toLocaleString('id-ID')} = ${Number(it.amount ?? 0).toLocaleString('id-ID')}`);
    });
    if (payload.biayaLain) lines.push(`Biaya lain: ${Number(payload.biayaLain).toLocaleString('id-ID')}`);
  } else if (documentType === 'ProductionRun') {
    if (payload.date) lines.push(`Tanggal: ${payload.date}`);
    (payload.inputs ?? []).forEach((it: any) => lines.push(`Input: ${Number(it.quantity ?? 0).toLocaleString('id-ID')} kg (item ${it.itemId?.slice?.(0, 8) ?? '-'})`));
    (payload.outputs ?? []).forEach((it: any) => lines.push(`Output: ${Number(it.quantity ?? 0).toLocaleString('id-ID')} kg${it.isByProduct ? ' (by-product)' : ''}`));
  }
  return lines;
}

const roles = ['Admin', 'Accountant'];

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'requests' | 'rules'>('requests');
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);

  const { data: requests = [] } = useQuery<ApprovalRequest[]>({
    queryKey: ['approval-requests'],
    queryFn: async () => (await api.get('/approvals/requests')).data,
  });

  const { data: rules = [] } = useQuery<ApprovalRule[]>({
    queryKey: ['approval-rules'],
    queryFn: async () => (await api.get('/approvals/rules')).data,
    enabled: tab === 'rules',
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) => (await api.post(`/approvals/requests/${id}/approve`, { notes: '' })).data,
    onSuccess: (data: any) => {
      toast.success(data?.createdDocument ? `Disetujui — dokumen ${data.createdDocument.number} dibuat.` : 'Request disetujui');
      qc.invalidateQueries({ queryKey: ['approval-requests'] });
      // Dokumen baru dibuat saat approve → refresh daftar terkait.
      qc.invalidateQueries({ queryKey: ['purchase-invoices'] });
      qc.invalidateQueries({ queryKey: ['production-runs'] });
      qc.invalidateQueries({ queryKey: ['inventory-items'] });
      qc.invalidateQueries({ queryKey: ['stock-movements'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal approve'),
  });

  const rejectMut = useMutation({
    mutationFn: async (id: string) => (await api.post(`/approvals/requests/${id}/reject`, { notes: '' })).data,
    onSuccess: () => { toast.success('Request ditolak'); qc.invalidateQueries({ queryKey: ['approval-requests'] }); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Gagal reject'),
  });

  const createRuleMut = useMutation({
    mutationFn: async (data: Record<string, unknown>) => (await api.post('/approvals/rules', data)).data,
    onSuccess: () => { toast.success('Aturan dibuat'); qc.invalidateQueries({ queryKey: ['approval-rules'] }); setShowRuleForm(false); },
    onError: () => toast.error('Gagal membuat aturan'),
  });

  const deleteRuleMut = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/approvals/rules/${id}`)).data,
    onSuccess: () => { toast.success('Aturan dihapus'); qc.invalidateQueries({ queryKey: ['approval-rules'] }); },
  });

  const handleCreateRule = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createRuleMut.mutate({
      documentType: fd.get('documentType'),
      minAmount: Number(fd.get('minAmount')),
      requiredRole: fd.get('requiredRole'),
    });
  };

  const pending = requests.filter((r) => r.status === 'Pending');

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck size={24} className="text-blue-600" />
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Approval Workflow</h1>
        {pending.length > 0 && <span className="badge badge-yellow">{pending.length} pending</span>}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b" style={{ borderColor: 'var(--color-border)' }}>
        {[
          { key: 'requests' as const, label: 'Request Approval', icon: ShieldCheck },
          { key: 'rules' as const, label: 'Aturan', icon: Settings2 },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn('flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t.key ? 'border-blue-600 text-blue-600' : 'border-transparent'
            )}
            style={tab !== t.key ? { color: 'var(--color-text-muted)' } : undefined}
          >
            <t.icon size={16} /> {t.label}
          </button>
        ))}
      </div>

      {/* Requests Tab */}
      {tab === 'requests' && (
        <div className="space-y-2">
          {requests.length === 0 ? (
            <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Belum ada request approval.</div>
          ) : requests.map((req) => (
            <div key={req.id} className="card p-4">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>{req.documentNumber}</span>
                    <span className="badge badge-blue">{docTypes.find((d) => d.value === req.documentType)?.label || req.documentType}</span>
                    <span className={cn('badge',
                      req.status === 'Pending' ? 'badge-yellow' :
                      req.status === 'Approved' ? 'badge-green' : 'badge-red'
                    )}>{req.status}</span>
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>
                    {req.documentType === 'ProductionRun' ? `${fmt(Number(req.amount ?? 0))} kg input` : `Rp ${fmt(Number(req.amount ?? 0))}`} | Oleh: {req.requester.fullName} ({req.requester.role}) | {fmtDate(req.createdAt)}
                    {req.approver && ` | Disetujui: ${req.approver.fullName}`}
                    {req.rejecter && ` | Ditolak: ${req.rejecter.fullName}`}
                  </p>
                  {req.status === 'Pending' && req.payload != null && (() => {
                    const lines = summarizePayload(req.documentType, req.payload);
                    return lines.length > 0 ? (
                      <details className="mt-2 text-xs">
                        <summary className="cursor-pointer select-none" style={{ color: 'var(--color-text-secondary)' }}>Lihat detail input ({lines.length} baris)</summary>
                        <div className="mt-1 pl-2 border-l-2 space-y-0.5" style={{ borderColor: 'var(--color-border)', color: 'var(--color-text-muted)' }}>
                          {lines.map((l, i) => <div key={i}>{l}</div>)}
                        </div>
                      </details>
                    ) : null;
                  })()}
                </div>
                {req.status === 'Pending' && (
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => approveMut.mutate(req.id)} className="btn-primary text-xs py-1.5 px-3" disabled={approveMut.isPending}>
                      <Check size={14} /> Setuju
                    </button>
                    <button onClick={() => rejectMut.mutate(req.id)} className="btn-secondary text-xs py-1.5 px-3 text-red-600" disabled={rejectMut.isPending}>
                      <X size={14} /> Tolak
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Rules Tab */}
      {tab === 'rules' && (
        <div>
          <div className="flex justify-end mb-4">
            <button onClick={() => setShowRuleForm(!showRuleForm)} className="btn-primary text-sm">
              <Plus size={16} /> Tambah Aturan
            </button>
          </div>

          {showRuleForm && (
            <form onSubmit={handleCreateRule} className="card p-4 mb-4 flex flex-wrap gap-4 items-end">
              <div>
                <label className="text-xs font-medium block mb-1">Tipe Dokumen</label>
                <select name="documentType" required className="border rounded-lg px-3 py-2 text-sm">
                  {docTypes.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Min. Nominal (Rp)</label>
                <input name="minAmount" type="number" required min="0" className="border rounded-lg px-3 py-2 text-sm w-40" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Role yang Dibutuhkan</label>
                <select name="requiredRole" required className="border rounded-lg px-3 py-2 text-sm">
                  {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <button type="submit" className="btn-primary text-sm" disabled={createRuleMut.isPending}>Simpan</button>
            </form>
          )}

          {rules.length === 0 ? (
            <div className="card p-8 text-center" style={{ color: 'var(--color-text-muted)' }}>Belum ada aturan approval.</div>
          ) : (
            <div className="card overflow-hidden">
              <div className="table-responsive">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Tipe Dokumen</th>
                      <th className="text-right">Min. Nominal</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rules.map((rule) => (
                      <tr key={rule.id}>
                        <td>{docTypes.find((d) => d.value === rule.documentType)?.label || rule.documentType}</td>
                        <td className="text-right tabular-nums">Rp {fmt(Number(rule.minAmount))}</td>
                        <td><span className="badge badge-blue">{rule.requiredRole}</span></td>
                        <td><span className={cn('badge', rule.isActive ? 'badge-green' : 'badge-gray')}>{rule.isActive ? 'Aktif' : 'Nonaktif'}</span></td>
                        <td>
                          <button onClick={() => setDeleteRuleId(rule.id)}
                            className="text-xs text-red-500 hover:text-red-700">Hapus</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={deleteRuleId !== null}
        title="Hapus Aturan Approval"
        message="Hapus aturan ini? Tindakan ini tidak bisa dibatalkan."
        confirmLabel="Ya, Hapus"
        variant="danger"
        onCancel={() => setDeleteRuleId(null)}
        onConfirm={() => {
          if (deleteRuleId) deleteRuleMut.mutate(deleteRuleId);
          setDeleteRuleId(null);
        }}
      />
    </div>
  );
}
