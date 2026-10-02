import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import { cn } from '../lib/utils';
import {
  Scale,
  Plus,
  ArrowLeft,
  Check,
  Loader2,
  Trash2,
  CheckCircle2,
  Link2,
  Unlink,
  CreditCard,
  Building2,
  AlertTriangle,
  FileText,
} from 'lucide-react';
import ReconciliationModal from '../components/ReconciliationModal';
import { ConfirmDialog } from '../components/ConfirmDialog';

// ─── Types ───────────────────────────────────────────────────────────────────

interface Reconciliation {
  id: string;
  accountId: string;
  account: { id: string; name: string; accountNumber: string; balance: number };
  statementDate: string;
  statementBalance: number;
  bookBalance: number;
  status: string;
  notes: string | null;
  _count?: { items: number };
  items?: ReconciliationItem[];
  unmatchedLedgerEntries?: LedgerEntry[];
  createdAt: string;
}

interface ReconciliationItem {
  id: string;
  reconciliationId: string;
  ledgerEntryId: string | null;
  isMatched: boolean;
  statementAmount: number | null;
  statementDesc: string | null;
  statementDate: string | null;
}

interface LedgerEntry {
  id: string;
  date: string;
  debit: number;
  credit: number;
  description: string | null;
  referenceType: string;
  referenceId: string;
}

// ─── Detail View ─────────────────────────────────────────────────────────────

