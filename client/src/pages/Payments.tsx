import { useState, useMemo } from 'react';
import { Search, XCircle, CreditCard, TrendingDown, TrendingUp, ArrowRightLeft, FileText, Wallet, Paperclip } from 'lucide-react';
import { cn } from '../lib/utils';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { formatRupiah, formatDate } from '../lib/formatters';
import PaymentModal from '../components/PaymentModal';
import TransferModal from '../components/TransferModal';
import TableRowSkeleton from '../components/TableRowSkeleton';
import { useDebounce } from '../hooks/useDebounce';
import ExpenseModal from '../components/ExpenseModal';
import BulkExpenseModal from '../components/BulkExpenseModal';
import { Layers } from 'lucide-react';
import VendorDepositModal from '../components/VendorDepositModal';
import { ConfirmDialog } from '../components/ConfirmDialog';
import PaymentDetailDrawer from '../components/PaymentDetailDrawer';

const getUserRole = (): string | null => {
  try { return JSON.parse(localStorage.getItem('user') || 'null')?.role ?? null; }
  catch { return null; }
};

interface CashTransaction {
  id: string;
  date: string;
  number: string;
  partyName: string | null;
  partyType: string | null;
  type: 'Receive' | 'Pay' | 'VendorDeposit' | 'Expense' | 'Transfer';
  amount: number;
  status: string;
  source: 'payment' | 'journal';
}

