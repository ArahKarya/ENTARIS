import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, Plus, Settings2 } from 'lucide-react';
import { toast } from 'sonner';
import api from '../lib/api';
import { cn } from '../lib/utils';
import { ConfirmDialog } from '../components/ConfirmDialog';
import ApprovalPanel, { type ApprovalRequest } from '../components/ApprovalPanel';
import InvoiceDetailDrawer from '../components/InvoiceDetailDrawer';
import ProductionDetailDrawer from '../components/ProductionDetailDrawer';

interface ApprovalRule {
  id: string;
  documentType: string;
  minAmount: number;
  requiredRole: string;
  isActive: boolean;
}

const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 0 });

const docTypes = [
  { value: 'PurchaseInvoice', label: 'Invoice Pembelian' },
  { value: 'ProductionRun', label: 'Data Produksi' },
  { value: 'SalesInvoice', label: 'Invoice Penjualan' },
  { value: 'Payment', label: 'Pembayaran' },
  { value: 'JournalEntry', label: 'Jurnal Umum' },
];

const roles = ['Admin', 'Accountant'];

export default function ApprovalsPage() {
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const focusRequestId = searchParams.get('request') ?? undefined;
  const clearFocus = () => {
    const next = new URLSearchParams(searchParams);
    next.delete('request');
    setSearchParams(next, { replace: true });
  };
  const [tab, setTab] = useState<'requests' | 'rules'>('requests');
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [deleteRuleId, setDeleteRuleId] = useState<string | null>(null);
  const [viewInvoiceId, setViewInvoiceId] = useState<string | null>(null);
  const [viewRunId, setViewRunId] = useState<string | null>(null);
  const userRole = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user') || 'null')?.role; } catch { return undefined; }
  }, []);

  const { data: rules = [] } = useQuery<ApprovalRule[]>({
    queryKey: ['approval-rules'],
    queryFn: async () => (await api.get('/approvals/rules')).data,
    enabled: tab === 'rules',
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

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <ShieldCheck size={24} className="text-blue-600" />
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-primary)' }}>Approval Workflow</h1>
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

      {/* Requests Tab — pakai ApprovalPanel (semua tipe, sub-tab status) */}
      {tab === 'requests' && (
        <ApprovalPanel
          userRole={userRole}
          focusRequestId={focusRequestId}
          onFocusHandled={clearFocus}
          onViewDocument={(req: ApprovalRequest) => {
            if (!req.documentId) return;
            if (req.documentType === 'PurchaseInvoice') setViewInvoiceId(req.documentId);
            else if (req.documentType === 'ProductionRun') setViewRunId(req.documentId);
          }}
        />
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

      {/* Drawer dokumen final (dari tombol "Lihat Dokumen") */}
      <InvoiceDetailDrawer type="purchase" invoiceId={viewInvoiceId} onClose={() => setViewInvoiceId(null)} />
      <ProductionDetailDrawer runId={viewRunId} onClose={() => setViewRunId(null)} />
    </div>
  );
}