const ReconciliationDetail: React.FC<{ id: string; onBack: () => void }> = ({ id, onBack }) => {
  const queryClient = useQueryClient();
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [addingItems, setAddingItems] = useState(false);
  const [newItems, setNewItems] = useState([{ amount: '', desc: '', date: '' }]);

  const { data: detail, isLoading } = useQuery<Reconciliation>({
    queryKey: ['reconciliation', id],
    queryFn: async () => {
      const res = await api.get(`/reconciliation/${id}`);
      return res.data;
    },
  });

  const matchMutation = useMutation({
    mutationFn: async ({ itemId, ledgerEntryId }: { itemId: string; ledgerEntryId: string }) =>
      api.patch(`/reconciliation/${id}/match`, { itemId, ledgerEntryId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', id] });
      toast.success('Item berhasil dicocokkan.');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal mencocokkan.'),
  });

  const unmatchMutation = useMutation({
    mutationFn: async (itemId: string) =>
      api.patch(`/reconciliation/${id}/unmatch`, { itemId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', id] });
      toast.success('Pencocokan dibatalkan.');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal membatalkan pencocokan.'),
  });

  const completeMutation = useMutation({
    mutationFn: async () => api.post(`/reconciliation/${id}/complete`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', id] });
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      toast.success('Rekonsiliasi selesai.');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal menyelesaikan rekonsiliasi.'),
  });

  const addItemsMutation = useMutation({
    mutationFn: async (items: Array<{ statementAmount: number; statementDesc: string | null; statementDate: string | null }>) =>
      api.post(`/reconciliation/${id}/items`, { items }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliation', id] });
      setAddingItems(false);
      setNewItems([{ amount: '', desc: '', date: '' }]);
      toast.success('Item statement berhasil ditambahkan.');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal menambah item.'),
  });

  const handleAddItems = () => {
    const valid = newItems.filter((i) => i.amount !== '');
    if (valid.length === 0) {
      toast.error('Minimal satu item harus diisi.');
      return;
    }
    addItemsMutation.mutate(
      valid.map((i) => ({
        statementAmount: parseFloat(i.amount),
        statementDesc: i.desc || null,
        statementDate: i.date || null,
      }))
    );
  };

  if (isLoading) {
    return (
      <div className="py-16 flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
        <Loader2 className="animate-spin" size={18} /> Memuat detail...
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="py-16 text-center" style={{ color: 'var(--color-text-muted)' }}>
        Rekonsiliasi tidak ditemukan.
      </div>
    );
  }

  const difference = Number(detail.statementBalance) - Number(detail.bookBalance);
  const matchedCount = detail.items?.filter((i) => i.isMatched).length || 0;
  const totalItems = detail.items?.length || 0;
  const isDraft = detail.status === 'Draft';

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft size={18} style={{ color: 'var(--color-text-muted)' }} />
          </button>
          <div>
            <h2 className="text-base sm:text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              {detail.account.accountNumber} - {detail.account.name}
            </h2>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              Statement per {formatDate(detail.statementDate)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn('badge', detail.status === 'Completed' ? 'badge-green' : 'badge-yellow')}>
            {detail.status === 'Completed' ? 'Selesai' : 'Draft'}
          </span>
          {isDraft && (
            <button
              onClick={() => setConfirmComplete(true)}
              className="btn-primary text-xs py-1.5 px-3"
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Selesai
            </button>
          )}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
              <CreditCard size={14} className="text-blue-600" />
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Saldo Buku</span>
          </div>
          <p className="text-lg font-semibold tabular-nums text-blue-600">{formatRupiah(Number(detail.bookBalance))}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
              <Building2 size={14} className="text-green-600" />
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Saldo Statement</span>
          </div>
          <p className="text-lg font-semibold tabular-nums text-green-600">{formatRupiah(Number(detail.statementBalance))}</p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-orange-50 flex items-center justify-center">
              <AlertTriangle size={14} className="text-orange-600" />
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Selisih</span>
          </div>
          <p className={cn('text-lg font-semibold tabular-nums', Math.abs(difference) < 0.01 ? 'text-green-600' : 'text-orange-600')}>
            {formatRupiah(difference)}
          </p>
        </div>
        <div className="rounded-xl border p-4" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <div className="flex items-center gap-2 mb-2">
            <div className="w-7 h-7 rounded-lg bg-purple-50 flex items-center justify-center">
              <CheckCircle2 size={14} className="text-purple-600" />
            </div>
            <span className="text-xs font-medium" style={{ color: 'var(--color-text-muted)' }}>Item Tercocokkan</span>
          </div>
          <p className="text-lg font-semibold tabular-nums text-purple-600">
            {matchedCount} / {totalItems}
          </p>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Book Transactions */}
        <div className="rounded-xl border" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Transaksi Buku
            </h3>
            <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
              {detail.unmatchedLedgerEntries?.length || 0} transaksi belum dicocokkan
            </p>
          </div>
          <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: 'var(--color-border)' }}>
            {(!detail.unmatchedLedgerEntries || detail.unmatchedLedgerEntries.length === 0) ? (
              <div className="py-8 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Semua transaksi sudah dicocokkan
              </div>
            ) : (
              detail.unmatchedLedgerEntries.map((entry) => {
                const amount = Number(entry.debit) - Number(entry.credit);
                return (
                  <div key={entry.id} className="px-4 py-3 flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {entry.description || entry.referenceType}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                        {formatDate(entry.date)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 ml-2">
                      <span className={cn('text-xs font-semibold tabular-nums', amount >= 0 ? 'text-blue-600' : 'text-red-600')}>
                        {formatRupiah(amount)}
                      </span>
                      {isDraft && (
                        <button
                          onClick={() => {
                            // Find first unmatched statement item to pair with
                            const unmatched = detail.items?.find((i) => !i.isMatched);
                            if (unmatched) {
                              matchMutation.mutate({ itemId: unmatched.id, ledgerEntryId: entry.id });
                            } else {
                              toast.error('Tidak ada item statement yang belum dicocokkan. Tambahkan item statement terlebih dahulu.');
                            }
                          }}
                          disabled={matchMutation.isPending}
                          className="text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-2 py-1 rounded transition-colors flex items-center gap-1"
                        >
                          <Link2 size={11} /> Cocokkan
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Statement Items */}
        <div className="rounded-xl border" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
            <div>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                Mutasi Bank
              </h3>
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {totalItems} item statement
              </p>
            </div>
            {isDraft && (
              <button onClick={() => setAddingItems(true)} className="btn-secondary text-xs py-1 px-2">
                <Plus size={13} /> Tambah Item
              </button>
            )}
          </div>

          {/* Add items inline form */}
          {addingItems && (
            <div className="px-4 py-3 border-b space-y-2" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
              {newItems.map((item, idx) => (
                <div key={idx} className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                  <input
                    type="date"
                    value={item.date}
                    onChange={(e) => {
                      const updated = [...newItems];
                      updated[idx] = { ...updated[idx], date: e.target.value };
                      setNewItems(updated);
                    }}
                    className="w-28 px-2 py-1.5 text-xs rounded border focus:ring-2 focus:ring-blue-400 outline-none"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                  <input
                    type="text"
                    value={item.desc}
                    onChange={(e) => {
                      const updated = [...newItems];
                      updated[idx] = { ...updated[idx], desc: e.target.value };
                      setNewItems(updated);
                    }}
                    placeholder="Keterangan"
                    className="flex-1 px-2 py-1.5 text-xs rounded border focus:ring-2 focus:ring-blue-400 outline-none"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                  <input
                    type="number"
                    value={item.amount}
                    onChange={(e) => {
                      const updated = [...newItems];
                      updated[idx] = { ...updated[idx], amount: e.target.value };
                      setNewItems(updated);
                    }}
                    placeholder="Jumlah"
                    className="w-28 px-2 py-1.5 text-xs rounded border focus:ring-2 focus:ring-blue-400 outline-none"
                    style={{
                      backgroundColor: 'var(--color-bg-primary)',
                      borderColor: 'var(--color-border)',
                      color: 'var(--color-text-primary)',
                    }}
                  />
                  {newItems.length > 1 && (
                    <button
                      onClick={() => setNewItems(newItems.filter((_, i) => i !== idx))}
                      className="p-1 text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              ))}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNewItems([...newItems, { amount: '', desc: '', date: '' }])}
                  className="text-xs text-blue-600 hover:text-blue-800"
                >
                  + Baris baru
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => { setAddingItems(false); setNewItems([{ amount: '', desc: '', date: '' }]); }}
                  className="btn-secondary text-xs py-1 px-2"
                >
                  Batal
                </button>
                <button
                  onClick={handleAddItems}
                  disabled={addItemsMutation.isPending}
                  className="btn-primary text-xs py-1 px-2"
                >
                  {addItemsMutation.isPending ? <Loader2 size={12} className="animate-spin" /> : null}
                  Simpan
                </button>
              </div>
            </div>
          )}

          <div className="divide-y max-h-96 overflow-y-auto" style={{ borderColor: 'var(--color-border)' }}>
            {(!detail.items || detail.items.length === 0) ? (
              <div className="py-8 text-center text-xs" style={{ color: 'var(--color-text-muted)' }}>
                Belum ada item statement
              </div>
            ) : (
              detail.items.map((item) => (
                <div key={item.id} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {item.isMatched ? (
                      <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="text-xs font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {item.statementDesc || 'Tanpa keterangan'}
                      </p>
                      {item.statementDate && (
                        <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                          {formatDate(item.statementDate)}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-2">
                    <span className="text-xs font-semibold tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                      {formatRupiah(Number(item.statementAmount || 0))}
                    </span>
                    {isDraft && item.isMatched && (
                      <button
                        onClick={() => unmatchMutation.mutate(item.id)}
                        disabled={unmatchMutation.isPending}
                        className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-1.5 py-0.5 rounded transition-colors flex items-center gap-1"
                      >
                        <Unlink size={10} /> Batalkan
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirmComplete}
        title="Selesaikan Rekonsiliasi"
        message="Apakah Anda yakin ingin menyelesaikan rekonsiliasi ini? Status akan berubah menjadi Completed dan tidak dapat diubah kembali."
        confirmLabel="Selesaikan"
        variant="danger"
        onConfirm={() => { completeMutation.mutate(); setConfirmComplete(false); }}
        onCancel={() => setConfirmComplete(false)}
      />
    </div>
  );
};

// ─── Main Page ───────────────────────────────────────────────────────────────

export const BankReconciliation: React.FC = () => {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data, isLoading } = useQuery<{ data: Reconciliation[]; total: number }>({
    queryKey: ['reconciliations'],
    queryFn: async () => {
      const res = await api.get('/reconciliation');
      return res.data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/reconciliation/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['reconciliations'] });
      toast.success('Rekonsiliasi berhasil dihapus.');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Gagal menghapus.'),
  });

  if (selectedId) {
    return (
      <ReconciliationDetail
        id={selectedId}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div className="space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Scale size={18} style={{ color: 'var(--color-text-muted)' }} />
          <div>
            <h1 className="text-xl font-semibold" style={{ color: 'var(--color-text-primary)' }}>Rekonsiliasi Bank</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
              Cocokkan transaksi buku dengan mutasi bank.
            </p>
          </div>
        </div>
        <button onClick={() => setIsModalOpen(true)} className="btn-primary self-start">
          <Plus size={15} /> Rekonsiliasi Baru
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden" style={{ backgroundColor: 'var(--color-bg-primary)', borderColor: 'var(--color-border)' }}>
        {isLoading ? (
          <div className="py-16 flex items-center justify-center gap-2 text-sm" style={{ color: 'var(--color-text-muted)' }}>
            <Loader2 className="animate-spin" size={18} /> Memuat...
          </div>
        ) : (
         <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th>Akun</th>
                <th>Tanggal Statement</th>
                <th className="text-right">Saldo Buku</th>
                <th className="text-right">Saldo Statement</th>
                <th className="text-right">Selisih</th>
                <th className="text-center">Status</th>
                <th className="text-center">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {(!data?.data || data.data.length === 0) ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center" style={{ color: 'var(--color-text-muted)' }}>
                    <div className="flex flex-col items-center gap-2">
                      <FileText size={24} style={{ color: 'var(--color-text-muted)' }} />
                      <span className="text-sm">Belum ada rekonsiliasi</span>
                    </div>
                  </td>
                </tr>
              ) : (
                data.data.map((recon) => {
                  const diff = Number(recon.statementBalance) - Number(recon.bookBalance);
                  return (
                    <tr
                      key={recon.id}
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                      onClick={() => setSelectedId(recon.id)}
                    >
                      <td>
                        <div className="font-medium" style={{ color: 'var(--color-text-primary)' }}>
                          {recon.account.name}
                        </div>
                        <div className="text-xs font-mono" style={{ color: 'var(--color-text-muted)' }}>
                          {recon.account.accountNumber}
                        </div>
                      </td>
                      <td style={{ color: 'var(--color-text-secondary)' }}>{formatDate(recon.statementDate)}</td>
                      <td className="text-right tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                        {formatRupiah(Number(recon.bookBalance))}
                      </td>
                      <td className="text-right tabular-nums" style={{ color: 'var(--color-text-primary)' }}>
                        {formatRupiah(Number(recon.statementBalance))}
                      </td>
                      <td className={cn('text-right tabular-nums', Math.abs(diff) < 0.01 ? 'text-green-600' : 'text-orange-600')}>
                        {formatRupiah(diff)}
                      </td>
                      <td className="text-center">
                        <span className={cn('badge', recon.status === 'Completed' ? 'badge-green' : 'badge-yellow')}>
                          {recon.status === 'Completed' ? 'Selesai' : 'Draft'}
                        </span>
                      </td>
                      <td className="text-center">
                        {recon.status === 'Draft' && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setConfirmDelete(recon.id); }}
                            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Hapus"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
         </div>
        )}
      </div>

      <ReconciliationModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Hapus Rekonsiliasi"
        message="Yakin ingin menghapus rekonsiliasi ini? Data yang sudah dicocokkan akan hilang."
        confirmLabel="Hapus"
        variant="danger"
        onConfirm={() => { if (confirmDelete) deleteMutation.mutate(confirmDelete); setConfirmDelete(null); }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
};