export const Payments = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 200);
  const [isReceiveOpen, setIsReceiveOpen] = useState(false);
  const [isPayOpen, setIsPayOpen] = useState(false);
  const [isExpenseOpen, setIsExpenseOpen] = useState(false);
  const [isBulkExpenseOpen, setIsBulkExpenseOpen] = useState(false);
  const [isTransferOpen, setIsTransferOpen] = useState(false);
  const [isDepositOpen, setIsDepositOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<CashTransaction | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const role = getUserRole();
  const canCancel = role === 'Admin';

  const cancelPaymentMutation = useMutation({
    mutationFn: (id: string) => api.post(`/payments/${id}/cancel`),
    onSuccess: () => {
      toast.success('Pembayaran berhasil dibatalkan.');
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      queryClient.invalidateQueries({ queryKey: ['cash-journals'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['coa'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Gagal membatalkan pembayaran.');
    },
  });

  const { data: payments, isLoading: loadingPayments } = useQuery({
    queryKey: ['payments'],
    queryFn: async () => {
      const response = await api.get('/payments');
      return response.data.data ?? response.data;
    },
  });

  const { data: cashJournals, isLoading: loadingJournals } = useQuery({
    queryKey: ['cash-journals'],
    queryFn: async () => {
      const response = await api.get('/payments/cash-journals');
      return response.data.data ?? response.data;
    },
  });

  const isLoading = loadingPayments || loadingJournals;

  // Fetch attachment counts for all payments + journals
  const paymentIds = useMemo(() => (payments || []).map((p: any) => p.id), [payments]);
  const journalIds = useMemo(() => (cashJournals || []).map((j: any) => j.id), [cashJournals]);

  const { data: paymentAttCounts } = useQuery({
    queryKey: ['attachment-counts', 'payment', paymentIds],
    queryFn: async () => {
      const res = await api.post('/attachments/counts', { referenceType: 'payment', referenceIds: paymentIds });
      return res.data as Record<string, number>;
    },
    enabled: paymentIds.length > 0,
  });

  const { data: journalAttCounts } = useQuery({
    queryKey: ['attachment-counts', 'journal', journalIds],
    queryFn: async () => {
      const res = await api.post('/attachments/counts', { referenceType: 'journal', referenceIds: journalIds });
      return res.data as Record<string, number>;
    },
    enabled: journalIds.length > 0,
  });

  // Merge payments + cash-affecting journals into unified list
  const allTransactions: CashTransaction[] = useMemo(() => {
    const txns: CashTransaction[] = [];
    const paymentJournalIds = new Set<string>();

    if (payments) {
      for (const p of payments) {
        txns.push({
          id: p.id,
          date: p.date,
          number: p.paymentNumber,
          partyName: p.party?.name ?? null,
          partyType: p.party?.partyType ?? null,
          type: p.paymentType,
          amount: Number(p.amount),
          status: p.status,
          source: 'payment',
        });
        // Track journal IDs linked to payments to avoid duplicates
        if (p.journalEntryId) paymentJournalIds.add(p.journalEntryId);
      }
    }

    if (cashJournals) {
      for (const j of cashJournals) {
        if (paymentJournalIds.has(j.journalEntryId)) continue;
        txns.push({
          id: j.id,
          date: j.date,
          number: j.entryNumber,
          partyName: j.partyName ?? null,
          partyType: null,
          type: j.isCredit ? 'Expense' : 'Transfer',
          amount: j.amount,
          status: j.status,
          source: 'journal',
        });
      }
    }

    txns.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return txns;
  }, [payments, cashJournals]);

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Bank & Kas</h1>
          <p className="text-sm text-gray-500 mt-0.5">Pantau mutasi kas, pembayaran vendor, dan pelunasan piutang.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors"
            onClick={() => setIsDepositOpen(true)}
          >
            <Wallet size={15} /> Uang Muka
          </button>
          <button
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors"
            onClick={() => setIsTransferOpen(true)}
          >
            <ArrowRightLeft size={15} /> Pinbuk
          </button>
          <button className="btn-primary" onClick={() => setIsReceiveOpen(true)}>
            <TrendingDown size={15} /> Terima Pembayaran
          </button>
          <button
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
            onClick={() => setIsPayOpen(true)}
          >
            <TrendingUp size={15} /> Bayar Hutang
          </button>
          <button
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-orange-500 hover:bg-orange-600 text-white transition-colors"
            onClick={() => setIsExpenseOpen(true)}
          >
            <FileText size={15} /> Catat Pengeluaran
          </button>
          <button
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium bg-amber-500 hover:bg-amber-600 text-white transition-colors"
            onClick={() => setIsBulkExpenseOpen(true)}
            title="Input banyak pengeluaran sekaligus (petty cash)"
          >
            <Layers size={15} /> Input Banyak
          </button>
        </div>
      </div>

      {/* Info: cara kerja edit & pembatalan */}
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
        <p className="font-semibold mb-1">Cara kerja edit & pembatalan</p>
        <p className="leading-relaxed">
          Transaksi bank/kas tidak bisa diedit untuk menjaga integritas Buku Besar. Bila ada kesalahan,
          <b> batalkan transaksi lalu buat ulang</b>. Uang Muka Vendor/Pelanggan wajib dibatalkan dari modulnya
          masing-masing. Transaksi yang berasal dari jurnal manual (Beban, Pinbuk) dibatalkan dari Buku Besar.
          Hanya role <b>Admin</b> yang boleh membatalkan.
        </p>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Cari nomor transaksi atau pihak..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
       <div className="table-responsive">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">Tanggal</th>
              <th scope="col">Nomor</th>
              <th scope="col">Pihak Terkait</th>
              <th scope="col" className="text-center">Tipe</th>
              <th scope="col" className="text-right">Jumlah</th>
              <th scope="col" className="text-center">Status</th>
              <th scope="col" className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <TableRowSkeleton columns={7} rows={6} />
            ) : allTransactions.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-16 text-center">
                  <CreditCard className="w-10 h-10 text-gray-200 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">Belum ada transaksi bank/kas.</p>
                </td>
              </tr>
            ) : (
              allTransactions.filter((t) =>
                !debouncedSearch ||
                t.number?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
                t.partyName?.toLowerCase().includes(debouncedSearch.toLowerCase())
              ).map((txn) => {
                const isIncoming = txn.type === 'Receive';
                const isDeposit = txn.type === 'VendorDeposit';
                const typeLabel = txn.type === 'Receive' ? 'Masuk' : isDeposit ? 'Uang Muka' : txn.type === 'Expense' ? 'Beban' : txn.type === 'Transfer' ? 'Pinbuk' : 'Keluar';
                const badgeClass = isIncoming ? 'badge-green' : isDeposit ? 'badge-yellow' : txn.type === 'Expense' ? 'badge-yellow' : txn.type === 'Transfer' ? 'badge-blue' : 'badge-red';
                const icon = isIncoming ? <TrendingDown size={10} /> : isDeposit ? <Wallet size={10} /> : txn.type === 'Transfer' ? <ArrowRightLeft size={10} /> : <TrendingUp size={10} />;

                return (
                  <tr
                    key={`${txn.source}-${txn.id}`}
                    className={cn('cursor-pointer', txn.source === 'payment' && 'hover:bg-gray-50 dark:hover:bg-gray-800/30')}
                    onClick={() => { if (txn.source === 'payment') setDetailId(txn.id); }}
                  >
                    <td className="text-gray-500 whitespace-nowrap">{formatDate(txn.date)}</td>
                    <td className="whitespace-nowrap">
                      <span className="font-mono text-xs text-gray-800 bg-gray-50 px-1.5 py-0.5 rounded">{txn.number}</span>
                      {(() => {
                        const counts = txn.source === 'payment' ? paymentAttCounts : journalAttCounts;
                        const count = counts?.[txn.id] ?? 0;
                        return count > 0 ? (
                          <span className="inline-flex items-center gap-0.5 ml-1.5 text-blue-500" title={`${count} lampiran`}>
                            <Paperclip size={11} />
                            <span className="text-xs font-medium">{count}</span>
                          </span>
                        ) : null;
                      })()}
                    </td>
                    <td>
                      <span className="font-medium text-gray-800">{txn.partyName ?? '—'}</span>
                      {txn.partyType && <span className="text-xs text-gray-400 uppercase ml-1.5">{txn.partyType}</span>}
                    </td>
                    <td className="text-center">
                      <span className={cn('badge', badgeClass)}>
                        {icon}
                        {typeLabel}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className={cn(
                        'font-mono font-medium tabular-nums',
                        isIncoming ? 'text-green-600' : 'text-red-500'
                      )}>
                        {isIncoming ? '+' : '-'} {formatRupiah(txn.amount)}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className={cn('badge', txn.status === 'Cancelled' ? 'badge-red' : 'badge-blue')}>{txn.status}</span>
                    </td>
                    <td>
                      {txn.status === 'Cancelled' ? null : !canCancel ? null : (
                        <button
                          onClick={() => {
                            if (txn.type === 'VendorDeposit') {
                              toast.info('Batalkan dari modul Uang Muka Vendor.');
                              navigate('/vendor-deposits');
                              return;
                            }
                            if (txn.source === 'journal') {
                              toast.info('Transaksi ini dibuat dari jurnal. Batalkan dari Buku Besar.');
                              navigate('/gl');
                              return;
                            }
                            setCancelTarget(txn);
                          }}
                          className="p-1.5 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 transition-colors"
                          title="Batalkan"
                        >
                          <XCircle size={16} />
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
      </div>
      <PaymentModal
        isOpen={isReceiveOpen}
        onClose={() => setIsReceiveOpen(false)}
        defaultType="Receive"
      />
      <PaymentModal
        isOpen={isPayOpen}
        onClose={() => setIsPayOpen(false)}
        defaultType="Pay"
      />
      <ExpenseModal
        isOpen={isExpenseOpen}
        onClose={() => setIsExpenseOpen(false)}
      />
      <BulkExpenseModal
        isOpen={isBulkExpenseOpen}
        onClose={() => setIsBulkExpenseOpen(false)}
      />
      <TransferModal
        isOpen={isTransferOpen}
        onClose={() => setIsTransferOpen(false)}
      />
      <VendorDepositModal
        isOpen={isDepositOpen}
        onClose={() => setIsDepositOpen(false)}
      />
      <ConfirmDialog
        open={cancelTarget !== null}
        onCancel={() => setCancelTarget(null)}
        onConfirm={() => {
          if (cancelTarget) {
            cancelPaymentMutation.mutate(cancelTarget.id);
            setCancelTarget(null);
          }
        }}
        title="Batalkan Transaksi"
        message={`Batalkan ${cancelTarget?.number}? Alokasi ke faktur, saldo kas/bank, dan jurnal akan otomatis di-reverse. Tindakan tidak dapat dibatalkan.`}
        confirmLabel="Ya, Batalkan"
        variant="danger"
      />
      {detailId && (
        <PaymentDetailDrawer paymentId={detailId} onClose={() => setDetailId(null)} />
      )}
    </div>
  );
};
